import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/account-images';

export const accountImageApi = {
  getAll({
    status = 1,
    account_id = null,
    account_ids = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (account_id) {
      params.set('account_id', String(account_id));
    }

    if (account_ids) {
      params.set('account_ids', String(account_ids));
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
