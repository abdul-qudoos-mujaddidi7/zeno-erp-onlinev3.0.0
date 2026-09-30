/*
 * sale-visitor.test.js
 *
 * Visitor-account sales. These run entirely against repository stubs -- there
 * is NO database connection, so production data is never touched.
 *
 * What they lock down is the rule the feature exists for:
 *
 *   1. A visitor receives a percentage of the SALE'S BENEFIT, not of the
 *      sale's total. An invoice of 10,000 with a benefit of 500 pays a 10%
 *      visitor 50, never 1,000. The benefit is the sale's own stored figure,
 *      so a sale in an organization that does not use FIFO/LIFO layers (where
 *      `sale_items.profit` is never written) still pays its visitor.
 *   2. The share is posted as its own double entry, EXPENSES debit / visitor
 *      credit, under reference_type 'sale_visitor' so the sale's own customer
 *      entry can never remove it by accident. It is a cost of the sale, so it
 *      lands in EXPENSES and NOT in BENEFITS: debiting BENEFITS left that
 *      account negative with no profit ever credited to it, while the company
 *      had in fact kept the rest of the benefit (100 - 10 = 90).
 *   3. Only a confirmed sale with a visitor and a positive benefit posts
 *      anything; every other combination posts nothing at all and never
 *      charges the visitor for a loss.
 *   4. The rate is taken from the account (the server's number), and a
 *      non-visitor account or a visitor without a rate is refused.
 */

process.env.DB_HOST = 'sale-visitor-test-host';
process.env.DB_USER = 'sale-visitor-test-user';
process.env.DB_PASSWORD = 'sale-visitor-test-password';
process.env.DB_NAME = 'sale-visitor-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../database/pool');

const saleRepository =
  require('../repositories/sale.repository');

const journalRepository =
  require('../repositories/journal.repository');

const accountRepository =
  require('../repositories/account.repository');

const accountTypeRepository =
  require('../repositories/account-type.repository');

const saleService =
  require('../services/sale.service');

const ORG_ID = 42;
const USER_ID = 7;
const SALE_ID = 'SALE-1';
/*
 * Account local_ids are BIGINT UNSIGNED, so they always arrive as numeric
 * values (mysql2 may hand back either a number or a digit string).
 */
const VISITOR_ACCOUNT_ID = '8841000000001';
const VISITOR_TYPE_ID = 9;
const CUSTOMER_TYPE_ID = 4;
const EXPENSES_ACCOUNT_ID = '8841000000002';

const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test',
  deviceInfo: 'node:test',
};

let state;

