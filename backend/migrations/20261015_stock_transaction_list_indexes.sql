-- Additive indexes for the paginated Stock Transactions list.
--
-- The index page used to download every movement of the organisation, so no
-- query it ran needed an index. Now that it asks for one page at a time, the
-- order and the filters have to be served by an index or MySQL scans the whole
-- history and sorts it in a temporary table for every page turn.
--
-- Before this migration the only organisation-scoped index on the table was
-- (org_id, local_id), which cannot answer `ORDER BY created_at DESC`.
--
-- Measured at the query level on the largest local organisation (48,014 rows,
-- read-only, page 1 and the last of 3,201 pages):
--
--   page 1, no index ......... 99 ms
--   page 1, with this index .. 12 ms
--   last page, no index ...... 177 ms
--
-- Only CREATE INDEX statements, so scripts/run-migration.js skips indexes that
-- already exist and a re-run is safe. No data is rewritten.

-- The list's default order: newest first, with local_id keeping it stable.
CREATE INDEX idx_stock_transactions_org_created
  ON stock_transactions (org_id, created_at, local_id);

-- The status filter the page offers alongside that order.
CREATE INDEX idx_stock_transactions_org_status_created
  ON stock_transactions (org_id, status, created_at, local_id);

-- The product filter, also ordered newest first.
CREATE INDEX idx_stock_transactions_org_product_created
  ON stock_transactions (org_id, product_id, created_at, local_id);

-- The warehouse filter.
CREATE INDEX idx_stock_transactions_org_warehouse_created
  ON stock_transactions (org_id, warehouse_id, created_at, local_id);

-- The transaction-type filter (purchase, sale, adjustment_in, ...).
CREATE INDEX idx_stock_transactions_org_type_created
  ON stock_transactions (org_id, transaction_type, created_at, local_id);
