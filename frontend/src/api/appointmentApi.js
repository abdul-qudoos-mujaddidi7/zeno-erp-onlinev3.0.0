import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/appointments';

export const appointmentApi = {
  getAll({
    status = 1,
    search = '',
    patient_id = '',
    doctor_id = '',
    department_id = '',
    relations = 0,
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (patient_id) {
      params.set('patient_id', String(patient_id));
    }

    if (doctor_id) {
      params.set('doctor_id', String(doctor_id));
    }

    if (department_id) {
      params.set('department_id', String(department_id));
    }

    if (relations) {
      params.set('relations', '1');
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

  getAllWithRelations({
    status = 1,
    search = '',
    patient_id = '',
    doctor_id = '',
    department_id = '',
    page,
    limit,
  } = {}) {
    return this.getAll({
      status,
      search,
      patient_id,
      doctor_id,
      department_id,
      relations: 1,
      page,
      limit,
    });
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
