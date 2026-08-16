import { api } from './apiClient.js';
import { appendPaginationParams } from '../lib/pagination.js';

const BASE_URL = '/api/v2/inventory-records';

export const inventoryRecordApi = {
  getAll({
    status = 1,
    record_status = '',
    account_id = '',
    apartment_id = '',
    search = '',
    relations = 0,
    page,
    limit,
  } = {}) {
    const params = new URLSearchParams();

    params.set('status', String(status));

    if (record_status) {
      params.set('record_status', String(record_status));
    }

    if (account_id) {
      params.set('account_id', String(account_id));
    }

    if (apartment_id) {
      params.set('apartment_id', String(apartment_id));
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
    record_status = '',
    account_id = '',
    apartment_id = '',
    search = '',
    page,
    limit,
  } = {}) {
    return this.getAll({
      status,
      record_status,
      account_id,
      apartment_id,
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

  addPayment(recordId, data) {
    return api.post(
      `${BASE_URL}/${recordId}/payments`,
      data,
    );
  },

  removePayment(recordId, paymentId) {
    return api.delete(
      `${BASE_URL}/${recordId}/payments/${paymentId}`,
    );
  },

  createReturn(recordId, data) {
    return api.post(
      `${BASE_URL}/${recordId}/returns`,
      data,
    );
  },

  removeReturn(recordId, returnId) {
    return api.delete(
      `${BASE_URL}/${recordId}/returns/${returnId}`,
    );
  },
};
