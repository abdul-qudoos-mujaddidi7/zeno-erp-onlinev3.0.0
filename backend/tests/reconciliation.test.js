/*
 * reconciliation.test.js
 *
 * Step 0 tests. These run entirely against a fake executor — there is
 * NO database connection, so real production data is never touched.
 *
 * Every test also asserts that the reconciliation run issued only
 * SELECT statements (no INSERT / UPDATE / DELETE / DDL).
 */

/*
 * Force placeholder DB settings BEFORE loading the service.
 *
 * services/reconciliation.service -> database/pool -> db.js throws
 * when DB_* env vars are missing. mysql2.createPool() only opens
 * connections lazily, and this suite always injects a fake executor,
 * so no socket is ever opened and no real database is touched.
 */
process.env.DB_HOST = 'reconciliation-test-host';
process.env.DB_USER = 'reconciliation-test-user';
process.env.DB_PASSWORD = 'reconciliation-test-password';
process.env.DB_NAME = 'reconciliation-test-db';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const reconciliationService =
  require('../services/reconciliation.service');

const USER = { org_id: 42, local_id: 7 };

const WRITE_PATTERN =
  /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

/*
 * Executor stub. Routes are keyed by the `recon:<marker>` comment that
 * every repository query carries; a handler may be an array of rows or
 * a function ({ sql, values }) => rows.
 */
function createFakeExecutor(routes = {}) {
  const executed = [];

  return {
    executed,

    async execute(sql, values = []) {
      executed.push({ sql, values });

      const match = String(sql).match(/recon:([a-z_]+)/);
      const marker = match ? match[1] : null;
      const handler = marker ? routes[marker] : undefined;

      let rows = [];

      if (typeof handler === 'function') {
        rows = handler({ sql, values }) || [];
      } else if (Array.isArray(handler)) {
        rows = handler;
      }

      return [rows, []];
    },
  };
}

async function runReport(routes, filters = {}) {
  const executor = createFakeExecutor(routes);

  const report = await reconciliationService.getReconciliationReport({
    user: USER,
    filters,
    executor,
  });

  assertReadOnly(executor.executed);
  assertOrgScoped(executor.executed, USER.org_id);

  return { report, executor };
}

function assertReadOnly(executed) {
  for (const { sql } of executed) {
    assert.equal(
      WRITE_PATTERN.test(sql),
      false,
      `reconciliation emitted a non-read statement: ${sql}`,
    );
    assert.match(sql, /\bSELECT\b/i);
  }
}

function assertOrgScoped(executed, orgId) {
  for (const { sql, values } of executed) {
    if (/information_schema/i.test(sql)) continue;

    assert.ok(
      /org_id\s*=\s*\?/i.test(sql) || /\bid\s*=\s*\?/i.test(sql),
      `query is not org-scoped: ${sql}`,
    );
    assert.ok(
      values.includes(orgId),
      `orgId ${orgId} was not bound: ${sql}`,
    );
  }
}

/* ---------------------------- journals ---------------------------- */

test('balanced journal reports OK with no unbalanced rows', async () => {
  const { report } = await runReport(
    {
      journal_totals: [
        { currency: 'AFN', journal_count: 2, debit: 100, credit: 100 },
      ],
      journals_unbalanced: [],
    },
    { sections: 'journals' },
  );

  assert.equal(report.journals.checked, 2);
  assert.equal(report.journals.unbalanced.length, 0);
  assert.equal(report.summary.status, 'OK');
  assert.equal(report.summary.errors, 0);
});

test('unbalanced journal is flagged as ERROR with its difference', async () => {
  const { report } = await runReport(
    {
      journal_totals: [
        { currency: 'AFN', journal_count: 1, debit: 100, credit: 90 },
      ],
      journals_unbalanced: [
        {
          id: 10,
          date: '2026-01-01',
          reference_type: 'sale',
          reference_id: 1,
          currency: 'AFN',
          description: 'broken',
          total_debit: 100,
          total_credit: 90,
        },
      ],
    },
    { sections: 'journals' },
  );

  assert.equal(report.journals.unbalanced.length, 1);
  assert.equal(report.journals.unbalanced[0].difference, 10);
  assert.equal(report.summary.status, 'ERROR');
  assert.ok(report.summary.errors >= 1);
});

