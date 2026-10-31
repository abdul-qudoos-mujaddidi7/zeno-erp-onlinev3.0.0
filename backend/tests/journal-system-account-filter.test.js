/*
 * journal-system-account-filter.test.js
 *
 * How the journals list treats system accounts.
 *
 * Why it exists: the list hides the internal rows that sit entirely between
 * system accounts (RECEIVABLE / PAYABLE). It used to hide every row that
 * merely *touched* one of them, and since a sale invoice is posted as
 * `Dr customer / Cr RECEIVABLE` and a purchase as `Dr PAYABLE / Cr supplier`,
 * every invoice disappeared from the day book. What stayed behind was the
 * payment the invoice created, so a sale bill looked like a «دریافت پول» row.
 *
 * These tests run against a recording executor -- there is NO database
 * connection, so production data is never touched.
 *
 * What it locks down:
 *
 *   1. The exclusion is a single `NOT (first IN (?) AND second IN (?))`
 *      condition, so a document with one real party leg survives.
 *   2. The old two-sided `NOT IN` pair never comes back.
 *   3. Binds stay balanced: two placeholders per excluded account id.
 *   4. The same rule is used by the summary query, so totals cannot drift
 *      away from the rows the list shows.
 */

process.env.DB_HOST = 'journal-system-account-filter-test-host';
process.env.DB_USER = 'journal-system-account-filter-test-user';
process.env.DB_PASSWORD = 'journal-system-account-filter-test-password';
process.env.DB_NAME = 'journal-system-account-filter-test-db';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const journalRepository = require('../repositories/journal.repository');

const ORG_ID = 42;
const RECEIVABLE_ID = 501;
const PAYABLE_ID = 502;

/* Stands in for the accounts lookup that resolves the system account ids. */
async function captureStatements(run) {
  const statements = [];

  const executor = {
    execute: async (sql, values) => {
      statements.push({ sql, values: values || [] });

      if (/FROM accounts/i.test(sql)) {
        const rows = [{ local_id: RECEIVABLE_ID }, { local_id: PAYABLE_ID }];
        return [rows, {}];
      }

      return [[], {}];
    },
  };

  await run(executor);

  return statements;
}

function journalStatement(statements) {
  return statements.find(({ sql }) => /FROM journals/i.test(sql));
}

function countPlaceholders(sql) {
  return (sql.match(/\?/g) || []).length;
}

test('excludes a row only when both legs are system accounts', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findAll(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
    }),
  );

  const { sql, values } = journalStatement(statements);

  assert.match(
    sql,
    /NOT \(first_entry_account IN \(\?, \?\) AND second_entry_account IN \(\?, \?\)\)/,
  );
  assert.equal(countPlaceholders(sql), values.length);
  assert.deepEqual(
    values.filter((value) => value === RECEIVABLE_ID || value === PAYABLE_ID),
    [RECEIVABLE_ID, PAYABLE_ID, RECEIVABLE_ID, PAYABLE_ID],
  );
});

test('never hides a document that only touches one system account', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findAll(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
    }),
  );

  const { sql } = journalStatement(statements);

  /* The two-sided NOT IN pair is what erased every sale and purchase
     invoice: it matched as soon as one leg was RECEIVABLE or PAYABLE. */
  assert.doesNotMatch(sql, /first_entry_account NOT IN/);
  assert.doesNotMatch(sql, /second_entry_account NOT IN/);
});

test('adds no account filter when the caller keeps system accounts', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findAll(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: false,
    }),
  );

  assert.equal(
    statements.some(({ sql }) => /FROM accounts/i.test(sql)),
    false,
  );

  const { sql } = journalStatement(statements);

  assert.doesNotMatch(sql, /first_entry_account IN/);
  assert.doesNotMatch(sql, /second_entry_account IN/);
});

test('summary follows the same both-leg rule as the list', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findSummary(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
    }),
  );

  const { sql, values } = journalStatement(statements);

  assert.match(
    sql,
    /NOT \(j\.first_entry_account IN \(\?, \?\) AND j\.second_entry_account IN \(\?, \?\)\)/,
  );
  assert.equal(countPlaceholders(sql), values.length);
});

/*
 * `excludeControlAccounts` is the stricter, opt-in rule the day book uses: a
 * sale invoice is `Dr customer / Cr RECEIVABLE`, so it has one real party leg
 * and survives the both-leg rule. The day book wants the sale to appear once —
 * as the payment it produced — so it asks for the row that touches a control
 * account to go as well.
 */
test('drops a row that touches a control account on either side', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findAll(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
      excludeReportAccounts: true,
      excludeControlAccounts: true,
    }),
  );

  const { sql, values } = journalStatement(statements);

  assert.match(
    sql,
    /NOT \(first_entry_account IN \(\?, \?\) OR second_entry_account IN \(\?, \?\)\)/,
  );
  assert.equal(countPlaceholders(sql), values.length);
});

test('control-account rule is off unless asked for', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findAll(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
    }),
  );

  const { sql } = journalStatement(statements);

  assert.doesNotMatch(sql, /OR second_entry_account IN/);
});

test('summary drops the same control rows as the list', async () => {
  const statements = await captureStatements((executor) =>
    journalRepository.findSummary(executor, {
      orgId: ORG_ID,
      status: 1,
      excludeSystemAccounts: true,
      excludeControlAccounts: true,
    }),
  );

  const { sql, values } = journalStatement(statements);

  assert.match(
    sql,
    /NOT \(j\.first_entry_account IN \(\?, \?\) OR j\.second_entry_account IN \(\?, \?\)\)/,
  );
  assert.equal(countPlaceholders(sql), values.length);
});
