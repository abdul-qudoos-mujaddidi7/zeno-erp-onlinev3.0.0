-- MySQL 8.0+ -- standalone migration for the fiscal-year foundation (Step 3).
--
-- This migration ONLY creates the new structure. It deliberately does not:
--   * touch journals, accounts, balances, sales, purchases, payments,
--     stock_transactions or any other existing table;
--   * recalculate or backfill anything;
--   * insert a default fiscal year for any organization.
--
-- Fiscal years are created explicitly per organization through
-- POST /api/v2/fiscal-years, because only the customer knows whether their
-- books run January-December or on a different cycle.
--
-- `local_id` is the client/API identifier used by every other ERP table.
-- `fiscal_status` follows the existing naming convention (bill_status,
-- invoice_status, waste_status, transfer_status) and is OPEN/CLOSED.
-- `status` keeps the application-wide soft-delete meaning (1 = active).
CREATE TABLE fiscal_years (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  fiscal_status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  closed_at DATETIME(3) NULL,
  closed_by BIGINT UNSIGNED NULL,
  note TEXT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fiscal_years_local (org_id, local_id),
  KEY ix_fiscal_years_range (org_id, start_date, end_date),
  KEY ix_fiscal_years_status (org_id, fiscal_status, status),
  CONSTRAINT chk_fiscal_years_dates CHECK (start_date <= end_date)
) ENGINE=InnoDB;

-- INTENTIONALLY NO DATA INSERTS.
--
-- Every organization must create its own fiscal years explicitly. Overlap is
-- enforced in the service transaction (MySQL has no exclusive-range
-- constraint), so seeding rows here would risk colliding with the customer's
-- real books.
