-- MySQL 8.0+ -- additive migration for visitor-account sales.
--
-- A sale may name a "visitor": an account whose account type is the VISITOR
-- type. That visitor is entitled to a share of the sale's benefit, which is
-- posted to the books as its own journal (BENEFITS debit / visitor credit).
--
-- This migration only ADDS NULLABLE columns, so every existing sale, every
-- existing INSERT and every existing UPDATE keeps working untouched and no
-- historical row changes meaning. A sale without a visitor stays exactly as it
-- was: all three columns are NULL and no journal is written.
--
--   * visitor_account_id  the visitor account's local_id;
--   * visitor_percentage  the rate that was in force when the sale was made
--                         (a snapshot, so later edits to the account cannot
--                         rewrite history);
--   * visitor_benefit     the amount actually posted to the visitor, which is
--                         what the reversal on sale delete relies on.
--
-- scripts/run-migration.js refuses data changes, and this file has none:
-- scripts/seed-visitor-account-type.js creates the VISITOR type itself.
ALTER TABLE sales
  ADD COLUMN visitor_account_id BIGINT UNSIGNED NULL AFTER account_id;

ALTER TABLE sales
  ADD COLUMN visitor_percentage DECIMAL(9,4) NULL AFTER visitor_account_id;

ALTER TABLE sales
  ADD COLUMN visitor_benefit DECIMAL(20,6) NULL AFTER visitor_percentage;

CREATE INDEX ix_sales_visitor ON sales (org_id, visitor_account_id);
