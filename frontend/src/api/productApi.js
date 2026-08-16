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

    if (category_id) {
      params.set('category_id', String(category_id));
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
