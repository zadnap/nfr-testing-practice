import http from 'k6/http';

const baseUrl = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const store = encodeURIComponent(__ENV.STORE || 'DEFAULT');
const lang = encodeURIComponent(__ENV.SHOPIZER_LANG || 'en');
const pageSize = Number(__ENV.PAGE_SIZE || 20);
const catalogQuery = `store=${store}&lang=${lang}`;
const listUrl = `${baseUrl}/api/v1/products?${catalogQuery}&page=0&count=${pageSize}`;

export const load = { vus: 20, duration: '3m' };

function get(url, step) {
  return http.get(url, {
    headers: { Accept: 'application/json' },
    redirects: 0,
    tags: { name: step },
  });
}

export function readJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export function hasSku(product) {
  return typeof product?.sku === 'string' && product.sku.trim().length > 0;
}

export function hasFullPage(body) {
  return Array.isArray(body?.products) &&
    body.products.length === pageSize &&
    body.products.every(hasSku);
}

export function listProducts() {
  return get(listUrl, 'list_products');
}

export function searchProducts(keyword) {
  return get(`${listUrl}&name=${encodeURIComponent(keyword)}`, 'search_products');
}

export function getProduct(sku) {
  return get(`${baseUrl}/api/v2/product/${encodeURIComponent(sku)}?${catalogQuery}`, 'product_detail');
}
