/**
 * Shared vocabulary for the Products & Alerts page.
 *
 * The page is the drill-down behind three dashboard cards — top products, low
 * stock (quantity) and expiry — so the tab keys are part of its public
 * contract: every card deep-links with `?tab=products|quantity|expiry`, and the
 * page falls back to the products tab whenever that value is missing or
 * unknown (a stale bookmark, a hand-typed URL).
 */

export const PRODUCT_ALERT_TABS = ['products', 'quantity', 'expiry'];

export const DEFAULT_PRODUCT_ALERT_TAB = 'products';

export function resolveProductAlertTab(value) {
  const tab = String(value ?? '').trim().toLowerCase();

  return PRODUCT_ALERT_TABS.includes(tab) ? tab : DEFAULT_PRODUCT_ALERT_TAB;
}

function productIdentity(item) {
  const id = Number(item?.id);

  return {
    id: Number.isFinite(id) ? id : null,
    name: item?.name || (Number.isFinite(id) ? `#${id}` : '—'),
    code: item?.code || '',
  };
}

/**
 * Rows of the quantity tab: products at or below their alarm quantity, exactly
 * as the dashboard's low-stock card counts them. `out_of_stock` drives the
 * badge, because a negative or zero stock reads differently from a low one.
 */
export function buildLowStockRows(overview) {
  return (overview?.low_stock?.items || []).map((item) => {
    const quantity = Number(item?.totalQty) || 0;
    const alarmQuantity = Number(item?.alarm_quantity) || 0;

    return {
      ...productIdentity(item),
      quantity,
      alarm_quantity: alarmQuantity,
      out_of_stock: quantity <= 0,
    };
  });
}

/**
 * Rows of the expiry tab: products whose expiry date sits inside their alarm
 * window. `remaining_days` is null when the server could not measure it, which
 * is why the tone helper treats the two cases separately.
 */
export function buildExpiryRows(overview) {
  return (overview?.expiring?.items || []).map((item) => {
    const raw = item?.remaining_days;
    // Number(null) is 0, which would read as "expired today"; an unmeasured
    // countdown must stay unknown instead.
    const remaining = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);

    return {
      ...productIdentity(item),
      quantity: Number(item?.totalQty) || 0,
      expiry_date: item?.expiry_date || '',
      remaining_days: Number.isFinite(remaining) ? remaining : null,
      expired: Number.isFinite(remaining) && remaining <= 0,
    };
  });
}

/** True when the product is at or below zero stock. */
export function countOutOfStock(rows) {
  return (rows || []).filter((row) => row.out_of_stock).length;
}

/** True when the expiry date has already passed (or is today). */
export function countExpired(rows) {
  return (rows || []).filter((row) => row.expired).length;
}

export function countExpiringSoon(rows, days = 7) {
  return (rows || []).filter(
    (row) => row.remaining_days !== null && row.remaining_days > 0 && row.remaining_days <= days,
  ).length;
}

export function stockTone(row) {
  return row?.out_of_stock ? 'negative' : 'warning';
}

export function expiryTone(row) {
  if (row?.remaining_days === null || row?.remaining_days === undefined) return 'neutral';
  if (row.remaining_days <= 0) return 'negative';
  if (row.remaining_days <= 7) return 'warning';

  return 'info';
}

/**
 * Optional per-tab status filter: the quantity tab can narrow down to empty
 * shelves, the expiry tab to batches that already expired. The products tab has
 * its own report filters, so it keeps every row here.
 */
export function filterAlertRowsByStatus(rows, tab, status) {
  const list = rows || [];
  const value = String(status ?? 'all');

  if (tab === 'quantity') {
    if (value === 'out') return list.filter((row) => row.out_of_stock);
    if (value === 'low') return list.filter((row) => !row.out_of_stock);

    return list;
  }

  if (tab === 'expiry') {
    if (value === 'expired') return list.filter((row) => row.expired);
    if (value === 'soon') return list.filter((row) => !row.expired);

    return list;
  }

  return list;
}

/**
 * Free-text search over the columns the three tabs share. Filtering happens on
 * the client because the lists are already short aggregates, so no round trip
 * is needed while typing.
 */
export function filterAlertRows(rows, term) {
  const list = rows || [];
  const needle = String(term ?? '').trim().toLowerCase();

  if (!needle) return list;

  return list.filter((row) =>
    [row?.name, row?.code, row?.id].some((value) =>
      String(value ?? '').toLowerCase().includes(needle),
    ),
  );
}

export function sumBy(rows, key) {
  return (rows || []).reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
}

export function alertPageCount(total, perPage) {
  const size = Number(perPage) > 0 ? Number(perPage) : 1;

  return Math.max(1, Math.ceil((Number(total) || 0) / size));
}

export function pageSlice(rows, page, perPage) {
  const list = rows || [];
  const size = Number(perPage) > 0 ? Number(perPage) : list.length || 1;
  const pages = alertPageCount(list.length, size);
  const current = Math.min(Math.max(Number(page) || 1, 1), pages);
  const start = (current - 1) * size;

  return list.slice(start, start + size);
}

export function amountText(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}
