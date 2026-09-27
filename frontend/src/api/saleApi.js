import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/sales';

export const saleApi = {
  getAll({
    status = 1,
    search = '',
    relations = 0,
    account_id,
    date_from,
    date_to,
    page,
    limit,
    skip_count = 0,
    sort_by,
    sort_dir,
    invoice_status,
    payment_status,
    ids = '',
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (relations) {
      params.set('relations', '1');
    }

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (ids) {
      params.set('ids', String(ids));
    }

    if (account_id !== undefined && account_id !== null && account_id !== '') {
      params.set('account_id', String(account_id));
    }

    if (date_from) {
      params.set('date_from', String(date_from));
    }

    if (date_to) {
      params.set('date_to', String(date_to));
    }

    if (invoice_status && invoice_status !== 'all') {
      params.set('invoice_status', String(invoice_status));
    }

    if (payment_status && payment_status !== 'all') {
      params.set('payment_status', String(payment_status));
    }

    if (skip_count) {
      params.set('skip_count', '1');
    }

    if (sort_by) {
      params.set('sort_by', String(sort_by));
    }

    if (sort_dir) {
      params.set('sort_dir', String(sort_dir));
    }

    if (page != null || limit != null) {
      appendPaginationParams(params, { page, limit });
    }

    return api.get(
      `${BASE_URL}?${params.toString()}`,
      { cache: false },
    );
  },

  getAllWithRelations({
    status = 1,
    search = '',
    account_id,
    date_from,
    date_to,
    page,
    limit,
  } = {}) {
    return this.getAll({
      status,
      search,
      relations: 1,
      account_id,
      date_from,
      date_to,
      page,
      limit,
    });
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

  /*
   * The invoice number the backend will stamp on the next confirmed sale.
   * Read-only: fetching it never consumes a number.
   */
  getNextNumber({ sale_type = '' } = {}) {
    const params = new URLSearchParams();

    if (sale_type) {
      params.set('sale_type', String(sale_type));
    }

    const query = params.toString();

    return api.get(
      `${BASE_URL}/next-number${query ? `?${query}` : ''}`,
    );
  },

  addPayment(saleId, data) {
    return api.post(
      `${BASE_URL}/${saleId}/payments`,
      data,
    );
  },

  removePayment(paymentId) {
    return api.delete(
      `${BASE_URL}/payments/${paymentId}`,
    );
  },

  createReturn(saleId, data) {
    return api.post(
      `${BASE_URL}/${saleId}/returns`,
      data,
    );
  },

  removeReturn(returnId) {
    return api.delete(
      `${BASE_URL}/returns/${returnId}`,
    );
  },
};
