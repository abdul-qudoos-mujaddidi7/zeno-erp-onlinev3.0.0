/*
 * document-numbering.test.js
 *
 * Regression tests for the document numbering that the forms used to own.
 *
 * Two bugs prompted this:
 *   - every purchase was stored with the same bill number, because the form
 *     read `bill_index` once and nothing ever incremented it
 *   - the sale form showed a frozen invoice number, because it displayed a
 *     cached counter instead of the number the backend assigns
 *
 * The rules that must hold now:
 *   - the backend allocates the number inside the caller's transaction
 *   - previewing a number (the forms do this) never moves the counter
 *   - a number already used by a stored document is skipped
 *   - a clobbered counter falls back to the highest number actually in use
 *
 * No database: the settings/sale repositories are stubbed and the connection
 * is a fake, so real production data is never touched.
 */

process.env.DB_HOST = 'document-numbering-test-host';
process.env.DB_USER = 'document-numbering-test-user';
process.env.DB_PASSWORD = 'document-numbering-test-password';
process.env.DB_NAME = 'document-numbering-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const settingsRepository =
  require('../repositories/settings.repository');

const saleRepository =
  require('../repositories/sale.repository');

const purchaseService =
  require('../services/purchase.service');

const saleService =
  require('../services/sale.service');

const orgId = 21;
const userId = 7;

let state;

function createConnection() {
  return {
    async execute(sql, values = []) {
      if (/MAX\(CAST\(bill_number/i.test(sql)) {
        return [[{ m: state.maxBillNumber }], []];
      }

      if (/FROM purchases/i.test(sql)) {
        const billNumber = String(values[1]);

        return [
          state.storedBills.includes(billNumber) ? [{ 1: 1 }] : [],
          [],
        ];
      }

      return [[], []];
    },
  };
}

beforeEach(() => {
  state = {
    billIndex: '275',
    invoiceIndex: '19268',
    invoicePrefix: 'INV-',
    storedBills: [],
    storedInvoices: [],
    maxBillNumber: 0,
    settingsUpdates: [],
  };

  settingsRepository.findByKey = async (executor, { key }) => {
    if (key === 'bill_index') {
      return {
        local_id: 9,
        value: state.billIndex,
      };
    }

    if (key === 'invoice_index') {
      return {
        local_id: 10,
        value: state.invoiceIndex,
      };
    }

    if (key === 'invoice_index_prefix') {
      return {
        local_id: 11,
        value: state.invoicePrefix,
      };
    }

    return null;
  };

  settingsRepository.update = async (executor, { localId, data }) => {
    state.settingsUpdates.push({
      localId,
      value: data.value,
    });

    if (Number(localId) === 9) {
      state.billIndex = data.value;
    }

    if (Number(localId) === 10) {
      state.invoiceIndex = data.value;
    }
  };

  saleRepository.findByInvoiceNumber = async (
    executor,
    { invoiceNumber },
  ) => (
    state.storedInvoices.includes(invoiceNumber)
      ? { id: 1, invoice_number: invoiceNumber }
      : null
  );
});

/*
 * Purchase bills
 */

test('a preview of the next bill number does not move the counter', async () => {
  const billNumber = await purchaseService.allocateBillNumber(
    createConnection(),
    {
      orgId,
      userId,
      consume: false,
    },
  );

  assert.equal(billNumber, '276');
  assert.equal(state.billIndex, '275');
  assert.deepEqual(state.settingsUpdates, []);
});

test('allocating a bill number increments and persists the counter', async () => {
  const connection = createConnection();

  const first = await purchaseService.allocateBillNumber(connection, {
    orgId,
    userId,
  });

  const second = await purchaseService.allocateBillNumber(connection, {
    orgId,
    userId,
  });

  assert.equal(first, '276');
  assert.equal(second, '277');
  assert.equal(state.billIndex, '277');
  assert.deepEqual(state.settingsUpdates, [
    { localId: 9, value: '276' },
    { localId: 9, value: '277' },
  ]);
});

test('a bill number already stored by another bill is skipped', async () => {
  state.storedBills = ['276', '277'];

  const billNumber = await purchaseService.allocateBillNumber(
    createConnection(),
    {
      orgId,
      userId,
    },
  );

  assert.equal(billNumber, '278');
  assert.equal(state.billIndex, '278');
});

test('a clobbered bill counter falls back to the highest stored number', async () => {
  state.billIndex = '20260224034835';
  state.maxBillNumber = 410;

  const billNumber = await purchaseService.allocateBillNumber(
    createConnection(),
    {
      orgId,
      userId,
    },
  );

  assert.equal(billNumber, '411');
});

/*
 * Sale invoices
 */

test('previewing the next invoice number leaves the counter untouched', async () => {
  const invoiceNumber = await saleService.allocateInvoiceNumber(
    createConnection(),
    {
      orgId,
      userId,
      saleType: '',
      consume: false,
    },
  );

  assert.equal(invoiceNumber, 'INV-19269');
  assert.equal(state.invoiceIndex, '19268');
  assert.deepEqual(state.settingsUpdates, []);
});

test('allocating an invoice number increments and persists the counter', async () => {
  const invoiceNumber = await saleService.allocateInvoiceNumber(
    createConnection(),
    {
      orgId,
      userId,
      saleType: '',
    },
  );

  assert.equal(invoiceNumber, 'INV-19269');
  assert.equal(state.invoiceIndex, '19269');
  assert.deepEqual(state.settingsUpdates, [{ localId: 10, value: '19269' }]);
});

test('POS sales keep their own prefix and share the counter', async () => {
  const invoiceNumber = await saleService.allocateInvoiceNumber(
    createConnection(),
    {
      orgId,
      userId,
      saleType: 'pos',
      consume: false,
    },
  );

  assert.equal(invoiceNumber, 'POS-19269');
});
