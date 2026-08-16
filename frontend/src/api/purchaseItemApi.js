import { api } from './apiClient.js';

const BASE_URL = '/api/v2/purchase-items';

export const purchaseItemApi = {
  getAll({ status = 1, purchase_id = '', product_id = '', account_id = '', date_from = '', date_to = '' } = {}) {
    const params = new URLSearchParams();
    params.set('status', String(status));
    if (purchase_id) params.set('purchase_id', String(purchase_id));
    if (product_id) params.set('product_id', String(product_id));
    if (account_id) params.set('account_id', String(account_id));
    if (date_from) params.set('date_from', String(date_from));
    if (date_to) params.set('date_to', String(date_to));
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