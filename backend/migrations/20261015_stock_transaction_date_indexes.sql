-- Stock transactions ordered by `date` (not `created_at`).
--
-- Why this migration exists
-- -------------------------
-- The paginated Stock Transactions list can be sorted by `date`
-- (`listOrderBy`), and the *unpaginated* read (`findAll`) always orders by it:
--
--   ORDER BY date DESC, local_id DESC
--
-- `findAll` is what the product view, the edit/delete modals and every internal
-- reconciliation call. The indexes shipped by
-- 20261015_stock_transaction_list_indexes.sql all end in `created_at`, so none
-- of them can serve that order - the planner reads the matching rows and sorts
-- them in a temporary table, and `EXPLAIN` says `Using filesort` for every one of
-- those reads.
--
-- Measured on the beta database, organisation 21 (67,380 rows), read-only,
-- median of five runs, `SQL_NO_CACHE`:
--
--   sort=date, page 1 (LIMIT 15)
--     before .......... key=org_local  rows=65,550  Using filesort    69.6 ms
--     after ........... key=idx_stock_transactions_org_date  no filesort
--                                                                     0.9 ms   (77x)
--
--   full history, no filter (the modals / reconciliations)
--     before .......... Using filesort                           253.9 ms
--     after ........... no filesort                              229.8 ms
--       (still expensive by design - it returns every movement of the
--        organisation; the sort is gone, the payload is the remaining cost and
--        is addressed separately by paginating those callers)
--
--   product history, ORDER BY date (product view)
--     before .......... key=idx_stock_transactions_org_product_created
--                       Using filesort                            9.2 ms
--     after ........... key=idx_stock_transactions_org_product_date
--                       no filesort                               10.1 ms
--       (equal at 1,591 rows for one product; the sort it removes grows with
--        the product's history, and no `Using filesort` remains for it)
--
-- The `status` filter the code sends alongside the order does not break the
-- index: rows come back in `date` order and `status` is tested as they are read,
-- which is why `EXPLAIN` reports `Using where` and no filesort.
--
-- Additive only and idempotent: the runner skips an index that already exists by
-- name, so re-running changes nothing. No row is read or written.
--
-- Cost, stated plainly: two indexes on the busiest insert path in the
-- application (`stock_transactions` is written by every sale, purchase,
-- adjustment, transfer, production and waste). They add write amplification to
-- those writes and one index build per database - on the beta table (135,774
-- rows) the two builds together took ~2 s. Apply in a quiet window.

-- The default `sort=date` list order and every `ORDER BY date ... LIMIT` read.
CREATE INDEX idx_stock_transactions_org_date
  ON stock_transactions (org_id, date, local_id);

-- Per-product history in date order (product view, and the product filter of the
-- list when it is sorted by date).
CREATE INDEX idx_stock_transactions_org_product_date
  ON stock_transactions (org_id, product_id, date, local_id);
