import { api } from './apiClient.js';

const BASE_URL = '/api/v2/productions';

export const productionApi = {
  getAll({
    status = 1,
    production_status = '',
    search = '',
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (production_status) {
      params.set(
        'production_status',
        production_status,
      );
    }

    if (search.trim()) {
      params.set('search', search.trim());
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

  createReturn(productionId, data) {
    return api.post(
      `${BASE_URL}/${productionId}/returns`,
      data,
    );
  },

  removeReturn(returnId) {
    return api.delete(
      `${BASE_URL}/returns/${returnId}`,
    );
  },
};
