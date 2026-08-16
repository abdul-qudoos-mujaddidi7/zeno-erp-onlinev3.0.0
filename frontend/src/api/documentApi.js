import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/documents';

export const documentApi = {
  getAll({
    status = 1,
    search = '',
    reference_id = null,
    reference_type = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (reference_id) {
      params.set(
        'reference_id',
        String(reference_id),
      );
    }

    if (reference_type) {
      params.set(
        'reference_type',
        String(reference_type),
      );
    }

    if (search.trim()) {
      params.set('search', search.trim());
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
