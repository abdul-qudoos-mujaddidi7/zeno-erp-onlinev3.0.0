import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/accounts';

export const accountApi = {
  getAll({
    status = 1,
    search = '',
    code = '',
    account_type_id = '',
    account_group_id = '',
    patient_type_id = '',
    account_status = '',
    exclude_system,
    page,
    limit,
    ids = '',
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (ids) {
      params.set('ids', String(ids));
    }

    if (code.trim()) {
      params.set('code', code.trim());
    }

    if (account_type_id) {
      params.set('account_type_id', String(account_type_id));
    }

    if (account_group_id) {
      params.set('account_group_id', String(account_group_id));
    }

    if (patient_type_id) {
      params.set('patient_type_id', String(patient_type_id));
    }

    if (account_status) {
      params.set('account_status', String(account_status));
    }

    if (exclude_system !== undefined && exclude_system !== null && exclude_system !== '') {
      params.set('exclude_system', String(exclude_system));
    }

    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }

    return api.get(
      `${BASE_URL}?${params.toString()}`,
    );
  },

  getBalances({ status = 1, account_ids = '' } = {}) {
    const params = new URLSearchParams();
    params.set('status', String(status));
    if (account_ids) params.set('account_ids', String(account_ids));
    return api.get(`${BASE_URL}/balances?${params}`, { cache: false });
  },

  getCreditDebit({ status = 1, account_ids = '' } = {}) {
    const params = new URLSearchParams();
    params.set('status', String(status));
    if (account_ids) params.set('account_ids', String(account_ids));
    return api.get(`${BASE_URL}/credit-debit?${params}`, { cache: false });
  },

  getReportBootstrap({ status = 1 } = {}) {
    const params = new URLSearchParams();
    params.set('status', String(status));
    return api.get(`${BASE_URL}/report-bootstrap?${params}`);
  },

  getProductItems(accountId, {
    item_type = 'all',
    product_id,
    search = '',
    date_from,
    date_to,
    page,
    limit,
    skip_count = 1,
  } = {}) {
    const params = new URLSearchParams();
    params.set('item_type', String(item_type || 'all'));
    if (product_id) params.set('product_id', String(product_id));
    if (search.trim()) params.set('search', search.trim());
    if (date_from) params.set('date_from', String(date_from));
    if (date_to) params.set('date_to', String(date_to));
    if (skip_count) params.set('skip_count', '1');
    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }
    const base = accountId != null
      ? `${BASE_URL}/${accountId}/product-items`
      : `${BASE_URL}/product-items`;
    return api.get(`${base}?${params.toString()}`);
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
