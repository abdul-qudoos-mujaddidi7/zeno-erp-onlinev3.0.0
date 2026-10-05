import { describe, expect, it } from 'vitest';
import { aggregateProductItemsForExport, buildProductReportRows } from './productReportAggregation.js';

describe('selected product report view', () => {
  const rows = [
    { id: 1, product_id: 2, sale_id: 10, document_number: 'INV-10', product_unit_id: 1, product_unit_name: 'Box', currency: 'AFN', quantity: 3, subtotal: 300 },
    { id: 2, product_id: 2, sale_id: 11, document_number: 'INV-11', product_unit_id: 1, product_unit_name: 'Box', currency: 'AFN', quantity: 4, subtotal: 440 },
    { id: 3, product_id: 2, sale_id: 12, document_number: 'INV-12', product_unit_id: 2, product_unit_name: 'Piece', currency: 'USD', quantity: 5, subtotal: 25 },
  ];

  it('keeps combined quantities and separate currency amounts by default', () => {
    const [total] = buildProductReportRows(rows, [2]);
    expect(total.is_product_total).toBe(true);
    expect(total.quantities).toEqual({ Box: 7, Piece: 5 });
    expect(total.balances).toEqual({ AFN: 740, USD: 25 });
  });

  it('preserves every bill and its quantity when Show Bills is enabled', () => {
    const result = buildProductReportRows(rows, [2], { showBills: true });
    expect(result.map(row => [row.document_number, row.quantity])).toEqual([
      ['INV-10', 3], ['INV-11', 4], ['INV-12', 5],
    ]);
    expect(result.every(row => !row.is_product_total)).toBe(true);
    expect(buildProductReportRows(rows, [2], { showBills: true, forExport: true })).toEqual(result);
  });

  it('restores combined export quantities when Show Bills is disabled', () => {
    const result = buildProductReportRows(rows, [2], { forExport: true });
    expect(result).toHaveLength(2);
    expect(result[0].quantity).toBe(7);
    expect(result[1].quantity).toBe(5);
  });

  it('preserves the existing report when no product is selected', () => {
    expect(buildProductReportRows(rows)).toEqual(rows);
  });
});

describe('aggregateProductItemsForExport', () => {
  it('combines matching product rows and calculates a weighted unit price', () => {
    const result = aggregateProductItemsForExport([
      { product_id: 2, product_unit_id: 1, currency: 'AFN', quantity: 1, unit_price: 8160, subtotal: 8160, document_number: 'INV-19279' },
      { product_id: 2, product_unit_id: 1, currency: 'AFN', quantity: 1, unit_price: 7800, subtotal: 7800, document_number: 'INV-19272' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      product_id: 2,
      quantity: 2,
      subtotal: 15960,
      unit_price: 7980,
      source_count: 2,
    });
  });

  it('keeps different units and currencies in separate rows', () => {
    const result = aggregateProductItemsForExport([
      { product_id: 2, product_unit_id: 1, currency: 'AFN', quantity: 1, subtotal: 100 },
      { product_id: 2, product_unit_id: 2, currency: 'AFN', quantity: 1, subtotal: 100 },
      { product_id: 2, product_unit_id: 1, currency: 'USD', quantity: 1, subtotal: 1 },
    ]);
    expect(result).toHaveLength(3);
  });
});