function createConnection() {
  return {
    async execute() {
      return [[], []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async release() {},
  };
}

function installStubs() {
  state = {
    visitorAccountId: VISITOR_ACCOUNT_ID,
    percentage: 10,
    sale: {
      id: SALE_ID,
      local_id: SALE_ID,
      org_id: ORG_ID,
      account_id: '8841000000003',
      visitor_account_id: VISITOR_ACCOUNT_ID,
      visitor_percentage: null,
      visitor_benefit: null,
      invoice_number: 'INV-1001',
      invoice_date: '2026-09-30',
      description: '',
      currency: 'AFN',
      /*
       * The benefit the application calculated and stored for the sale. It is
       * the figure the visitor's share is taken from.
       */
      benefit: 500,
      /*
       * Deliberately large: the visitor's share must come from `benefit`, so a
       * bug that reads total_amount instead is caught loudly.
       */
      total_amount: 10000,
      status: 1,
    },
    items: [
      { id: 'I1', profit: 300.5, status: 1 },
      { id: 'I2', profit: 199.5, status: 1 },
    ],
    journals: [],
    deletedJournals: [],
    saleUpdates: [],

    accountTypes: {
      [VISITOR_TYPE_ID]: {
        local_id: VISITOR_TYPE_ID,
        code: 'VISITOR',
        name: 'Visitor',
      },
      [CUSTOMER_TYPE_ID]: {
        local_id: CUSTOMER_TYPE_ID,
        code: 'CUSTOMER',
        name: 'Customer',
      },
    },
  };

  const connection = createConnection();

  pool.getConnection = async () => connection;

  saleRepository.findByLocalId = async () => state.sale;

  saleRepository.findItemsBySale = async () => state.items;

  saleRepository.findAccountByCode = async (conn, { code }) =>
    code === 'EXPENSES'
      ? {
          id: EXPENSES_ACCOUNT_ID,
          local_id: EXPENSES_ACCOUNT_ID,
          code: 'EXPENSES',
          status: 1,
        }
      : null;

  saleRepository.update = async (conn, { data }) => {
    state.saleUpdates.push(data);

    return {
      ...state.sale,
      ...data,
    };
  };

  journalRepository.create = async (conn, { orgId, localId, data }) => {
    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  /* The reversal path: only the journal moves, so record the reference. */
  journalRepository.softDeleteByReference = async (
    conn,
    { referenceId, referenceType },
  ) => {
    state.deletedJournals.push({
      referenceId,
      referenceType,
    });
  };

  /*
   * The REAL role rule runs (services/account-role.service.js), so these two
   * stubs are what let a visitor account pass and a customer account fail.
   */
  accountRepository.findByLocalId = async (conn, { localId }) => ({
    id: localId,
    local_id: localId,
    account_id: localId,
    name: 'Visitor A',
    account_type_id: VISITOR_TYPE_ID,
    percentage: state.percentage,
    status: 1,
  });

  accountTypeRepository.findByLocalId = async (conn, { localId }) =>
    state.accountTypes[Number(localId)] || null;
}

beforeEach(() => {
  installStubs();
});

function sync() {
  return saleService.syncVisitorBenefit(
    createConnection(),
    {
      orgId: ORG_ID,
      userId: USER_ID,
      requestContext: REQUEST_CONTEXT,
      saleId: SALE_ID,
    },
  );
}

/* ==================== the share is of the benefit ==================== */

test('the visitor gets its percentage of the benefit, not of the invoice', async () => {
  const result = await sync();

  /* A benefit of 500 at 10% is 50; 10% of the 10,000 invoice would be 1,000. */
  assert.equal(result.benefit, 500);
  assert.equal(result.share, 50);

  const journal = state.journals[0];

  assert.equal(journal.reference_id, SALE_ID);
  assert.equal(journal.reference_type, 'sale_visitor');
  assert.equal(journal.first_entry_account, EXPENSES_ACCOUNT_ID);
  assert.equal(journal.first_entry_debit, 50);
  assert.equal(journal.first_entry_credit, 0);
  assert.equal(
    journal.second_entry_account,
    Number(VISITOR_ACCOUNT_ID),
  );
  assert.equal(journal.second_entry_debit, 0);
  assert.equal(journal.second_entry_credit, 50);

  /* Double entry balances, so the ledger stays consistent. */
  assert.equal(journal.first_entry_debit, journal.second_entry_credit);
});

test('the share is stored on the sale as a snapshot of the rate and the amount', async () => {
  await sync();

  assert.deepEqual(state.saleUpdates.at(-1), {
    visitor_percentage: 10,
    visitor_benefit: 50,
  });
});

test('the rate comes from the account, not from the request', async () => {
  state.percentage = 25;

  const result = await sync();

  assert.equal(result.share, 125);
  /* The credit side is the visitor, so that is where the share lands. */
  assert.equal(state.journals[0].second_entry_credit, 125);
});

test('float noise is rounded to the storage precision', async () => {
  state.sale.benefit = 0.1 + 0.2; /* 0.30000000000000004 as a float. */
  state.percentage = 100;

  const result = await sync();

  assert.equal(result.share, 0.3);
  assert.equal(state.journals[0].first_entry_debit, 0.3);
});

test('fractional rates keep their precision', async () => {
  state.sale.benefit = 333.333333;
  state.percentage = 33.3333;

  const result = await sync();

  assert.equal(result.share, 111.111);
});

/*
 * The reported bug. An organization that does not use FIFO/LIFO layers never
 * gets `sale_items.profit` written, so a share computed from the lines alone
 * is always zero: a 10% visitor of a 100 benefit was paid nothing while the
 * sale still showed its benefit. The sale's own benefit is what must pay.
 */
test('a sale without batch costing still pays its visitor', async () => {
  state.sale.benefit = 100;
  state.items = [{ id: 'I1', profit: 0, status: 1, fifo_cost: 0 }];
  state.percentage = 10;

  const result = await sync();

  assert.equal(result.benefit, 100);
  assert.equal(result.share, 10);
  assert.equal(state.journals.length, 1);
  assert.equal(state.journals[0].first_entry_debit, 10);
  assert.equal(state.journals[0].second_entry_credit, 10);
  assert.deepEqual(state.saleUpdates.at(-1), {
    visitor_percentage: 10,
    visitor_benefit: 10,
  });
});

test('the line profit is used only while the sale has no benefit yet', async () => {
  state.sale.benefit = null;
  state.items = [{ id: 'I1', profit: 300.5, status: 1 }, { id: 'I2', profit: 199.5, status: 1 }];

  const result = await sync();

  assert.equal(result.benefit, 500);
  assert.equal(result.share, 50);
});

/* ==================== nothing to share, nothing posted ==================== */

test('a sale with no visitor posts nothing and clears any earlier entry', async () => {
  state.sale.visitor_account_id = null;

  const result = await sync();

  assert.equal(result, null);
  assert.equal(state.journals.length, 0);
  assert.deepEqual(state.deletedJournals, [
    {
      referenceId: SALE_ID,
      referenceType: 'sale_visitor',
    },
  ]);
  assert.deepEqual(state.saleUpdates.at(-1), {
    visitor_percentage: null,
    visitor_benefit: null,
  });
});

test('a sale with no benefit posts nothing and never charges the visitor', async () => {
  state.sale.benefit = 0;

  const result = await sync();

  assert.equal(result.share, 0);
  assert.equal(state.journals.length, 0);
  assert.deepEqual(state.saleUpdates.at(-1), {
    visitor_percentage: 10,
    visitor_benefit: 0,
  });
});

test('a loss shares no loss with the visitor', async () => {
  state.sale.benefit = -120;

  const result = await sync();

  assert.equal(result.share, 0);
  assert.equal(state.journals.length, 0);
  assert.equal(state.saleUpdates.at(-1).visitor_benefit, 0);
});

test('the previous entry is dropped before the new one, so savings never double', async () => {
  await sync();
  await sync();

  assert.equal(state.deletedJournals.length, 2);
  assert.equal(state.journals.length, 2);
});

/* ==================== who may be a visitor ==================== */

test('an account whose type is not VISITOR is refused', async () => {
  state.sale.visitor_account_id = '8841000000003';

  accountRepository.findByLocalId = async (conn, { localId }) => ({
    id: localId,
    local_id: localId,
    name: 'Plain customer',
    account_type_id: CUSTOMER_TYPE_ID,
    percentage: 10,
    status: 1,
  });

  await assert.rejects(sync, (error) => {
    assert.equal(error.code, 'ACCOUNT_NOT_VISITOR_CAPABLE');

    return true;
  });

  assert.equal(state.journals.length, 0);
});

test('a visitor without a rate is refused instead of guessing one', async () => {
  state.percentage = null;

  await assert.rejects(sync, (error) => {
    assert.equal(error.code, 'VISITOR_PERCENTAGE_REQUIRED');

    return true;
  });

  assert.equal(state.journals.length, 0);
});

test('a rate outside 0-100 is refused', async () => {
  state.percentage = 0;

  await assert.rejects(sync, (error) => {
    assert.equal(error.code, 'VISITOR_PERCENTAGE_INVALID');

    return true;
  });

  state.percentage = 140;


  await assert.rejects(sync, (error) => {
    assert.equal(error.code, 'VISITOR_PERCENTAGE_INVALID');

    return true;
  });

  assert.equal(state.journals.length, 0);
});

/* ==================== reversal ==================== */

test('clearing the benefit removes the entry and forgets the snapshot', async () => {
  await saleService.clearVisitorBenefit(
    createConnection(),
    {
      orgId: ORG_ID,
      userId: USER_ID,
      saleId: SALE_ID,
    },
  );

  assert.deepEqual(state.deletedJournals, [
    {
      referenceId: SALE_ID,
      referenceType: 'sale_visitor',
    },
  ]);
  assert.deepEqual(state.saleUpdates.at(-1), {
    visitor_percentage: null,
    visitor_benefit: null,
  });
});

test('clearing a deleted sale touches only the entry, not the removed row', async () => {
  await saleService.clearVisitorBenefit(
    createConnection(),
    {
      orgId: ORG_ID,
      userId: USER_ID,
      saleId: SALE_ID,
      resetAmounts: false,
    },
  );

  assert.equal(state.deletedJournals.length, 1);
  assert.equal(state.saleUpdates.length, 0);
});
