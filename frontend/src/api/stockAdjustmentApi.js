import { api } from './apiClient.js';

const BASE_URL = '/api/stock-adjustments';
export const stockAdjustmentApi = {
  getAll(filters = {}) {
    const params = new URLSearchParams();
    ['product_id', 'warehouse_id', 'adjustment_type', 'date_from', 'date_to'].forEach((key) => {
      if (filters[key]) params.set(key, String(filters[key]));
    });
    return api.get(`${BASE_URL}?${params.toString()}`, { cache: false });
  },
  getById: (id) => api.get(`${BASE_URL}/${id}`),
  create: (data) => api.post(BASE_URL, data),
  getReport(filters = {}) {
    const params = new URLSearchParams();
    ['product_id', 'warehouse_id', 'adjustment_type', 'date_from', 'date_to'].forEach((key) => {
      if (filters[key]) params.set(key, String(filters[key]));
    });
    return api.get(`${BASE_URL}/report?${params.toString()}`, { cache: false });
  },
};
