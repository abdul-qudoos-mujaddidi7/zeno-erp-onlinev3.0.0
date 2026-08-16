import { api } from './apiClient.js';

const BASE_URL = '/api/v2/purchase-payments';

export const purchasePaymentApi = {
  getAll({ status, purchase_id = null, date_from = '', date_to = '' } = {}) {
    const params = new URLSearchParams();

    if (status !== undefined && status !== null) {
      params.set('status', String(status));
    }

    if (purchase_id) {
      params.set('purchase_id', String(purchase_id));
    }

    if (date_from) {
      params.set('date_from', String(date_from));
    }

    if (date_to) {
      params.set('date_to', String(date_to));
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
