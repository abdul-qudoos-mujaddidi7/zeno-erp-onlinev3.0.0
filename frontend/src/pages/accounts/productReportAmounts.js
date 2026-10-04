// Subtotals already include line discounts. Allocate invoice discounts by
// their ratio so filtered products receive only their share, in their currency.
export function productReportAmounts(row) {
  if (row.report_gross_amount != null) {
    return { gross: Number(row.report_gross_amount), discount: Number(row.report_discount_amount), final: Number(row.report_final_amount) };
  }
  const subtotal = Number(row.subtotal || 0);
  const lineDiscount = Number(row.discount_amount || 0);
  const rate = Number(row.invoice_discount_amount || 0);
  const netInvoice = Number(row.invoice_total_amount || 0) - Number(row.invoice_expense_amount || 0);
  const invoiceRatio = row.invoice_discount_type === 'percent'
    ? rate / 100
    : (netInvoice + rate > 0 ? rate / (netInvoice + rate) : 0);
  const gross = row.discount_type === 'percent'
    ? (lineDiscount < 100 ? subtotal / (1 - lineDiscount / 100) : Number(row.quantity || 0) * Number(row.unit_price || 0))
    : subtotal + lineDiscount;
  const final = subtotal * (1 - invoiceRatio);
  return { gross, discount: gross - final, final };
}
