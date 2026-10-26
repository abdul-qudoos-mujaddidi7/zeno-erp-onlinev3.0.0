import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/journals';

export const journalApi = {
  getAll({
    status = 1,
    search = '',
    reference_id,
    reference_ids,
    reference_type,
    currency,
    date_from,
    date_to,
    exclude_system_accounts = 0,
    exclude_report_accounts = 0,
    include_summary = 0,
    include_opening_balance = 0,
    include_running_balance = 0,
    balance_date_to,
    account_id,
    page,
    limit,
    skip_count = 0,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (reference_id !== undefined && reference_id !== null && reference_id !== '') {
      params.set('reference_id', String(reference_id));
    }

    if (reference_type) {
      params.set('reference_type', String(reference_type));
    }

    if (Array.isArray(reference_ids) && reference_ids.length) {
      params.set('reference_ids', reference_ids.join(','));
    }

    if (currency && currency !== 'all') params.set('currency', String(currency));

    if (date_from) {
      params.set('date_from', String(date_from));
    }

    if (date_to) {
      params.set('date_to', String(date_to));
    }

    if (exclude_system_accounts) {
      params.set('exclude_system_accounts', '1');
    }

    if (exclude_report_accounts) {
      params.set('exclude_report_accounts', '1');
    }

    if (include_summary) {
      params.set('include_summary', '1');
    }

    if (include_opening_balance) {
      params.set('include_opening_balance', '1');
    }

    if (include_running_balance) params.set('include_running_balance', '1');
    if (balance_date_to) params.set('balance_date_to', String(balance_date_to));

    if (account_id !== undefined && account_id !== null && account_id !== '') {
      params.set('account_id', String(account_id));
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
