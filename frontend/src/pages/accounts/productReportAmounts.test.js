import { describe, expect, it } from 'vitest';
import { productReportAmounts } from './productReportAmounts.js';
import { aggregateProductItemsForExport } from './productReportAggregation.js';

describe('product report discount amounts', () => {
  it('applies line and invoice percentages without deducting line discounts twice', () => {
    expect(productReportAmounts({ subtotal: 90, discount_type: 'percent', discount_amount: 10, invoice_discount_type: 'percent', invoice_discount_amount: 20 })).toEqual({ gross: 100, discount: 28, final: 72 });
  });
  it('allocates a fixed invoice discount proportionally to a filtered line', () => {
    expect(productReportAmounts({ subtotal: 100, invoice_discount_amount: 40, invoice_total_amount: 170, invoice_expense_amount: 10 })).toEqual({ gross: 100, discount: 20, final: 80 });
  });
  it('preserves discounts from different invoices when products are grouped', () => {
    const rows = aggregateProductItemsForExport([
      { product_id: 1, quantity: 1, subtotal: 90, discount_amount: 10 },
      { product_id: 1, quantity: 1, subtotal: 100, invoice_discount_type: 'percent', invoice_discount_amount: 20 },
    ]);
    expect(productReportAmounts(rows[0])).toEqual({ gross: 200, discount: 30, final: 170 });
    expect(rows[0].unit_price).toBe(100);
  });
  it('handles a fully discounted line', () => {
    expect(productReportAmounts({ subtotal: 0, quantity: 2, unit_price: 50, discount_type: 'percent', discount_amount: 100 })).toEqual({ gross: 100, discount: 100, final: 0 });
  });
});
