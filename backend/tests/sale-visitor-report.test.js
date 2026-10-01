/*
 * sale-visitor-report.test.js
 *
 * The Visitor Report behind the Visitors tab of the sales page. Runs entirely
 * against a repository stub -- there is NO database connection, so production
 * data is never touched.
 *
 * What it locks down:
 *
 *   1. The commission reported is the amount the sales actually posted
 *      (`visitor_benefit`), never a freshly recomputed percentage.
 *   2. The company's share is the benefit minus that commission
 *      (100 - 10 = 90), and it can never be reported without the commission.
 *   3. Currencies are never added together: totals are kept per currency.
 *   4. Money is rounded to the storage precision, so float noise cannot reach
 *      the report.
 */

process.env.DB_HOST = 'sale-visitor-report-test-host';
process.env.DB_USER = 'sale-visitor-report-test-user';
process.env.DB_PASSWORD = 'sale-visitor-report-test-password';
process.env.DB_NAME = 'sale-visitor-report-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const saleRepository = require('../repositories/sale.repository');
const saleService = require('../services/sale.service');
const saleRouter = require('../routes/v2/sale.routes');
const { visitorReportQuerySchema } = require('../validators/sale.validator');

const ORG_ID = 42;
const USER = {
  org_id: ORG_ID,
  local_id: 7,
};

/*
 * Captured before the per-test stub replaces it, so the query the report really
 * builds can be inspected without a database.
 */
const realFindVisitorReport = saleRepository.findVisitorReport;

let state;

beforeEach(() => {
  state = {
    rows: [],
    received: null,
  };

  saleRepository.findVisitorReport = async (executor, params) => {
    state.received = params;

    return state.rows;
  };
});

function report(filters = {}) {
  return saleService.getVisitorReport({
    user: USER,
    filters,
  });
}

function row(overrides = {}) {
  return {
    visitor_account_id: '8841000000001',
    currency: 'AFN',
    visitor_name: 'Visitor A',
    visitor_name_fa: 'ویزیتور الف',
    visitor_percentage: '10.0000',
    sales_count: 2,
    total_amount: 400,
    total_benefit: 100,
    total_share: 10,
    company_share: 90,
    ...overrides,
  };
}

test('the report reports the posted commission and the company share, not a recomputed rate', async () => {
  state.rows = [row()];

  const result = await report();

  assert.equal(result.data[0].total_benefit, 100);
  assert.equal(result.data[0].total_share, 10);
  assert.equal(result.data[0].company_share, 90);
  assert.equal(result.meta.visitors, 1);
});

test('totals are summed per currency and never across currencies', async () => {
  state.rows = [
    row(),
    row({
      visitor_account_id: '8841000000002',
      visitor_name: 'Visitor B',
      sales_count: 1,
      total_amount: 300,
      total_benefit: 60,
      total_share: 6,
      company_share: 54,
    }),
    row({
      currency: 'USD',
      sales_count: 1,
      total_amount: 50,
      total_benefit: 20,
      total_share: 2,
      company_share: 18,
    }),
  ];

  const result = await report();

  assert.equal(result.meta.visitors, 2);
  assert.deepEqual(result.meta.by_currency.AFN, {
    currency: 'AFN',
    visitors: 2,
    sales_count: 3,
    total_amount: 700,
    total_benefit: 160,
    total_share: 16,
    company_share: 144,
  });
  assert.deepEqual(result.meta.by_currency.USD, {
    currency: 'USD',
    visitors: 1,
    sales_count: 1,
    total_amount: 50,
    total_benefit: 20,
    total_share: 2,
    company_share: 18,
  });
});

test('float noise is rounded to the storage precision', async () => {
  state.rows = [
    row({
      total_benefit: 0.1,
      total_share: 0.1 + 0.2,
      company_share: 333.33333333333337,
    }),
  ];

  const result = await report();

  assert.equal(result.meta.by_currency.AFN.total_share, 0.3);
  assert.equal(result.meta.by_currency.AFN.company_share, 333.333333);
});

test('an empty report is an empty list with zeroed metadata', async () => {
  state.rows = [];

  const result = await report();

  assert.deepEqual(result.data, []);
  assert.equal(result.meta.visitors, 0);
  assert.deepEqual(result.meta.by_currency, {});
});

