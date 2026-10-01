import { describe, expect, test } from 'vitest';

import {
  alertPageCount,
  buildExpiryRows,
  buildLowStockRows,
  countExpired,
  countExpiringSoon,
  countOutOfStock,
  expiryTone,
  filterAlertRows,
  filterAlertRowsByStatus,
  pageSlice,
  resolveProductAlertTab,
  stockTone,
  sumBy,
} from './productAlerts.js';

describe('alert tab resolution', () => {
  test('keeps every tab the dashboard cards link to', () => {
    expect(resolveProductAlertTab('products')).toBe('products');
    expect(resolveProductAlertTab('quantity')).toBe('quantity');
    expect(resolveProductAlertTab('expiry')).toBe('expiry');
  });

  test('falls back to the products tab for anything unknown', () => {
    expect(resolveProductAlertTab('')).toBe('products');
    expect(resolveProductAlertTab(null)).toBe('products');
    expect(resolveProductAlertTab(undefined)).toBe('products');
    expect(resolveProductAlertTab('profit')).toBe('products');
  });

  test('normalises case and padding from a hand-typed URL', () => {
    expect(resolveProductAlertTab(' EXPIRY ')).toBe('expiry');
    expect(resolveProductAlertTab('Quantity')).toBe('quantity');
  });
});

describe('low stock rows', () => {
  test('maps the overview payload and flags an empty shelf', () => {
    const rows = buildLowStockRows({
      low_stock: {
        items: [
          { id: 7, name: 'Chocolate', code: 'P-7', totalQty: -100, alarm_quantity: 1 },
          { id: 9, name: 'Soap', code: 'P-9', totalQty: 4, alarm_quantity: 5 },
        ],
      },
    });

    expect(rows).toEqual([
      { id: 7, name: 'Chocolate', code: 'P-7', quantity: -100, alarm_quantity: 1, out_of_stock: true },
      { id: 9, name: 'Soap', code: 'P-9', quantity: 4, alarm_quantity: 5, out_of_stock: false },
    ]);
    expect(countOutOfStock(rows)).toBe(1);
  });

  test('survives a missing overview or missing lists', () => {
    expect(buildLowStockRows(null)).toEqual([]);
    expect(buildLowStockRows({})).toEqual([]);
    expect(buildLowStockRows({ low_stock: {} })).toEqual([]);
  });

  test('names an unnamed product after its id', () => {
    const [row] = buildLowStockRows({ low_stock: { items: [{ id: 12 }] } });

    expect(row.name).toBe('#12');
    expect(row.code).toBe('');
  });
});

describe('expiry rows', () => {
  const overview = {
    expiring: {
      items: [
        { id: 3, name: 'Milk', code: 'M-3', totalQty: 2, expiry_date: '2026-08-01', remaining_days: -12 },
        { id: 4, name: 'Yoghurt', code: 'M-4', totalQty: 6, expiry_date: '2026-10-04', remaining_days: 3 },
        { id: 5, name: 'Cheese', code: 'M-5', totalQty: 1, expiry_date: '2026-12-01', remaining_days: 61 },
      ],
    },
  };

  test('keeps the server order and marks what is already expired', () => {
    const rows = buildExpiryRows(overview);

    expect(rows.map((row) => row.id)).toEqual([3, 4, 5]);
    expect(rows[0].expired).toBe(true);
    expect(rows[1].expired).toBe(false);
    expect(rows[0].quantity).toBe(2);
    expect(countExpired(rows)).toBe(1);
    expect(countExpiringSoon(rows, 7)).toBe(1);
  });

  test('an unmeasurable remaining time is not treated as expired', () => {
    const [row] = buildExpiryRows({ expiring: { items: [{ id: 6, remaining_days: null }] } });

    expect(row.remaining_days).toBeNull();
    expect(row.expired).toBe(false);
    expect(expiryTone(row)).toBe('neutral');
  });
});

describe('tones', () => {
  test('flags an empty shelf as negative and a low one as a warning', () => {
    expect(stockTone({ out_of_stock: true })).toBe('negative');
    expect(stockTone({ out_of_stock: false })).toBe('warning');
  });

  test('grades the expiry countdown', () => {
    expect(expiryTone({ remaining_days: 0 })).toBe('negative');
    expect(expiryTone({ remaining_days: -3 })).toBe('negative');
    expect(expiryTone({ remaining_days: 5 })).toBe('warning');
    expect(expiryTone({ remaining_days: 30 })).toBe('info');
  });
});

describe('status filter', () => {
  const quantityRows = [
    { id: 1, out_of_stock: true },
    { id: 2, out_of_stock: false },
  ];
  const expiryRows = [
    { id: 3, expired: true },
    { id: 4, expired: false },
  ];

  test('narrows the quantity tab to empty shelves', () => {
    expect(filterAlertRowsByStatus(quantityRows, 'quantity', 'out').map((row) => row.id)).toEqual([1]);
    expect(filterAlertRowsByStatus(quantityRows, 'quantity', 'low').map((row) => row.id)).toEqual([2]);
    expect(filterAlertRowsByStatus(quantityRows, 'quantity', 'all')).toBe(quantityRows);
  });

  test('narrows the expiry tab to already expired batches', () => {
    expect(filterAlertRowsByStatus(expiryRows, 'expiry', 'expired').map((row) => row.id)).toEqual([3]);
    expect(filterAlertRowsByStatus(expiryRows, 'expiry', 'soon').map((row) => row.id)).toEqual([4]);
  });

  test('never filters the products tab or an unknown status', () => {
    expect(filterAlertRowsByStatus(quantityRows, 'products', 'out')).toBe(quantityRows);
    expect(filterAlertRowsByStatus(expiryRows, 'expiry', 'nonsense')).toBe(expiryRows);
  });
});

describe('search and pagination', () => {
  const rows = [
    { id: 1, name: 'Chocolate', code: 'AAA' },
    { id: 2, name: 'Soap', code: 'BBB' },
  ];

  test('searches name, code and id', () => {
    expect(filterAlertRows(rows, 'choc')).toHaveLength(1);
    expect(filterAlertRows(rows, 'bbb')).toHaveLength(1);
    expect(filterAlertRows(rows, '2')).toHaveLength(1);
  });

  test('an empty term keeps the list untouched', () => {
    expect(filterAlertRows(rows, '   ')).toBe(rows);
    expect(filterAlertRows(rows, '')).toBe(rows);
  });

  test('slices the requested page and clamps out-of-range pages', () => {
    const many = Array.from({ length: 31 }, (_, index) => ({ id: index + 1 }));

    expect(alertPageCount(many.length, 15)).toBe(3);
    expect(pageSlice(many, 1, 15)).toHaveLength(15);
    expect(pageSlice(many, 3, 15)).toHaveLength(1);
    expect(pageSlice(many, 99, 15)).toHaveLength(1);
    expect(pageSlice(many, 0, 15)[0].id).toBe(1);
  });

  test('sums a numeric column', () => {
    expect(sumBy([{ quantity: 2 }, { quantity: 3 }, {}], 'quantity')).toBe(5);
    expect(sumBy(null, 'quantity')).toBe(0);
  });
});
