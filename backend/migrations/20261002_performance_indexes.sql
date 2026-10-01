-- Additive migration: indexes for the queries every list/edit page runs.
--
-- Measured with scripts/perf-audit.js on the largest org (67,843 journals,
-- 44,825 sales, 128,168 sale_items). Each statement below replaces a full
-- organisation scan that MySQL was doing with an index range read:
--
--   sales list / count ........ 27 ms, 22,412 rows scanned (key=org_local)
--   sale_items by sale ids .... 69 ms, 64,084 rows scanned (key=org_local)
--   sale_payments by sale ids . 52 ms, 41,216 rows scanned
--   journal by reference ...... 133 ms, 73,202 rows scanned (key=org_local)
--
-- Only CREATE INDEX statements are used, so scripts/run-migration.js accepts
-- the file and a re-run skips indexes that already exist. No data changes.
--
-- The sales list is ordered by created_at, so the index carries that column
-- last and the ORDER BY + LIMIT can be answered from the index directly
-- instead of sorting every row of the org.
CREATE INDEX idx_sales_org_status_created
  ON sales (org_id, status, created_at);

-- Sale lists with relations=1 fetch items/payments for a page of sale ids.
CREATE INDEX idx_sale_items_org_sale
  ON sale_items (org_id, sale_id);

CREATE INDEX idx_sale_payments_org_sale
  ON sale_payments (org_id, sale_id);

-- Edit/delete/receipt modals ask for one document's journals by reference.
CREATE INDEX idx_journals_org_ref
  ON journals (org_id, status, reference_type, reference_id);