test('the date range and a chosen currency reach the query', async () => {
  await report({
    date_from: '2026-09-01',
    date_to: '2026-09-30',
    currency: 'AFN',
  });

  assert.deepEqual(state.received, {
    orgId: ORG_ID,
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
    currency: 'AFN',
    productIds: [],
    visitorIds: [],
  });
});

test('multiple selected products reach the report query', async () => {
  await report({ product_ids: '11,22,33' });

  assert.deepEqual(state.received.productIds, [11, 22, 33]);
});

test('multiple selected visitor accounts reach the report query', async () => {
  await report({ visitor_ids: '10995116277761,22' });

  assert.deepEqual(state.received.visitorIds, [10995116277761, 22]);
});

test('junk in the visitor filter is dropped, never fatal', async () => {
  const result = await report({ visitor_ids: '11,abc,-4,0,nan,22' });

  assert.deepEqual(state.received.visitorIds, [11, 22]);
  assert.deepEqual(result.meta.by_currency, {});
});

test('no visitor filter means every visitor is reported', async () => {
  await report();

  assert.deepEqual(state.received.visitorIds, []);
});

/*
 * The visitor filter is pushed into SQL, not applied to the returned rows: the
 * report is an aggregate, so hiding rows afterwards would leave the totals
 * (and the summary cards) counting visitors the user filtered out.
 */
test('the visitor filter becomes an IN clause and keeps every other filter', async () => {
  let sql = '';
  let values = [];

  await realFindVisitorReport(
    {
      execute: async (statement, bound) => {
        sql = statement;
        values = bound;

        return [[], []];
      },
    },
    {
      orgId: ORG_ID,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      currency: 'AFN',
      visitorIds: [11, 22],
      productIds: [5],
    },
  );

  assert.match(sql, /s\.visitor_account_id IN \(\?, \?\)/);
  assert.match(sql, /s\.currency = \?/);
  assert.match(sql, /s\.invoice_date >= \?/);
  assert.match(sql, /visitor_filter_items\.product_id IN \(\?\)/);
  /* The ids sit in their own IN clause, next to the currency and product binds. */
  assert.deepEqual(values.slice(0, 5), [ORG_ID, 'AFN', 11, 22, 5]);
  assert.equal(values.length, 9);
  assert.ok(values.includes('2026-09-01') && values.includes('2026-09-30'));
});

test('without a visitor filter the report still covers every visitor', async () => {
  let sql = '';
  let values = [];

  await realFindVisitorReport(
    {
      execute: async (statement, bound) => {
        sql = statement;
        values = bound;

        return [[], []];
      },
    },
    { orgId: ORG_ID },
  );

  assert.equal(/s\.visitor_account_id IN/.test(sql), false);
  assert.deepEqual(values, [ORG_ID]);
});

test('"all" means every currency, so no currency filter is sent', async () => {
  await report({ currency: 'all' });

  assert.equal(state.received.currency, null);
});

/* ==================== wiring ==================== */

test('the sale router registers the visitor report ahead of /:id', () => {
  const routes = saleRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);

  assert.ok(routes.includes('GET /visitor-report'));
  /*
   * Ahead of /:id, or the report would be parsed as a sale id.
   */
  assert.ok(routes.indexOf('GET /visitor-report') < routes.indexOf('GET /:id'));
});

test('the report query takes a date range and defaults the currency to all', () => {
  assert.equal(visitorReportQuerySchema.parse({}).currency, 'all');
  assert.equal(
    visitorReportQuerySchema.safeParse({ date_from: '2026-09-01', date_to: '2026-09-30' }).success,
    true,
  );
  assert.equal(visitorReportQuerySchema.safeParse({ date_from: 'not-a-date' }).success, false);
  assert.equal(visitorReportQuerySchema.safeParse({ date_to: '2026/09/30' }).success, false);
  assert.equal(visitorReportQuerySchema.safeParse({ product_ids: '11,22,33' }).success, true);
  assert.equal(visitorReportQuerySchema.safeParse({ product_ids: '11,nope' }).success, false);
  assert.equal(visitorReportQuerySchema.safeParse({ visitor_ids: '11,22,33' }).success, true);
  assert.equal(visitorReportQuerySchema.safeParse({ visitor_ids: '11,nope' }).success, false);
  assert.equal(visitorReportQuerySchema.safeParse({ visitor_ids: '' }).success, false);
});
