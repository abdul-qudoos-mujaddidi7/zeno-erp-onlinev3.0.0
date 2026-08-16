import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/users';

export const userApi = {
  getAll({
    status,
    search = '',
    role_id = '',
    department_id = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    if (status !== undefined && status !== null && status !== '') {
      params.set('status', String(status));
    }

    if (search.trim()) {
      params.set('search', search.trim());
    }

    if (role_id) {
      params.set('role_id', String(role_id));
    }

    if (department_id) {
      params.set('department_id', String(department_id));
    }

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
