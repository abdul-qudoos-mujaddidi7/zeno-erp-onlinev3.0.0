import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/products';

export const productApi = {
  getAll({
    status = 1,
    search = '',
    type = '',
    exclude_type = '',
    category_id = '',
    product_status = '',
    brand_id = '',
    generic_id = '',
    currency = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (type) {
      params.set('type', String(type));
    }

    if (exclude_type) {
      params.set('exclude_type', String(exclude_type));
    }

    if (category_id && category_id !== 'all') {
      params.set('category_id', String(category_id));
    }

    if (product_status && product_status !== 'all') {
      params.set('product_status', String(product_status));
    }

    if (brand_id && brand_id !== 'all') {
      params.set('brand_id', String(brand_id));
    }

    if (generic_id && generic_id !== 'all') {
      params.set('generic_id', String(generic_id));
    }

    if (currency && currency !== 'all') {
      params.set('currency', String(currency));
    }

    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }

    return api.get(
      `${BASE_URL}?${params.toString()}`,
    );
  },

  getSummary() {
    return api.get(`${BASE_URL}/summary`, { cache: false });
  },

  getById(id) {
    return api.get(`${BASE_URL}/${id}`);
  },

  reconcileStock(id) {
    return api.post(`${BASE_URL}/${id}/reconcile-stock`);
  },

  create(data) {
    return api.post(BASE_URL, data);
  },

  update(id, data) {
    return api.put(
      `${BASE_URL}/${id}`,
      data,
    );
  },

  remove(id) {
    return api.delete(
      `${BASE_URL}/${id}`,
    );
  },
};
