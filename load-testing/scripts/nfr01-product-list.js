import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { hasFullPage, listProducts, load, readJson } from './product-api.js';

const under200ms = new Rate('nfr01_request_under_200ms');
const requestFailed = new Rate('nfr01_request_failed');

export const options = {
  ...load,
  thresholds: {
    nfr01_request_under_200ms: ['rate>=0.95'],
    nfr01_request_failed: ['rate<0.01'],
  },
};

export default function () {
  const response = listProducts();
  const passed = check(response, {
    'List: HTTP 200': (res) => res.status === 200,
    'List: JSON contains a full page of products': (res) => hasFullPage(readJson(res)),
  });

  requestFailed.add(!passed);
  // A transport error leaves no response time to compare with the deadline.
  under200ms.add(response.status > 0 && response.timings.duration < 200);
  sleep(1);
}
