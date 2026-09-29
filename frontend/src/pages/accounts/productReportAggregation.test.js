import { describe, expect, it } from 'vitest';
import { aggregateProductItemsForExport } from './productReportAggregation.js';

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
