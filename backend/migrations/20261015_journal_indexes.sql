-- Journals: ship the indexes the planner is already using.
--
-- Why this migration exists (measured with EXPLAIN and timed on the largest
-- organisation, 67,843 journals for org 21):
--
-- Four indexes on `journals` exist on the database this repository's .env
-- points at, but no file in migrations/ creates any of them. They were added
-- out-of-band at some point, so they are present wherever someone applied them
-- by hand and absent everywhere else. A database built from migrations/ - a new
-- staging box, a rebuilt replica, a fresh production - silently runs the
-- journals screens without them.
--
-- `EXPLAIN` shows the plan the code depends on, and what it becomes without it:
--
--   journals list, page 1
--     with the index ..... type=range key=idx_journals_org_status_date
--                          extra=Using where                    1.8 ms
--     without it ......... type=ref   key=org_local
--                          extra=Using where; Using filesort   166 ms  (93x)
--
--   account-filtered list
--     with the indexes ... type=index_merge
--                          key=idx_journals_org_status_accounts,idx_journals_bal_second
--                          rows=2  (sort_union)
--     without them ....... full organisation scan
--
--   account balance aggregates (Accounts page, dashboards)
--     with the indexes ... key=idx_journals_bal_first  extra=Using index
--                          (covering: no row lookups at all)
--
-- `Using filesort` on the list is the reported symptom: the page sorts the
-- whole organisation's history for every page turn and every count.
--
-- Additive only, and idempotent: scripts/run-migration.js refuses anything that
-- is not CREATE TABLE / CREATE INDEX / ADD COLUMN, and skips an index that is
-- already there, so running this against a database that already has them (as
-- this one does) is a no-op. No row is read or written.
--
-- Cost, stated plainly: four more indexes on a hot table. They cost write
-- amplification on every INSERT/UPDATE of `journals` and one index build per
-- server. Apply them one file at a time with scripts/run-migration.js, which
-- prints OK/SKIP per statement, and run it in a quiet window on a large
-- production table.

-- The list's own order and filter. This is the one the journals page cannot do
-- without: the list is `WHERE org_id = ? AND status = ? ORDER BY date DESC,
-- local_id DESC LIMIT 15`, and only this column order answers both.
CREATE INDEX idx_journals_org_status_date
  ON journals (org_id, status, date, local_id);

-- The account filter the page offers next to it. The condition is
-- `(first_entry_account = ? OR second_entry_account = ?)`, which MySQL serves
-- with an index merge; this index is the first branch of that merge.
CREATE INDEX idx_journals_org_status_accounts
  ON journals (org_id, status, first_entry_account, second_entry_account);

-- Covering index for the account balances: the aggregate reads
-- credit/debit only, so with these columns on the index MySQL answers it with
-- `Using index` and never touches the table rows.
CREATE INDEX idx_journals_bal_first
  ON journals (org_id, status, first_entry_account, currency, first_entry_credit, first_entry_debit);

CREATE INDEX idx_journals_bal_second
  ON journals (org_id, status, second_entry_account, currency, second_entry_credit, second_entry_debit);
