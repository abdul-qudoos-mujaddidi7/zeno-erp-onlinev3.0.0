-- Document-number lookup indexes: sales.invoice_number and purchases.bill_number.
--
-- Why this migration exists
-- -------------------------
-- `sales/next-number` (the sale form's "next invoice number" call) and
-- `allocateInvoiceNumber` both prove that the number they are about to hand out
-- is unused by asking, once per candidate number:
--
--   SELECT 1 FROM sales WHERE org_id = ? AND invoice_number = ? LIMIT 1
--
-- On the beta database the only index that could answer it,
-- `idx_sales_org_invoice (org_id, invoice_number)`, exists because it was added
-- out-of-band - no file in migrations/ creates it. A database built from
-- migrations/ (a new production, a rebuilt replica, staging) falls back to
-- `org_local (org_id, local_id)` and scans every sale of the organisation.
--
-- Measured on the beta database, largest organisation (22,282 sales), read-only,
-- median of five runs, `SQL_NO_CACHE`:
--
--   with idx_sales_org_invoice ...... key=idx_sales_org_invoice  rows=1
--                                    Extra=Using index (covering)  0.45 ms
--   without it ...................... key=org_local  rows=22,282
--                                    Extra=Using where            27.92 ms   (62x)
--
-- `allocateInvoiceNumber` runs that statement in a `while` loop until it finds a
-- free number, and the preview path (`consume: false`, used by the sale form on
-- every open) runs it too. Without the index each iteration is a full scan of
-- the organisation's sales, which is the reported 347-446 ms for
-- `sales/next-number` on a database whose SQL otherwise costs under a
-- millisecond.
--
-- Purchases have the identical loop (`billNumberExists`, `WHERE org_id = ? AND
-- bill_number = ?`) and no index at all, on the beta database below:
--
--   SELECT 1 FROM purchases WHERE org_id = ? AND bill_number = ? LIMIT 1
--     ......... key=org_local  rows=341  (full organisation read)
--
-- `bill_number` stores the counter only (`275`), the prefix is added at render
-- time, so the equality is on the bare number.
--
-- Additive only: the runner refuses anything that is not CREATE TABLE / CREATE
-- INDEX / ADD COLUMN, and skips an index that already exists by name. Re-running
-- is a no-op on a database that already has them (as the beta one does), so
-- applying this file one statement at a time is safe. No row is read or written.
--
-- Cost, stated plainly: two more indexes on two hot tables. They cost write
-- amplification on every INSERT/UPDATE of `sales` and `purchases`, and one index
-- build per database. Apply in a quiet window on the production-sized tables.

-- The sale-number collision check, and the clobbered-counter fallback scan
-- (`invoice_number LIKE 'PREFIX%'`), which can both use this index.
CREATE INDEX idx_sales_org_invoice
  ON sales (org_id, invoice_number);

-- The bill-number collision check, same loop as sales.
CREATE INDEX idx_purchases_org_bill
  ON purchases (org_id, bill_number);
