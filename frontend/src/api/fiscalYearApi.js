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

  // Read-only: what a close would post. Writes nothing, not even the
  // retained-earnings account.
  getClosePreview: (id) =>
    api.get(`${BASE_URL}/${id}/close-preview`, { cache: false }),

  // The only authoritative way to close a year: one backend transaction that
  // also writes the next year's opening balances (or refuses, when the next
  // year is missing).
  close: (id) => api.post(`${BASE_URL}/${id}/close`),

  /*
   * Reopen is the only supported way to undo a close: it reverses the closing
   * journals, deactivates the opening balances this close generated and puts
   * the year back to OPEN. Nothing is deleted, so the audit trail survives.
   */
  reopen: (id, data) => api.post(`${BASE_URL}/${id}/reopen`, data || {}),

  // Roll-forward audit: the opening balances this year received and generated.
  // Read-only; generated balances cannot be edited through the API.
  getOpeningBalances: (id, filters = {}) => {
    const params = new URLSearchParams();

    ['include_inactive', 'generated'].forEach((key) => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params.set(key, String(filters[key]));
      }
    });

    const query = params.toString();

    return api.get(
      `${BASE_URL}/${id}/opening-balances${query ? `?${query}` : ''}`,
      { cache: false },
    );
  },

  /*
   * One account's statement inside one fiscal year:
   * opening balance + that year's journals = closing balance.
   */
  getAccountStatement: (id, accountId, filters = {}) => {
    const params = new URLSearchParams();

    ['currency', 'page', 'limit'].forEach((key) => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params.set(key, String(filters[key]));
      }
    });

    const query = params.toString();

    return api.get(
      `${BASE_URL}/${id}/accounts/${accountId}/statement${query ? `?${query}` : ''}`,
      { cache: false },
    );
  },

  create: (data) => api.post(BASE_URL, data),

  update: (id, data) => api.put(`${BASE_URL}/${id}`, data),
};
