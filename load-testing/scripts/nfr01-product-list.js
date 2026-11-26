import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { hasFullPage, listProducts, readJson } from './product-api.js';

const under500ms = new Rate('nfr01_request_under_500ms');
const requestFailed = new Rate('nfr01_request_failed');

export const options = {
  scenarios: {
    product_list: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '3m', target: 100 },
      ],
    },
  },
  thresholds: {
    'nfr01_request_under_500ms{phase:steady}': ['rate>=0.95'],
    'nfr01_request_failed{phase:steady}': ['rate<0.01'],
  },
};

export default function () {
  // Only requests started after the 30-second ramp-up belong to evaluation.
  const isSteadyState = exec.instance.currentTestRunDuration >= 30_000;
  const response = listProducts();
  const passed = check(response, {
    'List: HTTP 200': (res) => res.status === 200,
    'List: JSON contains a full page of products': (res) => hasFullPage(readJson(res)),
  });

  if (isSteadyState) {
    const tags = { phase: 'steady' };
    requestFailed.add(!passed, tags);
    // Keep failures in the denominator: a fast connection/HTTP/content failure
    // is not a response that met the NFR deadline.
    under500ms.add(passed && response.timings.duration < 500, tags);
  }
  sleep(3);
}