/* ---------------------------- accounts ---------------------------- */

test('stored accounts.balance differing from journal balance is reported', async () => {
  const { report } = await runReport(
    {
      account_totals_first: [
        { account_id: 10, currency: 'AFN', debit: 0, credit: 500, journal_count: 1 },
      ],
      account_totals_second: [],
      accounts_meta: [
        {
          local_id: 10,
          code: 'CASH',
          name: 'Cash',
          account_type_id: 1,
          currency: 'AFN',
          balance: 450,
          status: 1,
        },
      ],
    },
    { sections: 'accounts' },
  );

  assert.equal(report.accounts.checked, 1);
  assert.equal(report.accounts.differences.length, 1);
  assert.equal(report.accounts.differences[0].calculated_balance, 500);
  assert.equal(report.accounts.differences[0].stored_balance, 450);
  assert.equal(report.accounts.differences[0].difference, -50);
  assert.equal(report.summary.status, 'WARNING');
});

/* ---------------------------- sales ---------------------------- */

test('correct sale remaining produces no mismatch', async () => {
  const { report } = await runReport(
    {
      sales_confirmed_count: [{ total: 5 }],
      sales_remaining: [],
    },
    { sections: 'sales' },
  );

  assert.equal(report.sales.checked, 5);
  assert.equal(report.sales.remaining_mismatches.length, 0);
  assert.equal(report.summary.status, 'OK');
});

