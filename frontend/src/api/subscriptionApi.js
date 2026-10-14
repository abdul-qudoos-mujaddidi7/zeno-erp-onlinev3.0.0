import { api } from './apiClient.js';

export const subscriptionApi = {
  getCurrent() {
    return api.get('/api/auth/subscription');
  },
};
