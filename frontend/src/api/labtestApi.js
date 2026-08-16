import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/labtests';

export const labtestApi = {
  getAll({
    status = 1,
    search = '',
    patient_id = '',
    labtest_type_id = '',
    appointment_id = '',
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (patient_id) {
      params.set('patient_id', String(patient_id));
    }

    if (labtest_type_id) {
      params.set(
        'labtest_type_id',
        String(labtest_type_id),
      );
    }

    if (appointment_id) {
      params.set(
        'appointment_id',
        String(appointment_id),
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
