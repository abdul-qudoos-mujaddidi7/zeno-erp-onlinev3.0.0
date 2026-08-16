import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/exchanges';

export const exchangeApi = {
  getAll({
    status = 1,
    search = '',
    reference_type,
    account_id,
    exclude_system_accounts = 0,
    page,
    limit,
    skip_count = 0,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (reference_type) {
      params.set('reference_type', String(reference_type));
    }

    if (account_id !== undefined && account_id !== null && account_id !== '') {
      params.set('account_id', String(account_id));
    }

    if (exclude_system_accounts) {
      params.set('exclude_system_accounts', '1');
    }

    if (skip_count) {
      params.set('skip_count', '1');
    }

    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }

    return api.get(`${BASE_URL}?${params.toString()}`);
  },

  getById(id) {
    return api.get(`${BASE_URL}/${id}`);
  },

  create(data) {
    return api.post(BASE_URL, data);
  },

  update(id, data) {
    return api.put(`${BASE_URL}/${id}`, data);
  },

  remove(id) {
    return api.delete(`${BASE_URL}/${id}`);
  },
};
