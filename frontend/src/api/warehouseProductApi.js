import { api } from './apiClient.js';

const BASE_URL = '/api/v2/warehouse-products';

export const warehouseProductApi = {
  getAll({ status = 1, warehouse_id = '', product_id = '' } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (warehouse_id) {
      params.set('warehouse_id', String(warehouse_id));
    }

    if (product_id) {
      params.set('product_id', String(product_id));
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
