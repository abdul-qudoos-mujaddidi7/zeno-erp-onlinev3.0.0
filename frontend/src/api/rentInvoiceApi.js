import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/rent-invoices';

export const rentInvoiceApi = {
  getAll({
    status = 1,
    search = '',
    lease_id = '',
    invoice_status = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (lease_id) {
      params.set('lease_id', String(lease_id));
    }

    if (invoice_status) {
      params.set(
        'invoice_status',
        String(invoice_status),
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