test('incorrect stored sale remaining is flagged', async () => {
  const { report } = await runReport(
    {
      sales_confirmed_count: [{ total: 1 }],
      sales_remaining: [
        {
          id: 102,
          invoice_number: 'INV-102',
          currency: 'AFN',
          invoice_status: 'confirmed',
          total_amount: 100000,
          stored_remaining: 40000,
          active_payments: 60000,
          active_returns: 10000,
          expected_remaining: 30000,
        },
      ],
    },
    { sections: 'sales' },
  );

  const [mismatch] = report.sales.remaining_mismatches;
  assert.equal(mismatch.expected_remaining, 30000);
  assert.equal(mismatch.stored_remaining, 40000);
  assert.equal(mismatch.difference, 10000);
  assert.equal(mismatch.status, 'ERROR');
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- purchases ---------------------------- */

test('correct purchase remaining produces no mismatch', async () => {
  const { report } = await runReport(
    {
      purchases_confirmed_count: [{ total: 3 }],
      purchases_remaining: [],
    },
    { sections: 'purchases' },
  );

  assert.equal(report.purchases.checked, 3);
  assert.equal(report.purchases.remaining_mismatches.length, 0);
  assert.equal(report.summary.status, 'OK');
});

test('incorrect stored purchase remaining is flagged', async () => {
  const { report } = await runReport(
    {
      purchases_confirmed_count: [{ total: 1 }],
      purchases_remaining: [
        {
          id: 55,
          bill_number: 'BILL-55',
          currency: 'AFN',
          bill_status: 'confirmed',
          total_amount: 50000,
          stored_remaining: 20000,
          active_payments: 20000,
          active_returns: 0,
          expected_remaining: 30000,
        },
      ],
    },
    { sections: 'purchases' },
  );

  const [mismatch] = report.purchases.remaining_mismatches;
  assert.equal(mismatch.difference, -10000);
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- stock ---------------------------- */

test('matching product and warehouse quantities produce no mismatch', async () => {
  const { report } = await runReport(
    {
      product_stock: [
        {
          product_id: 1,
          name: 'A',
          code: 'A1',
          product_quantity: 100,
          warehouse_quantity: 100,
          warehouse_row_count: 1,
        },
      ],
      warehouse_totals: [{ product_id: 1, warehouse_id: 1, quantity: 100, row_count: 1 }],
    },
    { sections: 'stock' },
  );

  assert.equal(report.stock.checked_products, 1);
  assert.equal(report.stock.product_warehouse_mismatches.length, 0);
  assert.equal(report.summary.status, 'OK');
});

test('product / warehouse quantity mismatch is flagged as ERROR', async () => {
  const { report } = await runReport(
    {
      product_stock: [
        {
          product_id: 1,
          name: 'A',
          code: 'A1',
          product_quantity: 100,
          warehouse_quantity: 95,
          warehouse_row_count: 1,
        },
      ],
      warehouse_totals: [{ product_id: 1, warehouse_id: 1, quantity: 95, row_count: 1 }],
    },
    { sections: 'stock' },
  );

  const [mismatch] = report.stock.product_warehouse_mismatches;
  assert.equal(mismatch.difference, 5);
  assert.equal(report.summary.status, 'ERROR');
});

test('duplicate warehouse rows are flagged', async () => {
  const { report } = await runReport(
    {
      warehouse_duplicates: [
        { warehouse_id: 1, product_id: 1, row_count: 2, total_quantity: 149 },
      ],
    },
    { sections: 'stock' },
  );

  assert.equal(report.stock.duplicate_warehouse_rows.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- FIFO / LIFO batches ---------------------------- */

test('FIFO batches matching product and warehouse stock produce no mismatch', async () => {
  const { report } = await runReport(
    {
      inventory_method: [{ inventory_method: 'FIFO' }],
      product_stock: [
        {
          product_id: 1,
          name: 'A',
          code: 'A1',
          product_quantity: 50,
          warehouse_quantity: 50,
          warehouse_row_count: 1,
        },
      ],
      warehouse_totals: [{ product_id: 1, warehouse_id: 1, quantity: 50, row_count: 1 }],
      batch_totals_product: [
        { product_id: 1, batch_remaining: 50, batch_in: 50, batch_count: 1 },
      ],
      batch_totals_warehouse: [
        { product_id: 1, warehouse_id: 1, batch_remaining: 50, batch_count: 1 },
      ],
    },
    { sections: 'batches' },
  );

  assert.equal(report.batches.is_batch_method, true);
  assert.equal(report.batches.mismatches.length, 0);
  assert.equal(report.batches.warehouse_mismatches.length, 0);
  assert.equal(report.summary.status, 'OK');
});

test('FIFO batch quantity mismatch is flagged', async () => {
  const { report } = await runReport(
    {
      inventory_method: [{ inventory_method: 'FIFO' }],
      product_stock: [
        {
          product_id: 1,
          name: 'A',
          code: 'A1',
          product_quantity: 50,
          warehouse_quantity: 50,
          warehouse_row_count: 1,
        },
      ],
      warehouse_totals: [{ product_id: 1, warehouse_id: 1, quantity: 50, row_count: 1 }],
      batch_totals_product: [
        { product_id: 1, batch_remaining: 45, batch_in: 50, batch_count: 1 },
      ],
      batch_totals_warehouse: [
        { product_id: 1, warehouse_id: 1, batch_remaining: 45, batch_count: 1 },
      ],
    },
    { sections: 'batches' },
  );

  assert.equal(report.batches.mismatches.length, 1);
  assert.equal(report.batches.mismatches[0].difference, 5);
  assert.equal(report.batches.warehouse_mismatches.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

test('batch consumption mismatch is flagged', async () => {
  const { report } = await runReport(
    {
      inventory_method: [{ inventory_method: 'LIFO' }],
      batch_consumption_mismatch: [
        {
          stock_batch_id: 9,
          product_id: 1,
          warehouse_id: 1,
          quantity_in: 100,
          quantity_remaining: 40,
          net_consumed: 30,
        },
      ],
    },
    { sections: 'batches' },
  );

  assert.equal(report.batches.consumption_mismatches.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- payments ---------------------------- */

test('orphan payment is flagged', async () => {
  const { report } = await runReport(
    {
      sale_payment_orphans: [
        { id: 1, sale_id: 999, account_id: 3, amount: 100, currency: 'AFN' },
      ],
    },
    { sections: 'payments' },
  );

  assert.equal(report.payments.orphaned.length, 1);
  assert.equal(report.payments.orphaned[0].parent_type, 'sale');
  assert.equal(report.summary.status, 'ERROR');
});

test('payment without a related journal is reported', async () => {
  const { report } = await runReport(
    {
      payments_no_journal: [
        {
          parent_type: 'sale',
          id: 5,
          parent_id: 1,
          account_id: 3,
          amount: 250,
          currency: 'AFN',
          payment_date: '2026-01-05',
          description: null,
        },
      ],
    },
    { sections: 'payments' },
  );

  assert.equal(report.payments.missing_journals.length, 1);
  assert.equal(report.summary.status, 'WARNING');
});

test('journal pointing at a missing payment is a hard error', async () => {
  const { report } = await runReport(
    {
      journal_missing_payment: [
        { id: 3, reference_type: 'sale_payment', reference_id: 777, currency: 'AFN' },
      ],
    },
    { sections: 'payments' },
  );

  assert.equal(report.payments.journal_references_missing_payment.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- returns ---------------------------- */

test('sale return larger than sold quantity is flagged', async () => {
  const { report } = await runReport(
    {
      sale_return_qty_exceeds: [
        { sale_id: 1, product_id: 5, returned_quantity: 12, sold_quantity: 10 },
      ],
    },
    { sections: 'returns' },
  );

  assert.equal(report.returns.issues.length, 1);
  assert.equal(report.returns.issues[0].issue, 'RETURN_QUANTITY_EXCEEDS_SOLD');
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- soft delete ---------------------------- */

test('active payment on an inactive sale is flagged', async () => {
  const { report } = await runReport(
    {
      payment_parent_inactive: [
        { parent_type: 'sale', id: 1, parent_id: 2, amount: 50, currency: 'AFN' },
      ],
    },
    { sections: 'payments' },
  );

  assert.equal(report.payments.parent_inactive.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

test('inactive product holding active stock is flagged', async () => {
  const { report } = await runReport(
    {
      inactive_product_active_stock: [
        {
          product_id: 4,
          product_quantity: 10,
          warehouse_quantity: 10,
          warehouse_row_count: 1,
        },
      ],
    },
    { sections: 'softDelete' },
  );

  assert.equal(report.softDelete.issues.length, 1);
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- dates ---------------------------- */

test('null and malformed financial dates are reported', async () => {
  const { report } = await runReport(
    {
      date_quality: ({ sql }) =>
        sql.includes('FROM journals')
          ? [
              {
                total_rows: 10,
                null_count: 1,
                malformed_count: 2,
                min_value: 'not-a-date',
                max_value: '2026-02-01 00:00:00',
              },
            ]
          : [
              {
                total_rows: 0,
                null_count: 0,
                malformed_count: 0,
                min_value: null,
                max_value: null,
              },
            ],
      schema_columns: [
        {
          table_name: 'journals',
          column_name: 'date',
          column_type: 'datetime',
          is_nullable: 'YES',
        },
      ],
    },
    { sections: 'dates' },
  );

  const issues = report.dates.issues;
  assert.ok(issues.some((issue) => issue.issue === 'MALFORMED_DATE_VALUES'));
  assert.ok(issues.some((issue) => issue.issue === 'NULL_DATE_VALUES'));
  assert.equal(report.summary.status, 'ERROR');
});

/* ---------------------------- org isolation + read-only ---------------------------- */

test('every query is org-scoped and read-only across all sections', async () => {
  const { report, executor } = await runReport({});

  assert.equal(report.org_id, USER.org_id);
  assert.equal(report.read_only, true);
  assert.equal(report.organization.inventory_method, 'CLASSIC');
  assert.equal(report.summary.status, 'OK');
  assert.ok(executor.executed.length > 0);
});

test('section selection skips unrequested work', async () => {
  const { report, executor } = await runReport(
    { journal_totals: [{ currency: 'AFN', journal_count: 1, debit: 5, credit: 5 }] },
    { sections: 'journals' },
  );

  assert.equal(report.accounts.skipped, true);
  assert.equal(report.stock.skipped, true);
  assert.equal(report.payments.skipped, true);

  for (const { sql } of executor.executed) {
    assert.ok(
      !/FROM sale_payments\b/i.test(sql),
      'payments query ran even though the section was skipped',
    );
  }
});

test('limit caps the number of returned anomaly rows', async () => {
  const manyPayments = Array.from({ length: 10 }, (_, index) => ({
    parent_type: 'sale',
    id: index + 1,
    parent_id: 1,
    account_id: 3,
    amount: 100,
    currency: 'AFN',
    payment_date: '2026-01-01',
    description: null,
  }));

  const { report } = await runReport(
    { payments_no_journal: manyPayments },
    { sections: 'payments', limit: 3 },
  );

  assert.equal(report.payments.missing_journals.length, 3);
  assert.equal(report.payments.missing_journals_truncated, true);
});
