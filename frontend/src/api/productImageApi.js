import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/product-images';

export const productImageApi = {
  getAll({
    status = 1,
    product_id = null,
    product_ids = '',
    thumbnails_only = 0,
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (product_id) {
      params.set('product_id', String(product_id));
    }

    if (product_ids) {
      params.set('product_ids', String(product_ids));
    }

    if (thumbnails_only) {
      params.set('thumbnails_only', '1');
    }

    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }

    return api.get(
      `${BASE_URL}?${params.toString()}`,
    );
  },

  getById(id) {
    return api.get(`${BASE_URL}/${id}`);
  },

  create(data) {
    return api.post(BASE_URL, data);
  },

  // Soft-deletes the product's previous active image row(s) and saves the
  // new one atomically, so each product keeps only its latest image.
  replace(data) {
    return api.post(
      `${BASE_URL}/replace`,
      data,
    );
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
