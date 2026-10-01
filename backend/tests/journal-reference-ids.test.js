/*
 * journal-reference-ids.test.js
 *
 * Comma separated `reference_ids` on the journals list endpoint.
 *
 * Why it exists: every edit/delete/receipt modal used to download the whole
 * journals table (`GET /journals?status=1`) and filter it in the browser to
 * find the handful of rows belonging to one document plus its payments and
 * returns. On the largest organisation that is ~68k rows and ~390 ms in the
 * database alone, before serialisation and transfer.
 *
 * These tests run entirely against a recording executor / repository stub --
 * there is NO database connection, so production data is never touched.
 *
 * What it locks down:
 *
 *   1. `reference_ids` becomes `reference_id IN (?, ?, ...)` with exactly one
 *      bind value per placeholder.
 *   2. It is additive: omitting it changes nothing, and it still combines
 *      with reference_type / status / dates.
 *   3. The validator accepts a plain CSV and rejects nothing silently --
 *      junk parts are dropped instead of reaching SQL.
 *   4. The service parses the CSV into numbers, so ids are compared as
 *      numbers and the query can use the (org_id, status, reference_type,
 *      reference_id) index.
 */

process.env.DB_HOST = 'journal-reference-ids-test-host';
process.env.DB_USER = 'journal-reference-ids-test-user';
process.env.DB_PASSWORD = 'journal-reference-ids-test-password';
process.env.DB_NAME = 'journal-reference-ids-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const journalRepository = require('../repositories/journal.repository');
const journalService = require('../services/journal.service');
const { journalListQuerySchema } = require('../validators/journal.validator');

const ORG_ID = 42;
const USER = {
  org_id: ORG_ID,
  local_id: 7,
};

/*
 * The service tests stub the repository module, so the real implementations
 * are captured here, before any stub is installed.
 */
const realFindAll = journalRepository.findAll;
const realFindSummary = journalRepository.findSummary;

async function captureStatements(fn) {
  const statements = [];

  const executor = {
    execute: async (sql, values) => {
      statements.push({ sql, values: values || [] });
      return [[], {}];
    },
  };

  await fn(executor);

  return statements;
}

function countPlaceholders(sql) {
  return (sql.match(/\?/g) || []).length;
}

let state;

beforeEach(() => {
  state = {
    listParams: null,
    summaryParams: null,
  };

  journalRepository.findAll = async (executor, params) => {
    state.listParams = params;
    return { data: [], meta: null };
  };

  journalRepository.findSummary = async (executor, params) => {
    state.summaryParams = params;
    return {};
  };
});

function listJournalRows(filters = {}) {
  return journalService.listJournals({
    user: USER,
    filters,
  });
}

test('repository adds reference_id IN (...) with one bind per placeholder', async () => {
  const statements = await captureStatements((executor) =>
    realFindAll(executor, {
      orgId: ORG_ID,
      status: 1,
      referenceIds: [11, 22, 33],
    }),
  );

  assert.equal(statements.length, 1);

  const [{ sql, values }] = statements;

  assert.match(sql, /reference_id IN \(\?, \?, \?\)/);
  assert.equal(countPlaceholders(sql), values.length);
  assert.deepEqual(values.slice(-3), [11, 22, 33]);
});

test('repository keeps a single reference_id filter working unchanged', async () => {
  const statements = await captureStatements((executor) =>
    realFindAll(executor, {
      orgId: ORG_ID,
      status: 1,
      referenceId: 11,
      referenceType: 'sale',
    }),
  );

  const [{ sql, values }] = statements;

  assert.match(sql, /reference_id = \?/);
  assert.doesNotMatch(sql, /reference_id IN/);
  assert.equal(countPlaceholders(sql), values.length);
  assert.deepEqual(values.slice(-2), [11, 'sale']);
});

test('repository omits the IN clause when no reference ids are given', async () => {
  const statements = await captureStatements((executor) =>
    realFindAll(executor, {
      orgId: ORG_ID,
      status: 1,
    }),
  );

  const [{ sql }] = statements;

  assert.doesNotMatch(sql, /reference_id IN/);
  assert.match(sql, /org_id = \? AND status = \?/);
});

test('findSummary applies the same reference ids so totals match the rows', async () => {
  const statements = await captureStatements((executor) =>
    realFindSummary(executor, {
      orgId: ORG_ID,
      status: 1,
      referenceIds: [11, 22],
    }),
  );

  const [{ sql, values }] = statements;

  assert.match(sql, /j\.reference_id IN \(\?, \?\)/);
  assert.equal(countPlaceholders(sql), values.length);
  assert.deepEqual(values.slice(-2), [11, 22]);
});

test('validator accepts a comma separated list and defaults to empty', () => {
  assert.equal(
    journalListQuerySchema.parse({ reference_ids: '11,22,33' }).reference_ids,
    '11,22,33',
  );
  assert.equal(journalListQuerySchema.parse({}).reference_ids, '');
  assert.equal(
    journalListQuerySchema.parse({ reference_ids: ' 7 ' }).reference_ids,
    '7',
  );
});

test('service turns the CSV into numbers and passes them to the repository', async () => {
  await listJournalRows({ reference_ids: '11, 22 ,33' });

  assert.deepEqual(state.listParams.referenceIds, [11, 22, 33]);
  assert.equal(state.listParams.referenceId, undefined);
});

test('service drops junk parts instead of sending them to SQL', async () => {
  await listJournalRows({ reference_ids: '11,abc,-4,0,22' });

  assert.deepEqual(state.listParams.referenceIds, [11, 22]);
});

test('service passes null when the filter is absent', async () => {
  await listJournalRows({});

  assert.equal(state.listParams.referenceIds, null);
});

test('service forwards reference ids to the summary query too', async () => {
  await listJournalRows({ reference_ids: '11,22', include_summary: 1 });

  assert.deepEqual(state.summaryParams.referenceIds, [11, 22]);
});
