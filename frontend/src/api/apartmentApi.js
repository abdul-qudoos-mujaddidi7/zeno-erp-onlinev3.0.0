import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/apartments';

export const apartmentApi = {
  getAll({
    status = 1,
    search = '',
    building_id = '',
    floor_id = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (building_id) {
      params.set(
        'building_id',
        String(building_id),
      );
    }

    if (floor_id) {
      params.set(
        'floor_id',
        String(floor_id),
      );
    }

    if (search.trim()) {
      params.set('search', search.trim());
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
