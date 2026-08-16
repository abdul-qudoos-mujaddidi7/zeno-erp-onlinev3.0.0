import { writable, get } from 'svelte/store';
import { API_URL } from '../config.js';

export const InventoryMethod = Object.freeze({
  CLASSIC: 'CLASSIC',
  FIFO: 'FIFO',
  LIFO: 'LIFO',
});

const STORAGE_PREFIX = 'inventory_method_';

function cacheKey(orgId) {
  return `${STORAGE_PREFIX}${orgId}`;
}

function readCache(orgId) {
  if (!orgId) return null;
  const raw = localStorage.getItem(cacheKey(orgId));
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(InventoryMethod, normalized)) {
    return InventoryMethod[normalized];
  }
  return null;
}

function writeCache(orgId, method) {
  if (!orgId || !method) return;
  localStorage.setItem(cacheKey(orgId), method);
}

export const organizationStore = writable({
  organization: null,
  inventoryMethod: null,
  inventoryMethodLocked: true,
});

export function getInventoryMethod() {
  const state = get(organizationStore);
  if (state.inventoryMethod) return state.inventoryMethod;
  const orgId = localStorage.getItem('org_id');
  return readCache(orgId);
}

export function setOrganizationContext({ organization = null, inventoryMethod = null } = {}) {
  const orgId = organization?.id ?? localStorage.getItem('org_id');
  const method =
    inventoryMethod ||
    organization?.inventory_method ||
    readCache(orgId) ||
    null;

  if (method) writeCache(orgId, method);

  organizationStore.set({
    organization,
    inventoryMethod: method,
    inventoryMethodLocked: true,
  });
}

export function clearOrganizationContext() {
  organizationStore.set({
    organization: null,
    inventoryMethod: null,
    inventoryMethodLocked: true,
  });
}

export async function fetchOrganizationInventoryMethod() {
  const token = localStorage.getItem('token');
  const orgId = localStorage.getItem('org_id');
  const cached = readCache(orgId);

  if (cached) {
    setOrganizationContext({ inventoryMethod: cached });
  }

  if (!token || !orgId) {
    if (cached) return cached;
    throw new Error('Select an inventory method before using inventory.');
  }

  const res = await fetch(`${API_URL}/api/v2/system/inventory-method`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (cached) return cached;
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load inventory method.');
  }

  const body = await res.json();
  const method = String(
    body.inventory_method || body.data?.inventory_method || '',
  )
    .trim()
    .toUpperCase();

  if (!Object.prototype.hasOwnProperty.call(InventoryMethod, method)) {
    if (cached) return cached;
    throw new Error('Select an inventory method before using inventory.');
  }

  setOrganizationContext({ inventoryMethod: InventoryMethod[method] });
  return InventoryMethod[method];
}

export function isBatchMethod(method) {
  return method === InventoryMethod.FIFO || method === InventoryMethod.LIFO;
}
