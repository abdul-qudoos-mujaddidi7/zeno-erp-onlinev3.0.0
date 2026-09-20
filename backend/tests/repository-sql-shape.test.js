/**
 * SQL SHAPE GUARD (Step 5 follow-up).
 *
 * Why this file exists
 * --------------------
 * Every fiscal-year suite stubs the repository executors, so a repository's
 * SQL text is never parsed by a database in CI. That is exactly how
 * `AND AND UPPER(a.code) NOT IN (...)` reached production: the closing engine
 * built its WHERE clause from an array of fragments joined with " AND ", and
 * one fragment already carried its own AND. The failure only appeared when a
 * real close was attempted against MariaDB.
 *
 * These tests capture the statements the fiscal-year repositories actually
 * build and assert the two properties that a stubbed suite cannot check:
 *
 *   1. the placeholder count matches the bind-parameter count (a mismatch
 *      makes the driver throw at run time), and
 *   2. the WHERE clause has no doubled / dangling boolean operator.
 *
 * No database is contacted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const fiscalYearCloseRepository = require('../repositories/fiscal-year-close.repository');
const fiscalYearOpeningRepository = require('../repositories/fiscal-year-opening.repository');

/**
 * Runs a repository function against a recording executor and returns the
 * statements it built.
 */
async function captureStatements(fn, ...args) {
  const statements = [];

  const executor = {
    execute: async (sql, values) => {
      statements.push({ sql, values: values || [] });

      return [[], {}];
    },
  };

  await fn(executor, ...args);

  return statements;
}

async function captureStatementsWithExecutor(executorFn, ...args) {
  const statements = [];

  const executor = {
    execute: async (sql, values) => {
      statements.push({ sql, values: values || [] });

      return [[], {}];
    },
  };

  await executorFn(executor, ...args);

  return statements;
}

function assertUsableStatement(statement, label) {
  const sql = statement.sql;

  assert.ok(sql.trim().length > 0, `${label}: statement is empty`);

  const placeholders = (sql.match(/\?/g) || []).length;

  assert.equal(
    placeholders,
    statement.values.length,
    `${label}: ${placeholders} placeholder(s) but ${statement.values.length} bind value(s)`,
  );

  for (const value of statement.values) {
    assert.notEqual(
      value,
      undefined,
      `${label}: bind parameters must not contain undefined`,
    );
  }

  /*
   * Doubled or dangling operators. "AND AND" is the bug that shipped; the
   * others are the same class of mistake (an empty/dangling fragment) and are
   * caught here rather than by MariaDB.
   */
  for (const pattern of [/\bAND\s+AND\b/i, /\bOR\s+OR\b/i, /\bWHERE\s+AND\b/i, /\bWHERE\s+OR\b/i, /\bAND\s*$/i]) {
    assert.equal(
      pattern.test(sql),
      false,
      `${label}: malformed boolean operator in SQL (${pattern})`,
    );
  }

  assert.equal(
    /\bWHERE\s*$/im.test(sql),
    false,
    `${label}: dangling WHERE with no condition`,
  );
}

test('closing period-activity SQL is well formed for every code set', async () => {
  const cases = [
    {
      label: 'single code',
      params: {
        orgId: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        codes: ['SALES'],
      },
    },
    {
      label: 'all P&L codes',
      params: {
        orgId: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        codes: ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS'],
      },
    },
    {
      label: 'with closing-journal exclusion',
      params: {
        orgId: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        codes: ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS'],
        excludeReferenceType: 'fiscal_year_close',
        excludeReferenceId: 42,
      },
    },
  ];

  for (const { label, params } of cases) {
    const statements = await captureStatementsWithExecutor(
      fiscalYearCloseRepository.sumPeriodAccountActivity,
      params,
    );

    assert.equal(statements.length, 2, `${label}: expected both entry passes`);

    for (const statement of statements) {
      assertUsableStatement(statement, `sumPeriodAccountActivity (${label})`);
    }
  }
});

test('roll-forward balance SQL is well formed with and without exclusions', async () => {
  const cases = [
    {
      label: 'excluded P&L codes',
      params: {
        orgId: 1,
        endDate: '2026-12-31',
        excludedCodes: ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS'],
      },
    },
    {
      label: 'no exclusions',
      params: {
        orgId: 1,
        endDate: '2026-12-31',
      },
    },
  ];

  for (const { label, params } of cases) {
    const statements = await captureStatements(
      fiscalYearOpeningRepository.findPeriodEndAccountBalances,
      params,
    );

    assert.equal(statements.length, 2, `${label}: expected both entry passes`);

    for (const statement of statements) {
      assertUsableStatement(
        statement,
        `findPeriodEndAccountBalances (${label})`,
      );
    }
  }
});

test('the exclusion clause stays inside the WHERE clause it is joined into', async () => {
  const statements = await captureStatements(
    fiscalYearOpeningRepository.findPeriodEndAccountBalances,
    {
      orgId: 1,
      endDate: '2026-12-31',
      excludedCodes: ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS'],
    },
  );

  for (const statement of statements) {
    const sql = statement.sql;

    /*
     * The exclusion must appear exactly once, preceded by a single AND that is
     * attached to the accounts join predicate — the shape that broke.
     */
    const occurrences = (sql.match(/UPPER\(a\.code\) NOT IN/gi) || []).length;

    assert.equal(occurrences, 1, 'exclusion clause must appear exactly once');
    assert.match(
      sql,
      /AND\s+UPPER\(a\.code\) NOT IN \(\?, \?, \?, \?\)/,
      'exclusion clause must be joined with exactly one AND',
    );

    /* The end-date bound must remain its own condition, not glued to the
     * exclusion. */
    assert.match(
      sql,
      /AND\s+COALESCE\(j\.date, j\.created_at\) < DATE_ADD\(\?, INTERVAL 1 DAY\)/,
      'date bound must be joined with exactly one AND',
    );
  }
});

module.exports = {};
