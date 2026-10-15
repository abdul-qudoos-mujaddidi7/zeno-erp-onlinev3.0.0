# ZenoERP performance hardening — report (2026‑10‑15)

Base commit: `3723c2f` (main). All timings below are **measured**, and each one says
where it was measured. Beta = the database `backend/.env` points at
(`localhost`, `beta_zenoerp`, MariaDB 10.4.32). Nothing in this work was applied to
production.

## 1. What was changed

| File | Change | Status |
| --- | --- | --- |
| `backend/middleware/auth.js` | Token → user resolved by primary key (`u.id = t.user_pk`) with a legacy fallback statement, instead of the `ON u.id = t.user_pk OR (t.user_pk IS NULL AND u.local_id = t.user_id)` join that forced a full `users` scan per request | modified, tested |
| `backend/tests/subscription-enforcement.test.js` | Tests for the split lookup (upgrade path, ambiguous legacy token, PK path) | modified, passing |
| `backend/migrations/20261015_document_number_indexes.sql` | **new** — `idx_sales_org_invoice`, `idx_purchases_org_bill` | new, not committed |
| `backend/migrations/20261015_stock_transaction_date_indexes.sql` | **new** — `idx_stock_transactions_org_date`, `idx_stock_transactions_org_product_date` | new, not committed |
| `backend/migrations/20261015_warehouse_product_indexes.sql` | **new** — `idx_warehouse_products_org_status_warehouse` | new, not committed |
| `backend/repositories/warehouse-product.repository.js` | `findAll` gains optional `pagination` via `paginateSelect` (same SQL/order when `pagination` is null) | modified, tested |
| `backend/services/warehouse-product.service.js` | passes `resolvePagination(filters)` through | modified, tested |
| `backend/controllers/warehouse-product.controller.js` | `list` answers through `sendListResponse` (adds `meta` only when a page was requested) | modified, tested over HTTP |
| `backend/validators/warehouse-product.validator.js` | list query merges `paginationQuerySchema` (`page`/`limit`/`offset`), `status` still defaults to 1 | modified, tested |
| `backend/tests/warehouse-product-pagination.test.js` | **new** — 5 tests for the above contract | new, passing |
| `frontend/src/api/warehouseProductApi.js` | optional `page`/`limit`, sent **only** when a caller passes them | modified, 6 new frontend tests + HTTP-verified |
| `frontend/src/api/warehouseProductApi.test.js` | **new** — locks down that an unpaginated caller sends no `page`/`limit` (the one way this could silently truncate 20 lists to 15 rows) | new, passing |

Not mine, already in the working tree when I finished: `frontend/src/config.js`
(`app_version` `v3.2.6` → `v3.2.7`). Left untouched. The five files listed as
changed at the start of this session (`smart-super-admin` CSS/context/table/test)
are no longer modified in the working tree — they were committed by someone else
while this ran; I did not touch them.

## 2. Task 1 — auth token lookup: deployment-ready

The change replaces one statement with two exactly-equivalent ones. Equivalence
was proven on real data, not argued: **402 live tokens** (including 42 ambiguous
legacy paths) were resolved through both the old OR-join and the new pair — **0
mismatches**. Directly against the pool today: PK branch 1 row for a valid token,
legacy branch 0 rows, old OR-join 1 row — identical outcome.

`backend/tests/subscription-enforcement.test.js` (7 tests) passes, including the
ambiguity rejection and the legacy-upgrade `UPDATE`. Ready to deploy with the rest
of the backend.

## 3. Task 2 — index review against the real query shapes

Both migrations already in the repo were checked against the SQL the code actually
sends (`EXPLAIN` + timings, beta, `SQL_NO_CACHE`, `IGNORE INDEX` to force the
no-index plan):

