const test = require('node:test');
const assert = require('node:assert/strict');
const { findAccountNewerMovements } = require('../repositories/journal.repository');
const { journalListQuerySchema } = require('../validators/journal.validator');

test('service attaches ledger movements by transaction id without changing page order', async () => {
  process.env.DB_HOST = 'account-running-balance-test-host';
  process.env.DB_USER = 'account-running-balance-test-user';
  process.env.DB_PASSWORD = 'account-running-balance-test-password';
  process.env.DB_NAME = 'account-running-balance-test-db';
  const repository = require('../repositories/journal.repository');
  const service = require('../services/journal.service');
  const originalFindAll = repository.findAll;
  const originalMovements = repository.findAccountNewerMovements;
  try {
    repository.findAll = async () => ({
      data: [{ id: 42, currency: 'AFN' }, { id: 41, currency: 'USD' }],
      meta: { page: 3 },
    });
    repository.findAccountNewerMovements = async (executor, params) => {
      assert.deepEqual(params, {
        orgId: 7, status: 1, accountId: 1,
        dateTo: '2026-12-31', journalIds: [42, 41],
      });
      return [
        { id: '41', currency: 'USD', newer_movement: '75' },
        { id: '42', currency: 'AFN', newer_movement: '250.125' },
        { id: '42', currency: 'USD', newer_movement: '700' },
      ];
    };
    const result = await service.listJournals({
      user: { org_id: 7, local_id: 2 },
      filters: { account_id: 1, status: 1, include_running_balance: 1,
        balance_date_to: '2026-12-31', page: 3, limit: 15 },
    });
    assert.deepEqual(result.data.map((row) => [row.id, row.newer_movements]),
      [[42, { AFN: 250.125, USD: 700 }], [41, { USD: 75 }]]);
    assert.deepEqual(result.meta, { page: 3 });
  } finally {
    repository.findAll = originalFindAll;
    repository.findAccountNewerMovements = originalMovements;
  }
});

test('running balance includes newer movements in every currency for each page row', async () => {
  let captured;
  const executor = {
    async execute(sql, values) {
      captured = { sql, values };
      return [[{ id: 42, newer_movement: '250.125' }]];
    },
  };
  const result = await findAccountNewerMovements(executor, {
    orgId: 7, accountId: 1, status: 1, journalIds: [42, 41],
    dateTo: '2026-12-31',
  });
  assert.deepEqual(captured.values, [1, 1, 7, 1, 1, 1, '2026-12-31', 7, 1, 1, 1, 42, 41]);
  assert.match(captured.sql, /GROUP BY j.local_id, n.currency/);
  assert.match(captured.sql, /n.date > j.date/);
  assert.match(captured.sql, /n.date <=> j.date\) AND n.local_id > j.local_id/);
  assert.match(captured.sql, /j.date IS NULL AND n.date IS NOT NULL/);
  assert.doesNotMatch(captured.sql, /n.currency = j.currency/);
  assert.match(captured.sql, /j.local_id IN/);
  assert.equal((captured.sql.match(/\?/g) || []).length, captured.values.length);
  assert.doesNotMatch(captured.sql, /LIKE|LIMIT|OFFSET|date >=/);
  assert.match(captured.sql, /first_entry_credit.*first_entry_debit/s);
  assert.match(captured.sql, /second_entry_credit.*second_entry_debit/s);
  assert.deepEqual(result, [{ id: 42, newer_movement: '250.125' }]);
});

test('lifetime seed includes movements after the visible date range', async () => {
  await findAccountNewerMovements({
    async execute(sql, values) {
      assert.doesNotMatch(sql, /DATE_ADD/);
      assert.deepEqual(values, [1, 1, 7, 1, 1, 1, 7, 1, 1, 1, 5]);
      return [[]];
    },
  }, { orgId: 7, accountId: 1, journalIds: [5] });
});

test('empty pages do not query the ledger', async () => {
  assert.deepEqual(await findAccountNewerMovements({
    execute() { throw new Error('Unexpected query'); },
  }, { orgId: 7, accountId: 1, journalIds: [] }), []);
});

test('running balance query flags survive validation', () => {
  const query = journalListQuerySchema.parse({
    account_id: '1', include_running_balance: '1', balance_date_to: '2026-12-31',
  });
  assert.equal(query.include_running_balance, 1);
  assert.equal(query.balance_date_to, '2026-12-31');
});
