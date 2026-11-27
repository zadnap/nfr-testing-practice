import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';
import { getProduct, hasFullPage, hasSku, listProducts, readJson, searchProducts } from './product-api.js';

const RAMP_UP_MS = Number(__ENV.RAMP_UP_SEC || 30) * 1000;
const FLOW_SLA_MS = 1500;
const THINK_TIME_SEC = 3;
const SKU_STRATEGY = (__ENV.SKU_STRATEGY || 'round_robin').toLowerCase();

if (!['round_robin', 'random', 'first'].includes(SKU_STRATEGY)) {
  throw new Error(`Unsupported SKU_STRATEGY '${SKU_STRATEGY}'. Use round_robin, random, or first.`);
}

function loadKeywords() {
  if (__ENV.SEARCH_KEYWORDS && __ENV.SEARCH_KEYWORDS.trim().length > 0) {
    return __ENV.SEARCH_KEYWORDS.split(',')
      .map((word) => word.trim())
      .filter(Boolean);
  }

  return new SharedArray('nfr02_search_keywords', () => {
    const parsed = JSON.parse(open('../data/products.json'));
    const list = Array.isArray(parsed?.searchKeywords) && parsed.searchKeywords.length > 0
      ? parsed.searchKeywords
      : (parsed?.searchKeyword ? [parsed.searchKeyword] : []);
    return list.map((word) => String(word).trim()).filter(Boolean);
  });
}

const keywords = loadKeywords();
if (keywords.length === 0) {
  throw new Error('SEARCH_KEYWORDS must contain at least one keyword.');
}

const flowDuration = new Trend('nfr02_flow_duration', true);
const flowUnder1500ms = new Rate('nfr02_flow_under_1500ms');
const flowFailed = new Rate('nfr02_flow_failed');
const successfulFlows = new Counter('nfr02_flow_success_total');
const failedFlows = new Counter('nfr02_flow_failed_total');

const step1Duration = new Trend('nfr02_step1_list_duration', true);
const step2Duration = new Trend('nfr02_step2_search_duration', true);
const step3Duration = new Trend('nfr02_step3_detail_duration', true);

const connErrors = new Counter('nfr02_conn_error_total');
const httpErrors = new Counter('nfr02_http_error_total');
const validationErrors = new Counter('nfr02_validation_error_total');

export const options = {
  scenarios: {
    product_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '3m', target: 100 },
      ],
    },
  },
  thresholds: {
    'nfr02_flow_under_1500ms{phase:steady}': ['rate>=0.95'],
    'nfr02_flow_failed{phase:steady}': ['rate<0.01'],
  },
};

function classifyResponse(response) {
  if (!response || response.status === 0 || Boolean(response.error_code)) {
    return 'conn_error';
  }
  if (response.status !== 200) {
    return 'http_error';
  }
  return 'ok';
}

function recordStepFailure(transportStatus, tags, isSteadyState) {
  if (!isSteadyState) {
    return;
  }
  if (transportStatus === 'conn_error') {
    connErrors.add(1, tags);
  } else if (transportStatus === 'http_error') {
    httpErrors.add(1, tags);
  } else {
    validationErrors.add(1, tags);
  }
}

function selectProduct(eligible, selectionIndex, strategy) {
  if (eligible.length === 0) {
    return null;
  }
  if (strategy === 'first') {
    return eligible[0];
  }
  if (strategy === 'random') {
    return eligible[Math.floor(Math.random() * eligible.length)];
  }
  return eligible[selectionIndex % eligible.length];
}

function runFlow(tags, isSteadyState) {
  // Step 1: List products (page 0, count 20)
  const list = listProducts();
  const listStatus = classifyResponse(list);
  const listBody = listStatus === 'ok' ? readJson(list) : null;
  const listPassed = check(list, {
    'List: HTTP 200': () => listStatus === 'ok',
    'List: JSON contains a full page of products': () => hasFullPage(listBody),
  });
  if (!listPassed) {
    recordStepFailure(listStatus, tags, isSteadyState);
    return { passed: false };
  }
  if (isSteadyState) {
    step1Duration.add(list.timings.duration, tags);
  }

  // Step 2: Search products by prepared keyword, validate relevance, and pick a SKU
  const selectionIndex = __VU - 1 + __ITER;
  const keyword = keywords[selectionIndex % keywords.length];
  const normalizedKeyword = keyword.toLowerCase();
  const search = searchProducts(keyword);
  const searchStatus = classifyResponse(search);
  const searchBody = searchStatus === 'ok' ? readJson(search) : null;
  const products = Array.isArray(searchBody?.products) ? searchBody.products : [];

  const allRelevant = products.length > 0 && products.every((product) =>
    typeof product?.description?.name === 'string' &&
    product.description.name.toLowerCase().includes(normalizedKeyword)
  );
  const eligible = products.filter((product) =>
    hasSku(product) &&
    typeof product?.description?.name === 'string' &&
    product.description.name.toLowerCase().includes(normalizedKeyword)
  );
  const selected = selectProduct(eligible, selectionIndex, SKU_STRATEGY);

  const searchPassed = check(search, {
    'Search: HTTP 200': () => searchStatus === 'ok',
    'Search: all results match keyword': () => allRelevant,
    'Search: matching product has a valid SKU': () => selected !== null,
  });
  if (!searchPassed) {
    recordStepFailure(searchStatus, tags, isSteadyState);
    return { passed: false };
  }
  if (isSteadyState) {
    step2Duration.add(search.timings.duration, tags);
  }

  // Step 3: View product detail by selected SKU and verify consistency
  const detail = getProduct(selected.sku);
  const detailStatus = classifyResponse(detail);
  const detailBody = detailStatus === 'ok' ? readJson(detail) : null;

  const detailPassed = check(detail, {
    'Detail: HTTP 200': () => detailStatus === 'ok',
    'Detail: response SKU matches search result': () => detailBody?.sku === selected.sku,
    'Detail: response name and ID match search result': () =>
      typeof detailBody?.description?.name === 'string' &&
      detailBody.description.name === selected.description.name &&
      detailBody.description.name.toLowerCase().includes(normalizedKeyword) &&
      (selected.id == null || detailBody.id === selected.id),
    'Detail: response includes price': () =>
      detailBody?.finalPrice != null && String(detailBody.finalPrice).trim().length > 0,
  });
  if (!detailPassed) {
    recordStepFailure(detailStatus, tags, isSteadyState);
    return { passed: false };
  }
  if (isSteadyState) {
    step3Duration.add(detail.timings.duration, tags);
  }

  return {
    passed: true,
    duration: list.timings.duration + search.timings.duration + detail.timings.duration,
  };
}

export default function () {
  // Only flows started after the 30-second ramp-up belong to steady-state evaluation.
  const isSteadyState = exec.instance.currentTestRunDuration >= RAMP_UP_MS;
  const tags = { phase: 'steady' };
  const result = runFlow(tags, isSteadyState);

  if (isSteadyState) {
    flowFailed.add(!result.passed, tags);
    if (result.passed) {
      flowDuration.add(result.duration, tags);
      flowUnder1500ms.add(result.duration < FLOW_SLA_MS, tags);
      successfulFlows.add(1, tags);
    } else {
      failedFlows.add(1, tags);
    }
  }
  sleep(THINK_TIME_SEC);
}
