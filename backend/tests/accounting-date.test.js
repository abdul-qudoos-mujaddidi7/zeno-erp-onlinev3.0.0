/*
 * accounting-date.test.js
 *
 * Step 3.5 tests. These run entirely against repository/pool stubs — there
 * is NO database connection, so real production data is never touched.
 *
 * They lock down the rule that an accounting date is a CALENDAR DATE taken
 * from the business document, not the moment the row happened to be posted:
 *
 *   1. utils/accountingDate never shifts a 'YYYY-MM-DD' day, and its
 *      fallback is the server's local calendar day rather than the UTC day.
 *   2. An account opening balance can carry an explicit effective_date, and
 *      omitting it keeps the previous behaviour for existing callers.
 */

process.env.DB_HOST = 'accounting-date-test-host';
process.env.DB_USER = 'accounting-date-test-user';
process.env.DB_PASSWORD = 'accounting-date-test-password';
process.env.DB_NAME = 'accounting-date-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../database/pool');

const accountRepository =
  require('../repositories/account.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const accountService =
  require('../services/account.service');

const {
  accountingDate,
  localDateOnly,
  isDateOnly,
} = require('../utils/accountingDate');

const {
  createAccountSchema,
} = require('../validators/account.validator');

const USER = { org_id: 42, local_id: 7 };

const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test',
  deviceInfo: 'node:test',
};

const NOTRACK = {
  id: 'ACC-NOTRACK',
  local_id: 'ACC-NOTRACK',
  code: 'NOTRACK',
  org_id: 42,
};

let state;
let connection;

function createConnection() {
  return {
    committed: false,
    rolledBack: false,
    released: false,

    async beginTransaction() {},
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
    async release() {
      this.released = true;
    },
    async execute() {
      return [[], []];
    },
  };
}

