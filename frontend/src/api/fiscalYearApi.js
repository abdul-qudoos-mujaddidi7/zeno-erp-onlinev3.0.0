import { api } from './apiClient.js';

const BASE_URL = '/api/v2/fiscal-years';

export const fiscalYearApi = {
  getAll(filters = {}) {
    const params = new URLSearchParams();

    ['fiscal_status', 'include_deleted'].forEach((key) => {
      if (filters[key] !== undefined && filters[key] !== '' && filters[key] !== null) {
        params.set(key, String(filters[key]));
      }
    });

    const query = params.toString();

    return api.get(`${BASE_URL}${query ? `?${query}` : ''}`, { cache: false });
  },

  getById: (id) => api.get(`${BASE_URL}/${id}`, { cache: false }),

  // Resolves a date to its fiscal year without assigning one.
  resolve: (date) =>
    api.get(
      `${BASE_URL}/resolve${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      { cache: false },
    ),

  getCurrent: (date) =>
    api.get(
      `${BASE_URL}/current${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      { cache: false },
    ),

  getSummary: (id) => api.get(`${BASE_URL}/${id}/summary`, { cache: false }),

  create: (data) => api.post(BASE_URL, data),

  update: (id, data) => api.put(`${BASE_URL}/${id}`, data),
};
