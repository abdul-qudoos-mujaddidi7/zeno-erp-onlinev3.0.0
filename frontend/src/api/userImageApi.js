import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/user-images';

export const userImageApi = {
  getAll({
    status = 1,
    user_id = null,
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (user_id) {
      params.set('user_id', String(user_id));
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
