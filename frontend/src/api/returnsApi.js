import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/returns';

export const returnsApi = {
  getItems({
    return_type = 'all',
    account_id,
    search = '',
    date_from,
    date_to,
    page,
    limit,
    skip_count = 1,
  } = {}) {
    const params = new URLSearchParams();
    params.set('return_type', String(return_type || 'all'));
    if (account_id) params.set('account_id', String(account_id));
    if (search.trim()) params.set('search', search.trim());
    if (date_from) params.set('date_from', String(date_from));
    if (date_to) params.set('date_to', String(date_to));
    if (skip_count) params.set('skip_count', '1');
    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }
    return api.get(`${BASE_URL}/items?${params.toString()}`);
  },
};
