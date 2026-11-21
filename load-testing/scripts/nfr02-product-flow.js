import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { getProduct, hasFullPage, hasSku, listProducts, load, readJson, searchProducts } from './product-api.js';

const keywords = (__ENV.SEARCH_KEYWORDS || 'Seed Chair')
  .split(',')
  .map((word) => word.trim())
  .filter(Boolean);

if (keywords.length === 0) {
  throw new Error('SEARCH_KEYWORDS must contain at least one keyword.');
}

const flowDuration = new Trend('nfr02_flow_duration', true);
const flowUnder1500ms = new Rate('nfr02_flow_under_1500ms');
const flowFailed = new Rate('nfr02_flow_failed');
const successfulFlows = new Counter('nfr02_flow_success_total');

export const options = {
  ...load,
  thresholds: {
    nfr02_flow_under_1500ms: ['rate>=0.95'],
    nfr02_flow_failed: ['rate<0.01'],
  },
};

function runFlow() {
  const list = listProducts();
  const listPassed = check(list, {
    'List: HTTP 200': (res) => res.status === 200,
    'List: JSON contains a full page of products': (res) => hasFullPage(readJson(res)),
  });
  if (!listPassed) {
    return false;
  }

  const selectionIndex = __VU - 1 + __ITER;
  const keyword = keywords[selectionIndex % keywords.length];
  const search = searchProducts(keyword);
  const products = readJson(search)?.products;
  const normalizedKeyword = keyword.toLowerCase();
  const matches = Array.isArray(products) ? products.filter((product) =>
    hasSku(product) &&
    typeof product.description?.name === 'string' &&
    product.description.name.toLowerCase().includes(normalizedKeyword)
  ) : [];
  const searchPassed = check(search, {
    'Search: HTTP 200': (res) => res.status === 200,
    'Search: matching product has a SKU': () => matches.length > 0,
  });
  if (!searchPassed) {
    return false;
  }

  const { sku } = matches[selectionIndex % matches.length];
  const detail = getProduct(sku);
  const detailPassed = check(detail, {
    'Detail: HTTP 200': (res) => res.status === 200,
    'Detail: response SKU matches search result': (res) => readJson(res)?.sku === sku,
  });
  if (!detailPassed) {
    return false;
  }

  const duration = list.timings.duration + search.timings.duration + detail.timings.duration;
  flowDuration.add(duration);
  flowUnder1500ms.add(duration < 1500);
  successfulFlows.add(1);
  return true;
}

export default function () {
  flowFailed.add(!runFlow());
  sleep(1);
}
