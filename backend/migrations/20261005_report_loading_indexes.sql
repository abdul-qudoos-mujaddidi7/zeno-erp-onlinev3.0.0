-- Additive covering indexes for directional balances and selected-product reports.
-- Safe to rerun through scripts/run-migration.js; no financial data is rewritten.
CREATE INDEX idx_journals_direction_first
  ON journals (org_id, status, first_entry_account, currency, reference_type, first_entry_debit, first_entry_credit);

CREATE INDEX idx_journals_direction_second
  ON journals (org_id, status, second_entry_account, currency, reference_type, second_entry_debit, second_entry_credit);

CREATE INDEX idx_sale_items_org_product_status
  ON sale_items (org_id, product_id, status, sale_id, local_id);

CREATE INDEX idx_purchase_items_org_product_status
  ON purchase_items (org_id, product_id, status, purchase_id, local_id);
