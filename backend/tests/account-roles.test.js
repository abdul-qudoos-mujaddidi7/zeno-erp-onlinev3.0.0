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
  assert.equal((captured.sql.match(/org_id = \?/g) || []).length, 3);
  assert.match(captured.sql, /status = 1/g);
  assert.deepEqual(captured.values, [42, 42, 42, 123]);
});

for (const role of ['customer', 'supplier', 'both']) {
  for (const opening of [-500, 500]) {
    test(`${role} opening balance ${opening} contributes exactly once`, async () => {
      const executor = { execute: async () => [[{
        account_id: 123, currency: 'USD',
        customer_receivable: 70, supplier_payable: 40,
        opening_balance: String(opening),
        can_be_customer: role !== 'supplier' ? 1 : 0,
        can_be_supplier: role !== 'customer' ? 1 : 0,
      }]] };
      const [row] = await accountRepository.findDirectionalBalances(executor, { orgId: 7 });
      const customerOpening = role === 'customer' || (role === 'both' && opening < 0);
      assert.equal(row.customer_receivable, 70 - (customerOpening ? opening : 0));
      assert.equal(row.supplier_payable, 40 + (customerOpening ? 0 : opening));
      assert.equal(-row.customer_receivable + row.supplier_payable, -70 + 40 + opening);
    });
  }
}

test('directional query includes opening journals and resolves organization-scoped account roles', async () => {
  let sql;
  await accountRepository.findDirectionalBalances({ execute: async (query) => { sql = query; return [[]]; } }, { orgId: 7 });
  assert.match(sql, /reference_type = 'account'/);
  assert.match(sql, /WHERE reference_type IN \([^)]*'account'\)/);
  assert.match(sql, /account_type\.org_id = account\.org_id/);
  assert.match(sql, /account\.account_type_id = 4 OR account_type\.can_be_customer = 1/);
  assert.match(sql, /account\.account_type_id = 3 OR account_type\.can_be_supplier = 1/);
});
