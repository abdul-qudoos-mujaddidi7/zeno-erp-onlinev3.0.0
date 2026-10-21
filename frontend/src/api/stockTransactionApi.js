import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/stock-transactions';

export const stockTransactionApi = {
  /*
   * A caller that passes `page` (or `offset`) gets one page plus a `meta`
   * block with the filtered total; everything else still receives the whole
   * filtered history, which is what the edit/delete modals filter in the
   * browser.
   */
  getAll({
    status,
    product_id,
    product_ids,
    warehouse_id,
    reference_type,
    transaction_type,
    reference_id,
    search,
    sort,
    direction,
    date_from,
    date_to,
    page,
    offset,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    if (status !== undefined && status !== null && status !== '') {
      params.set('status', String(status));
    }

    if (product_id) {
      params.set('product_id', String(product_id));
    }

    if (product_ids) {
      const ids = Array.isArray(product_ids)
        ? product_ids.join(',')
        : String(product_ids);
      params.set('product_ids', ids);
    }

    if (warehouse_id) {
      params.set('warehouse_id', String(warehouse_id));
    }

    if (reference_type) {
      params.set('reference_type', reference_type);
    }

    if (transaction_type) {
      params.set('transaction_type', transaction_type);
    }

    if (reference_id) {
      params.set('reference_id', String(reference_id));
    }

    if (search) {
      params.set('search', String(search).trim());
    }

    if (sort) {
      params.set('sort', String(sort));
    }

    if (direction) {
      params.set('direction', String(direction));
    }

    if (date_from) {
      params.set('date_from', String(date_from));
    }

    if (date_to) {
      params.set('date_to', String(date_to));
    }

    if (page != null || offset != null) {
      appendPaginationParams(params, { page, limit });

      if (offset != null) {
        params.set('offset', String(offset));
      }
    } else if (limit) {
      params.set('limit', String(limit));
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