**`20261015_stock_transaction_list_indexes.sql`** — all five indexes end in
`created_at`, which is the list's *default* order (`created_at DESC, local_id
DESC`) and every filter the page offers (`status`, `product_id`, `warehouse_id`,
`transaction_type`). Measured on org 21 (65,550–67,380 rows): page 1 of the default
order **71 ms → 1.1 ms**, each filtered variant 68–99 ms → ~1 ms.

**Gap found:** the *unpaginated* read `findAll` — the product view, the
edit/delete modals and every internal reconciliation — orders by
`date DESC, local_id DESC` (`stock-transaction.repository.js:220`). **No shipped
index covers `date`**, so `EXPLAIN` says `Using filesort` for all of them. Covered
by the new `20261015_stock_transaction_date_indexes.sql`.

**`20261015_journal_indexes.sql`** — all four indexes exist on beta (so applying
the file there is a no-op) and match the shapes: list `(org_id, status, date,
local_id)`, account filter index-merge pair, and the two covering balance indexes.
No change needed.

**Existence check:** `scripts/run-migration.js` asks `information_schema.statistics`
before each statement and prints `SKIP <index> already exists`; running all three
new files against beta printed **4 × SKIP** (the indexes created while measuring,
plus `idx_sales_org_invoice` which pre-existed) — idempotency verified, no data
touched.

**Indexes deliberately *not* shipped:** the out-of-band `idx_sync_org_updated_at
(org_id, updated_at)` on six tables. `EXPLAIN` shows the planner does not choose it
even where it exists (it prefers `org_local`, and the delta reads are cheap because
`LIMIT` short-circuits). Shipping it would only add write amplification.

## 4. Task 4 — `sales/next-number` and the `/logs` hold

**Root cause (measured).** `previewNextInvoiceNumber` → `allocateInvoiceNumber`
proves each candidate number free with
`SELECT 1 FROM sales WHERE org_id = ? AND invoice_number = ? LIMIT 1`, in a `while`
loop. On beta, largest org (22,282 sales):

| | plan | time |
| --- | --- | --- |
| with `idx_sales_org_invoice` | `key=idx_sales_org_invoice`, `Using index` (covering) | **0.45 ms** |
| without it | `key=org_local`, 22,282 rows scanned | **27.92 ms** (62×) |

That index **ships in no migration** — it exists on beta only because someone added
it by hand. `purchases` has the identical loop (`billNumberExists`) and had no index
at all. Connection-pool wait for this endpoint measured at **0.02 ms** locally, and
both settings reads total **1.25 ms**, so the local SQL cost is well under 2 ms —
the production 347–446 ms cannot come from the SQL itself. The loop's per-iteration
cost is the leading explanation, and it is only that expensive **without** the index.

`/logs` connection-hold fix: **already in committed code and verified by reading
it** — `waitForCommand` (the 10 s command poll) holds no connection
(`server.js:469`), `insertLogs` batches one INSERT per request and releases before
the poll, and `claimPendingCommand`/`/execute-command/` release in `finally`. No
change needed.

## 5. Task 5 — payloads: what is left

Measured on beta, org 163 (3,219 products), through the service layer — the same
rows the API serialises:

| endpoint | today | with one page | rows |
| --- | --- | --- | --- |
| `products?status=1` | **2,639 KB** (31 ms) | **12 KB** (12 ms) | 3,219 → 15 |
| `accounts?status=1` | **612 KB** (12 ms) | **9 KB** (5 ms) | 979 → 15 |
| `warehouse-products` | **2,122 KB** (52 ms) | 15 rows, 80-byte envelope | 6,434 → 15 |

**`products` and `accounts` index pages are already server-paginated**
(`ProductsIndex.svelte` sends `page`/`limit` and reads `readListMeta`;
`AccountsIndex.svelte` likewise; `productApi`/`accountApi` already carry the
params). The large payloads above come from the *other* callers — the ~20
form/dropdown lookups that legitimately want the whole list.

**`warehouse-products` was the real gap** and is now paginated additively. Caller
inventory (all inspected): `WarehouseView` (a single warehouse), `Warehouses`,
`POS`, `StockAdjustments`, and item tables in sale, purchase, prescriptions,
inventory records, BOM, production, product form — 20 call sites, all of them
`getAll({ status: 1, ... })?.data || []`. None of them send `page`/`limit`, so
none of them changed behaviour (verified over HTTP: 1,414 rows returned, no `meta`
key). The page-level wiring — making `WarehouseView` ask for a page and render
paging controls, as `ProductsIndex` already does — is **not done**; it needs the
page's client-side search/derived-total logic moved server-side first, which is a
visible-behaviour change and was out of scope for this pass.

## 6. Task 7 — tests

Backend, full suite (`node --test`, 491 passing — 486 before, +5 new
warehouse-product tests):

```
✔ 491 passing
✖ the v2 index registers the fiscal-year routes behind auth
✖ Smart Super Admin login is handled by its separate route module
```

Both failures were **reproduced on a clean `HEAD` worktree** (unmodified
`auth.js`, no new migrations): the first asserts a regex over `routes/v2/index.js`
that a permission guard (`guardFiscalYears,`) now sits in the middle of, the second
asserts the old smart-super-admin login redirect. **Pre-existing, unrelated to this
work.** 486 → 491 because of the 5 new warehouse-product tests.

Frontend (`vitest run`): **265 passing** (259 before, +6 new), 4 failing —
`dashboard-cards.test.js` (3) and `amountInWords.test.js` (1). Neither imports
anything changed here, so they are unaffected by this work; I did not reproduce
them at HEAD, so they are reported as unrelated-but-unverified rather than proven
pre-existing.

Interface checks actually run, not just unit tests:

* the endpoint over real HTTP (server on `:3999`, read-only token): unpaginated
  `{success,data}` with 1,414 rows and **no** `meta`; `page=1`/`page=2` → 15 rows
  + `{total:1414, totalPages:95}`; `status=1&product_id=1045` → 1 row, no `meta`;
  `status=0` → 200; `page=0` → 422 (rejected by validation).
* the auth SQL pair and the old OR-join executed side by side against the live
  pool for a real token: 1 row / 0 rows / 1 row — same user resolved.

## 7. Task 3 — deployment plan (nothing applied automatically)

**Preconditions**

1. **Back up first.** `mysqldump --single-transaction --routines --triggers <prod> > backup-$(date +%F).sql` (or the hosting snapshot). No migration below runs before the backup is verified restorable.
2. Confirm, read-only, what production already has:
   `SHOW INDEX FROM sales; SHOW INDEX FROM purchases; SHOW INDEX FROM warehouse_products; SHOW INDEX FROM stock_transactions;`
   This decides whether step 3 is a no-op or a build, and whether the `sales/next-number` hypothesis holds.
3. Identify the quiet window: the three index builds touch 4 hot tables (`sales`, `purchases`, `warehouse_products`, `stock_transactions`). On beta they took 26 ms–1.3 s at 20k–136k rows; production is larger.

**Order**

1. Deploy the backend code (auth token fix + warehouse-product pagination + API client). Independently safe: the auth change is equivalence-proven, and every non-paginated caller gets the same body as before.
2. `node scripts/run-migration.js 20261015_document_number_indexes.sql` — one file at a time, `--dry-run` first; the runner prints `OK`/`SKIP` per statement and refuses anything non-additive.
3. `node scripts/run-migration.js 20261015_stock_transaction_date_indexes.sql`
4. `node scripts/run-migration.js 20261015_warehouse_product_indexes.sql`
5. Re-check the plans in production: `EXPLAIN` the next-number lookup, the stock-transaction `ORDER BY date` reads, and the warehouse-products list; confirm `key=` is the new index and no `Using filesort`.

**Rollback:** code — redeploy the previous build (no data migration to undo). Indexes — `DROP INDEX <name> ON <table>`; they are additive, so dropping them returns the planner to the old plan with no data at risk. Nothing here rewrites rows.

## 8. Risks

- **Write amplification.** Three new indexes on tables written by every sale, purchase, adjustment, transfer, production and waste. That is the price of the read wins; the journal migration already flags the same trade-off. If a write-heavy window regresses, drop the least valuable index first (`idx_stock_transactions_org_product_date`, which only removes a filesort for one product's history).
- **`CREATE INDEX` locks.** On a large production table the build blocks writes for its duration. Use the quiet window, or `ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE` manually if the MariaDB version supports it (the migration runner only issues plain `CREATE INDEX`).
- **Production numbers are not yet verified.** Everything measured here is beta; production table sizes and data distribution differ.
- **`purchases` clobbered-counter fallback** still runs `MAX(CAST(bill_number AS UNSIGNED)) ... REGEXP '^[0-9]+$'`, which cannot use an index. It only runs when the counter is missing/corrupt, so it was left alone.

## 9. Remaining work

1. Wire `WarehouseView` (and optionally `Warehouses`, `POS`, `StockAdjustments`) to request pages, after moving their client-side search/totals server-side.
2. Apply and verify the three migrations on production (with backup), then re-measure.
3. Task 8: read-only production timings for the product view, sale form, product form, POS, purchase form, sale view, purchase view — before/after. Use read-only requests only; none of it has been done yet, so **no production fix is claimed complete**.
4. Optionally ship the products-payload reduction for the biggest non-index callers by adding `product_ids` scoping to the item tables, which currently pull all products.
