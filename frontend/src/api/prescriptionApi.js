import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/prescriptions';

export const prescriptionApi = {
  getAll({
    status = 1,
    prescription_status = '',
    patient_id = '',
    doctor_id = '',
    appointment_id = '',
    search = '',
    relations = 0,
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (prescription_status) {
      params.set('prescription_status', String(prescription_status));
    }

    if (patient_id) {
      params.set('patient_id', String(patient_id));
    }

    if (doctor_id) {
      params.set('doctor_id', String(doctor_id));
    }

    if (appointment_id) {
      params.set('appointment_id', String(appointment_id));
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
    prescription_status = '',
    patient_id = '',
    doctor_id = '',
    appointment_id = '',
    search = '',
    page,
    limit,
  } = {}) {
    return this.getAll({
      status,
      prescription_status,
      patient_id,
      doctor_id,
      appointment_id,
      search,
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

  addPayment(prescriptionId, data) {
    return api.post(
      `${BASE_URL}/${prescriptionId}/payments`,
      data,
    );
  },

  removePayment(prescriptionId, paymentId) {
    return api.delete(
      `${BASE_URL}/${prescriptionId}/payments/${paymentId}`,
    );
  },

  createReturn(prescriptionId, data) {
    return api.post(
      `${BASE_URL}/${prescriptionId}/returns`,
      data,
    );
  },

  removeReturn(prescriptionId, returnId) {
    return api.delete(
      `${BASE_URL}/${prescriptionId}/returns/${returnId}`,
    );
  },
};
