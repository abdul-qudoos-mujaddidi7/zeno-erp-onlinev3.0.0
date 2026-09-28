const test = require('node:test');
const assert = require('node:assert/strict');
const accountRepository = require('../repositories/account.repository');

test('customer role includes legacy Customer and customer-capable types', async () => {
  let captured;
  const executor = { execute: async (sql, values) => { captured = { sql, values }; return [[], []]; } };
  await accountRepository.findAll(executor, { orgId: 7, role: 'customer' });
  assert.match(captured.sql, /can_be_customer\s*=\s*1/);
  assert.ok(captured.values.includes(4));
});

test('supplier role includes legacy Supplier and supplier-capable types', async () => {
  let captured;
  const executor = { execute: async (sql, values) => { captured = { sql, values }; return [[], []]; } };
  await accountRepository.findAll(executor, { orgId: 7, role: 'supplier' });
  assert.match(captured.sql, /can_be_supplier\s*=\s*1/);
  assert.ok(captured.values.includes(3));
});

test('directional balances keep receivable, payable and currencies separate', async () => {
  const executor = {
    execute: async () => [[
      { account_id: 123, currency: 'AFN', customer_receivable: 7000, supplier_payable: 4000 },
      { account_id: 123, currency: 'USD', customer_receivable: 25, supplier_payable: 10 },
    ]],
  };
  const rows = await accountRepository.findDirectionalBalances(executor, { orgId: 7, accountIds: [123] });
  assert.deepEqual(rows, [
    { account_id: 123, currency: 'AFN', customer_receivable: 7000, supplier_payable: 4000, net_position: 3000 },
    { account_id: 123, currency: 'USD', customer_receivable: 25, supplier_payable: 10, net_position: 15 },
  ]);
});

test('directional SQL excludes voided journals and cross-organization rows', async () => {
  let captured;
  const executor = { execute: async (sql, values) => { captured = { sql, values }; return [[]]; } };
  await accountRepository.findDirectionalBalances(executor, { orgId: 42, accountIds: [123] });
  assert.equal((captured.sql.match(/org_id = \?/g) || []).length, 2);
  assert.match(captured.sql, /status = 1/g);
  assert.deepEqual(captured.values, [42, 42, 123]);
});
