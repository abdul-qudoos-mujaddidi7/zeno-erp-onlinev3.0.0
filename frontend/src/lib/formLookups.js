import { accountApi } from '../api/accountApi.js';
import { productApi } from '../api/productApi.js';
import { readListMeta } from './pagination.js';

export const LOOKUP_LIMIT = 40;

export function mergeById(existing = [], incoming = []) {
  const map = new Map((existing || []).map((row) => [Number(row.id), row]));

  for (const row of incoming || []) {
    if (row?.id == null) continue;
    map.set(Number(row.id), row);
  }

  return [...map.values()];
}

export function isActiveAccount(account) {
  if (!account) return false;
  if (account.account_status) return account.account_status === 'active';
  return Number(account.status) === 1;
}

export function isActiveProduct(product) {
  if (!product) return false;
  if (Number(product.status) !== 1) return false;
  if (product.product_status) return product.product_status === 'active';
  return true;
}

export async function lookupAccounts({
  account_type_id,
  role,
  code = '',
  search = '',
  exclude_system,
  limit = LOOKUP_LIMIT,
} = {}) {
  const response = await accountApi.getAll({
    status: 1,
    account_type_id: account_type_id || '',
    role: role || '',
    code: code || '',
    search: search || '',
    exclude_system,
    page: 1,
    limit,
  });

  return (response?.data || []).filter(isActiveAccount);
}

export async function lookupAccountByCode(code) {
  const rows = await lookupAccounts({ code, limit: 5 });
  return rows.find((row) => row.code === code) || rows[0] || null;
}

export async function lookupProducts({
  search = '',
  category_id = '',
  limit = LOOKUP_LIMIT,
  page = 1,
} = {}) {
  const response = await productApi.getAll({
    status: 1,
    search,
    category_id,
    page,
    limit,
  });

  return (response?.data || []).filter(isActiveProduct);
}

export async function lookupProductsPage({
  search = '',
  category_id = '',
  limit = LOOKUP_LIMIT,
  page = 1,
} = {}) {
  const response = await productApi.getAll({
    status: 1,
    search,
    category_id,
    page,
    limit,
  });
  const data = (response?.data || []).filter(isActiveProduct);

  return {
    data,
    meta: readListMeta(response, data.length),
  };
}

export async function lookupBalances(accountIds = []) {
  const ids = [
    ...new Set(
      (accountIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  if (!ids.length) return {};

  const response = await accountApi.getBalances({
    status: 1,
    account_ids: ids.join(','),
  });

  return response?.data || {};
}

export function getAccountBalanceRow(balanceMap, accountId) {
  if (!accountId || !balanceMap) return null;

  const wanted = Number(accountId);
  if (!Number.isFinite(wanted) || wanted <= 0) return null;

  const direct =
    balanceMap[accountId] ||
    balanceMap[String(accountId)] ||
    balanceMap[wanted];

  if (direct && typeof direct === 'object') return direct;

  for (const [key, row] of Object.entries(balanceMap)) {
    if (Number(key) === wanted && row && typeof row === 'object') {
      return row;
    }
  }

  return null;
}

export function balanceAmount(balanceMap, accountId, currency) {
  if (!accountId || !currency) return 0;

  const row = getAccountBalanceRow(balanceMap, accountId) || {};
  return Number(row?.[currency] || 0);
}

export function availableCashAmount(balanceMap, accountId, preferredCurrency) {
  const row = getAccountBalanceRow(balanceMap, accountId);
  if (!row) return 0;

  const preferred = Math.abs(Number(row[preferredCurrency]) || 0);
  if (preferred > 0) return preferred;

  return Object.values(row).reduce((max, value) => {
    const abs = Math.abs(Number(value) || 0);
    return abs > max ? abs : max;
  }, 0);
}
