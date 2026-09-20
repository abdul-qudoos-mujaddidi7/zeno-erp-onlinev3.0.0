-- MySQL 8.0+ / MariaDB 10.4+ -- standalone migration for Step 5
-- (fiscal-year ARCHIVE + balance roll-forward).
--
-- This migration creates exactly ONE new table. It deliberately does not:
--   * touch journals, accounts, balances, sales, purchases, payments,
--     stock_transactions or any other existing table;
--   * backfill or recalculate a single historical row;
--   * move or soft-delete historical documents (archiving is a PRESENTATION
--     concern: a closed year is filtered by its date range, never hidden by
--     rewriting status);
--   * create opening-balance rows for any organization (they are written by
--     the close transaction, per organization, only when a year is closed).
--
-- What the table is
-- -----------------
-- A fiscal-year OPENING BALANCE SNAPSHOT: the closing balance of one
-- balance-sheet account in one currency, as of the end of the source fiscal
-- year, carried into the receiving ("next") fiscal year.
--
-- It is intentionally NOT a journal. The historical journals of the closed
-- year still exist and still hold the same money, so posting an opening
-- journal would double-count every balance-sheet account. This table is a
-- derived, auditable snapshot:
--
--   current-year display balance = opening snapshot + movement inside the year
--
-- Signed amounts
-- --------------
-- `opening_balance` follows the balance convention used everywhere else in
-- this application (account.repository.findBalances): credit - debit, so a
-- positive number is a credit balance and a negative number a debit balance.
-- `balance_side` states the same fact readably for reports and the UI.
--
-- Currency
-- --------
-- Currencies are never summed. `currency` is a NOT NULL string with '' as the
-- "unspecified currency" bucket, because MySQL unique indexes do not consider
-- two NULLs equal — a nullable currency column would allow duplicate rows for
-- exactly the accounts that have no currency, defeating the idempotency
-- guarantee below. The value matches journals.currency verbatim otherwise.
--
-- Idempotency
-- -----------
-- `active_flag` is a generated column that is 1 while the row is active and
-- NULL when it is deactivated (status = 0). Unique indexes ignore NULLs, so
-- the unique key allows at most ONE active snapshot per
-- (organization, receiving year, account, currency, source) while still
-- keeping every deactivated generation as audit history. Reopening a year
-- deactivates its snapshots; closing it again writes a fresh generation
-- without ever colliding with (or silently overwriting) the previous one.
CREATE TABLE fiscal_year_opening_balances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,

  -- the fiscal year that RECEIVES this opening balance
  fiscal_year_id BIGINT UNSIGNED NOT NULL,

  -- the closed fiscal year the balance was closed out of (NULL for a manually
  -- entered snapshot that did not come from a close)
  source_fiscal_year_id BIGINT UNSIGNED NULL,

  -- the account that carries the balance forward
  account_id BIGINT UNSIGNED NOT NULL,

  -- '' means "unspecified currency"; otherwise journals.currency verbatim
  currency VARCHAR(16) NOT NULL DEFAULT '',

  -- signed closing balance of the source year: credit - debit
  opening_balance DECIMAL(20, 6) NOT NULL DEFAULT 0.000000,

  -- readable statement of the sign of opening_balance
  balance_side ENUM('debit', 'credit') NOT NULL DEFAULT 'credit',

  -- which origin produced the snapshot; the close engine writes
  -- 'fiscal_year_close', so a future manual opening-balance feature can
  -- coexist without fighting this unique key
  source VARCHAR(32) NOT NULL DEFAULT 'fiscal_year_close',

  note TEXT NULL,

  status TINYINT(1) NOT NULL DEFAULT 1,

  active_flag TINYINT(1)
    GENERATED ALWAYS AS (CASE WHEN status = 1 THEN 1 ELSE NULL END) STORED,

  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_fy_opening_local (org_id, local_id),
  UNIQUE KEY uq_fy_opening_active (
    org_id,
    fiscal_year_id,
    account_id,
    currency,
    source,
    active_flag
  ),
  KEY ix_fy_opening_source (org_id, source_fiscal_year_id, status),
  KEY ix_fy_opening_year_status (org_id, fiscal_year_id, status),
  KEY ix_fy_opening_account (org_id, account_id, status)
) ENGINE=InnoDB;

-- No FOREIGN KEY, for the same reason fiscal_years has none: every ERP table
-- in this schema is organization-scoped through (org_id, local_id) and the
-- relationship is enforced by the service transaction that writes the rows.

-- INTENTIONALLY NO DATA INSERTS.
--
-- Opening balances are written by POST /api/v2/fiscal-years/:id/close inside
-- the same transaction that closes the year, so a year can never be CLOSED
-- with its roll-forward half written. Seeding rows here would create opening
-- balances for organizations that never closed anything.
