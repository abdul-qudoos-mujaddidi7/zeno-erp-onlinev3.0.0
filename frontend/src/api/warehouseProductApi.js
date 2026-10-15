import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/warehouse-products';

export const warehouseProductApi = {
  /*
   * `page`/`limit` are optional and additive: a caller that omits them receives
   * the whole filtered list, exactly as before. A caller that sends them gets
   * one page plus a `meta` block (total, totalPages) on the response.
   */
  getAll({ status = 1, warehouse_id = '', product_id = '', page, limit } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (warehouse_id) {
      params.set('warehouse_id', String(warehouse_id));
    }

    if (product_id) {
      params.set('product_id', String(product_id));
    }

    /*
     * Only when a caller actually asked for a page - `appendPaginationParams`
     * otherwise defaults to page 1 / limit 15, which would silently truncate the
     * ~20 lookups that need every row (POS, sale/purchase forms, BOM,
     * production, prescriptions, inventory records, stock adjustments).
     */
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