function installStubs() {
  state = { journals: [] };

  accountRepository.findByCode = async (conn, { code }) => {
    if (code === 'NOTRACK') {
      return NOTRACK;
    }

    /* 'CASH' and every other code a test creates is free. */
    return state.accounts?.get(code) || null;
  };

  accountRepository.create = async (conn, { orgId, localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: orgId,
    status: 1,
    ...data,
  });

  journalRepository.create = async (conn, { orgId, localId, data }) => {
    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: data.status ?? 1,
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  activityRepository.create = async () => ({});

  connection = createConnection();
  pool.getConnection = async () => connection;
}

beforeEach(() => {
  installStubs();
});

/* ====================== the normalization helper ====================== */

test('a YYYY-MM-DD accounting date is returned untouched', () => {
  /*
   * The regression this guards: new Date('2026-12-31').toISOString() is
   * safe, but new Date('2026-12-31T00:00:00+04:30').toISOString() is not,
   * and neither is any path that builds a Date in local time. A date-only
   * string must never be round-tripped through Date at all.
   */
  assert.equal(accountingDate('2026-12-31'), '2026-12-31');
  assert.equal(accountingDate('2026-01-01'), '2026-01-01');
  assert.equal(accountingDate(' 2026-07-15 '), '2026-07-15');
});

test('a Date is passed through so the instant is preserved', () => {
  const instant = new Date('2026-12-31T21:30:00.000Z');

  assert.equal(accountingDate(instant), instant);
});

test('an unparseable Date falls back instead of writing Invalid Date', () => {
  const invalid = new Date('not a date');

  assert.equal(accountingDate(invalid), localDateOnly(new Date()));
});

test('the fallback is the LOCAL calendar day, never the UTC day', () => {
  /*
   * 21:30 UTC on 31 Dec is already 1 Jan in a UTC+4:30 book. Using the UTC
   * day here would file the entry into the previous fiscal year.
   */
  const instant = new Date('2026-12-31T21:30:00.000Z');
  const expected = [
    instant.getFullYear(),
    String(instant.getMonth() + 1).padStart(2, '0'),
    String(instant.getDate()).padStart(2, '0'),
  ].join('-');

  assert.equal(
    accountingDate(null, { fallback: instant }),
    expected,
  );

  assert.equal(
    accountingDate('', { fallback: instant }),
    expected,
  );

  assert.equal(
    accountingDate(undefined, { fallback: instant }),
    expected,
  );
});

test('a local calendar day built by the server agrees with localDateOnly', () => {
  const day = localDateOnly(new Date());

  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(day, accountingDate(undefined));
});

test('an accounting date is never a UTC-converted instant', () => {
  /*
   * Whatever the server timezone is, the day reported for a date-only input
   * must be the day that was written. This is the assertion that fails if
   * anyone reintroduces new Date(value).toISOString().slice(0, 10).
   */
  for (const value of ['2026-12-31', '2026-01-01', '2027-03-01']) {
    assert.equal(accountingDate(value).slice(0, 10), value);
  }
});

test('isDateOnly distinguishes a calendar date from an instant', () => {
  assert.equal(isDateOnly('2026-12-31'), true);
  assert.equal(isDateOnly('2026-12-31T10:00:00.000Z'), false);
  assert.equal(isDateOnly(new Date()), false);
  assert.equal(isDateOnly(''), false);
});

/* ========================= opening balances ========================== */

async function createAccountWith(data) {
  return accountService.createAccount({
    user: USER,
    data: { code: 'CASH', name: 'Cash', account_type_id: 1, ...data },
    requestContext: REQUEST_CONTEXT,
  });
}

test('an opening balance honours an explicit effective_date', async () => {
  await createAccountWith({
    balance: 5000,
    initial_balance_type: 'Debit',
    effective_date: '2026-01-01',
  });

  assert.equal(state.journals.length, 1);
  assert.equal(state.journals[0].reference_type, 'account');
  assert.equal(state.journals[0].date, '2026-01-01');
});

test('an opening balance dated after entry keeps the chosen day', async () => {
  /*
   * The user says "the opening balance is effective 31 Dec", and enters it
   * later. The journal must be dated 31 Dec, not the day it was keyed in.
   */
  await createAccountWith({
    balance: 1200,
    initial_balance_type: 'Credit',
    effective_date: '2026-12-31',
  });

  assert.equal(state.journals[0].date, '2026-12-31');
});

test('every opening-balance journal of one request shares the effective date', async () => {
  await createAccountWith({
    balance: 100,
    initial_balance_type: 'Debit',
    effective_date: '2026-06-30',
    additional_initial_balances: [
      { balance: 200, type: 'Credit', currency: 'USD' },
      { balance: 300, type: 'Debit', currency: 'EUR' },
    ],
  });

  assert.equal(state.journals.length, 3);

  for (const journal of state.journals) {
    assert.equal(journal.date, '2026-06-30');
  }
});

test('omitting effective_date stays backward compatible', async () => {
  /*
   * Existing clients send no effective_date. They must keep working, and the
   * fallback must be a calendar day rather than a posting timestamp.
   */
  await createAccountWith({
    balance: 250,
    initial_balance_type: 'Debit',
  });

  assert.equal(state.journals.length, 1);
  assert.equal(state.journals[0].date, localDateOnly(new Date()));
  assert.match(state.journals[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test('an empty effective_date behaves exactly like an omitted one', async () => {
  await createAccountWith({
    balance: 250,
    initial_balance_type: 'Debit',
    effective_date: '',
  });

  assert.equal(state.journals.length, 1);
  assert.equal(state.journals[0].date, localDateOnly(new Date()));
});

test('effective_date is optional and additive in the API schema', () => {
  const base = {
    code: 'CASH',
    name: 'Cash',
    account_type_id: 1,
  };

  /* Absent: still accepted, leaving the key undefined. */
  assert.equal(
    createAccountSchema.parse(base).effective_date,
    undefined,
  );

  /* Present: accepted as a calendar date. */
  assert.equal(
    createAccountSchema.parse({
      ...base,
      effective_date: '2026-12-31',
    }).effective_date,
    '2026-12-31',
  );
});

test('effective_date rejects an instant so a client cannot shift the day', () => {
  assert.throws(() =>
    createAccountSchema.parse({
      code: 'CASH',
      name: 'Cash',
      account_type_id: 1,
      effective_date: '2026-12-31T23:30:00.000Z',
    }),
  );
});

test('no opening balance is written when the balance is zero', async () => {
  await createAccountWith({ balance: 0 });

  assert.equal(state.journals.length, 0);
});

/* ===================== payment_date input validation ================== */
/*
 * Step 3.6. The app now sends a calendar day. Existing API callers send a
 * full instant and must keep working, and an empty value must mean "not
 * supplied" rather than "clear it" — otherwise editing an amount would wipe
 * the payment's accounting date.
 */

const salePaymentValidator =
  require('../validators/sale-payment.validator');

const purchasePaymentValidator =
  require('../validators/purchase-payment.validator');

const saleValidator = require('../validators/sale.validator');

const purchaseValidator =
  require('../validators/purchase.validator');

const PAYMENT_BODY_VALIDATORS = [
  ['sale-payment', salePaymentValidator.createPaymentSchema, { sale_id: 1 }],
  [
    'purchase-payment',
    purchasePaymentValidator.createPaymentSchema,
    { purchase_id: 1 },
  ],
  ['sale', saleValidator.createPaymentSchema, { sale_id: 1 }],
  [
    'purchase',
    purchaseValidator.createPaymentSchema,
    { purchase_id: 1 },
  ],
];

function parsePaymentDate(schema, extra, paymentDate) {
  const body = { account_id: 2, amount: 10, ...extra };

  if (paymentDate !== undefined) {
    body.payment_date = paymentDate;
  }

  return schema.safeParse(body);
}

test('every payment endpoint accepts a calendar day', () => {
  for (const [name, schema, extra] of PAYMENT_BODY_VALIDATORS) {
    const parsed = parsePaymentDate(schema, extra, '2026-12-31');

    assert.equal(parsed.success, true, `${name} rejected a calendar day`);
    assert.equal(parsed.data.payment_date, '2026-12-31');
  }
});

test('a legacy instant is still accepted for backward compatibility', () => {
  const legacyValues = [
    '2026-09-19T06:57:20.816Z',
    '2026-12-31 00:00:00',
  ];

  for (const [name, schema, extra] of PAYMENT_BODY_VALIDATORS) {
    for (const value of legacyValues) {
      const parsed = parsePaymentDate(schema, extra, value);

      assert.equal(
        parsed.success,
        true,
        `${name} rejected the legacy value ${value}`,
      );

      /* passed through unchanged, exactly as before */
      assert.equal(parsed.data.payment_date, value);
    }
  }
});

test('a value that is not a date is rejected before it reaches MySQL', () => {
  for (const [name, schema, extra] of PAYMENT_BODY_VALIDATORS) {
    assert.equal(
      parsePaymentDate(schema, extra, 'not-a-date').success,
      false,
      `${name} accepted a non-date payment_date`,
    );
  }
});

test('an empty payment_date means "not supplied", never "clear it"', () => {
  for (const [name, schema, extra] of PAYMENT_BODY_VALIDATORS) {
    const omitted = parsePaymentDate(schema, extra, undefined);
    const empty = parsePaymentDate(schema, extra, '');

    assert.equal(omitted.success, true);
    assert.equal(empty.success, true, `${name} rejected an empty value`);

    assert.equal(
      omitted.data.payment_date,
      undefined,
      `${name} must leave an omitted date untouched`,
    );

    assert.equal(
      empty.data.payment_date,
      undefined,
      `${name} must not turn '' into an explicit clear`,
    );
  }
});

test('an explicit null still clears the date', () => {
  for (const [name, schema, extra] of PAYMENT_BODY_VALIDATORS) {
    const parsed = parsePaymentDate(schema, extra, null);

    assert.equal(parsed.success, true, `${name} rejected null`);
    assert.equal(parsed.data.payment_date, null);
  }
});

test('the same date rule is shared, not reimplemented per endpoint', () => {
  const sources = [
    'validators/sale-payment.validator.js',
    'validators/purchase-payment.validator.js',
    'validators/sale.validator.js',
    'validators/purchase.validator.js',
    'validators/inventory-record.validator.js',
    'validators/prescription.validator.js',
    'validators/production.validator.js',
  ];

  for (const relativePath of sources) {
    const source = fs.readFileSync(
      path.join(__dirname, '..', relativePath),
      'utf8',
    );

    assert.match(
      source,
      /payment_date:\s*paymentDateSchema/,
      `${relativePath} declares its own payment_date rule`,
    );
  }
});

/* ======================= historical data is untouched ================= */

/*
 * Step 3.5 fixes NEW postings only. Nothing in the date path may rewrite a
 * journal that already exists: repricing history would silently move money
 * between fiscal years that have already been reported on.
 */
const DATE_TOUCHING_SOURCES = [
  'services/payment-posting.service.js',
  'services/sale.service.js',
  'services/purchase.service.js',
  'services/account.service.js',
  'services/journal.service.js',
];

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf8',
  );
}

const fs = require('node:fs');
const path = require('node:path');

test('no service rewrites an existing journal date', () => {
  for (const relativePath of DATE_TOUCHING_SOURCES) {
    const source = readSource(relativePath);

    assert.doesNotMatch(
      source,
      /UPDATE\s+journals\s+SET[\s\S]{0,200}?\bdate\s*=/i,
      `${relativePath} must not backdate existing journals`,
    );
  }
});

test('no service rewrites existing payment or bill dates', () => {
  const forbidden = [
    /UPDATE\s+sale_payments\s+SET[\s\S]{0,200}?payment_date\s*=\s*['"]/i,
    /UPDATE\s+purchase_payments\s+SET[\s\S]{0,200}?payment_date\s*=\s*['"]/i,
    /UPDATE\s+sales\s+SET[\s\S]{0,200}?invoice_date\s*=\s*['"]/i,
    /UPDATE\s+purchases\s+SET[\s\S]{0,200}?bill_date\s*=\s*['"]/i,
  ];

  for (const relativePath of DATE_TOUCHING_SOURCES) {
    const source = readSource(relativePath);

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relativePath} must not rewrite historical document dates`,
      );
    }
  }
});

test('the fiscal-year migration does not alter any existing table', () => {
  const migration = readSource('migrations/20260919_fiscal_years.sql');

  /* drop SQL line comments so the prose cannot satisfy or trip the check */
  const body = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = body
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  /*
   * Exactly one statement, and it only creates the new table. Anything else
   * — an UPDATE, an ALTER, an INSERT of a default year — would touch data
   * that already belongs to a customer.
   */
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE fiscal_years\b/);

  /*
   * `ON UPDATE CURRENT_TIMESTAMP(3)` is a column definition, not a data
   * change, so neutralise it before looking for mutating verbs.
   */
  const withoutColumnClause = statements[0].replace(/ON UPDATE/gi, 'ON_');

  assert.doesNotMatch(
    withoutColumnClause,
    /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\s/i,
  );
});
