# Inventory & Sync Regression Checklist

## General sync
- [ ] Settings still sync
- [ ] Products still sync
- [ ] Purchases still sync
- [ ] Sales still sync
- [ ] Images still load
- [ ] Incremental pull works
- [ ] Full pull works
- [ ] Multi-tab sync lock works
- [ ] `last_synced_at` updates after sync
- [ ] Server updates map `local_id` → Dexie `id`
- [ ] Organization switch clears local data
- [ ] Unrelated tables unchanged

## Inventory (CLASSIC)
- [ ] Opening stock creates `stock_transaction` only
- [ ] Purchase confirm creates transaction only (no batch)
- [ ] Sale creates no batch consumption
- [ ] Returns create no batch restoration

## Inventory (FIFO)
- [ ] Purchase 10@$20 + 30@$40, sell 25 → COGS $800
- [ ] Partial sale return restores original batches
- [ ] Purchase return reduces original purchase batch

## Inventory (LIFO)
- [ ] Same purchases, sell 25 → COGS $1000

## Edge cases
- [ ] Decimal quantity 0.1
- [ ] Duplicate operation_key skipped on retry
- [ ] Waste and warehouse transfer update stock
- [ ] MySQL DECIMAL values remain strings on download
- [ ] Existing IndexedDB FIFO rows survive Dexie v2 upgrade

## Automated
Run `npm test` — 6 unit tests for allocation and decimal helpers.
