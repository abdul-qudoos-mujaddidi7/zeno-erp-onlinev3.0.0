import { api } from './apiClient.js';

const BASE_URL = '/api/v2/dashboard';

export const dashboardApi = {
  getSummary({
    date_from,
    date_to,
    period,
    granularity,
    include_overview,
    include_metrics,
  } = {}) {
    const params = new URLSearchParams();

    if (date_from) params.set('date_from', String(date_from));
    if (date_to) params.set('date_to', String(date_to));
    if (period) params.set('period', String(period));
    if (granularity) params.set('granularity', String(granularity));
    if (include_overview !== undefined && include_overview !== null) {
      params.set('include_overview', include_overview ? '1' : '0');
    }
    if (include_metrics !== undefined && include_metrics !== null) {
      params.set('include_metrics', include_metrics ? '1' : '0');
    }

    return api.get(`${BASE_URL}/summary?${params.toString()}`);
  },

  getInventory() {
    return api.get(`${BASE_URL}/inventory`);
  },
};
