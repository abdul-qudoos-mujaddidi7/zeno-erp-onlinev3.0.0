import { api } from './apiClient.js';

const BASE_URL = '/api/v2/boms';

export const bomApi = {
  getAll({
    status = 1,
    bill_status = '',
    search = '',
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (bill_status) {
      params.set('bill_status', bill_status);
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
};
