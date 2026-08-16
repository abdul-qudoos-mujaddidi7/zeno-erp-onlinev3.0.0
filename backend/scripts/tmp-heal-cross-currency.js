require('dotenv').config();
const db = require('../db');
const { generateLocalId } = require('../utils/generateLocalId');
const journalRepository = require('../repositories/journal.repository');
const saleRepository = require('../repositories/sale.repository');
const purchaseRepository = require('../repositories/purchase.repository');
const { convertCurrencyAmount } = require('../utils/currency');

const ORG_ID = 300;

async function findSystemAccount(repo, code) {
  const row = await repo.findAccountByCode(db, { orgId: ORG_ID, code });
  if (!row) throw new Error(`Missing system account ${code}`);
  return row;
}

async function healSalePayments() {
  const [payments] = await db.query(
    `SELECT p.id, p.local_id, p.sale_id, p.amount, p.currency, p.account_id, p.description, p.created_by
     FROM sale_payments p JOIN sales s ON s.local_id = p.sale_id
     WHERE p.org_id = ? AND p.status = 1 AND p.currency <> s.currency`,
    [ORG_ID]
  );

  const salesAcct = await findSystemAccount(saleRepository, 'SALES');
  const receivableAcct = await findSystemAccount(saleRepository, 'RECEIVABLE');

  let healed = 0;
  for (const payment of payments) {
    const [saleRows] = await db.query(
      'SELECT local_id, account_id, currency FROM sales WHERE org_id = ? AND local_id = ?',
      [ORG_ID, payment.sale_id]
    );
    const sale = saleRows[0];
    if (!sale) continue;

    const [existing] = await db.query(
      'SELECT id FROM journals WHERE org_id = ? AND reference_id = ? AND reference_type = ? AND status = 1 AND currency = ?',
      [ORG_ID, payment.local_id, 'sale_payment', sale.currency]
    );
    if (existing.length > 0) {
      console.log(`sale_payment ${payment.local_id}: already has converted journal, skipping`);
      continue;
    }

    const signedAmount = Number(payment.amount || 0);
    const isReceive = signedAmount >= 0;
    const absAmount = Math.abs(signedAmount);

    const convertedAmount = await convertCurrencyAmount(db, {
      orgId: ORG_ID,
      amount: absAmount,
      fromCurrency: payment.currency,
      toCurrency: sale.currency,
    });

    if (!(Number(convertedAmount) > 0)) {
      console.log(`sale_payment ${payment.local_id}: converted amount is 0, skipping`);
      continue;
    }

    const salesDebit = isReceive ? 0 : absAmount;
    const salesCredit = isReceive ? absAmount : 0;
    const receivableDebit = isReceive ? absAmount : 0;
    const receivableCredit = isReceive ? 0 : absAmount;

    const j1 = await journalRepository.create(db, {
      orgId: ORG_ID,
      localId: generateLocalId(),
      userId: payment.created_by,
      data: {
        date: new Date().toISOString(),
        reference_id: payment.local_id,
        reference_type: 'sale_payment',
        description: payment.description,
        currency: sale.currency,
        first_entry_account: salesAcct.id,
        first_entry_debit: salesDebit ? convertedAmount : 0,
        first_entry_credit: salesCredit ? convertedAmount : 0,
        second_entry_account: receivableAcct.id,
        second_entry_debit: receivableDebit ? convertedAmount : 0,
        second_entry_credit: receivableCredit ? convertedAmount : 0,
        status: 1,
      },
    });

    const j2 = await journalRepository.create(db, {
      orgId: ORG_ID,
      localId: generateLocalId(),
      userId: payment.created_by,
      data: {
        date: new Date().toISOString(),
        reference_id: payment.local_id,
        reference_type: 'sale_payment',
        description: payment.description,
        currency: sale.currency,
        first_entry_account: sale.account_id,
        first_entry_debit: salesDebit ? convertedAmount : 0,
        first_entry_credit: salesCredit ? convertedAmount : 0,
        second_entry_account: payment.account_id,
        second_entry_debit: receivableDebit ? convertedAmount : 0,
        second_entry_credit: receivableCredit ? convertedAmount : 0,
        status: 1,
      },
    });

    console.log(
      `sale_payment ${payment.local_id}: added converted journals ${j1.id}, ${j2.id} ` +
        `(${convertedAmount} ${sale.currency})`
    );
    healed += 1;
  }

  return healed;
}

async function healPurchasePayments() {
  const [payments] = await db.query(
    `SELECT p.id, p.local_id, p.purchase_id, p.amount, p.currency, p.account_id, p.description, p.created_by
     FROM purchase_payments p JOIN purchases s ON s.local_id = p.purchase_id
     WHERE p.org_id = ? AND p.status = 1 AND p.currency <> s.currency`,
    [ORG_ID]
  );

  const purchaseAcct = await findSystemAccount(purchaseRepository, 'PURCHASE');
  const payableAcct = await findSystemAccount(purchaseRepository, 'PAYABLE');

  let healed = 0;
  for (const payment of payments) {
    const [purchaseRows] = await db.query(
      'SELECT local_id, account_id, currency FROM purchases WHERE org_id = ? AND local_id = ?',
      [ORG_ID, payment.purchase_id]
    );
    const purchase = purchaseRows[0];
    if (!purchase) continue;

    const [existing] = await db.query(
      'SELECT id FROM journals WHERE org_id = ? AND reference_id = ? AND reference_type = ? AND status = 1 AND currency = ?',
      [ORG_ID, payment.local_id, 'purchase_payment', purchase.currency]
    );
    if (existing.length > 0) {
      console.log(`purchase_payment ${payment.local_id}: already has converted journal, skipping`);
      continue;
    }

    const signedAmount = Number(payment.amount || 0);
    const isReceive = signedAmount < 0;
    const absAmount = Math.abs(signedAmount);

    const convertedAmount = await convertCurrencyAmount(db, {
      orgId: ORG_ID,
      amount: absAmount,
      fromCurrency: payment.currency,
      toCurrency: purchase.currency,
    });

    if (!(Number(convertedAmount) > 0)) {
      console.log(`purchase_payment ${payment.local_id}: converted amount is 0, skipping`);
      continue;
    }

    const purchaseDebit = isReceive ? 0 : absAmount;
    const purchaseCredit = isReceive ? absAmount : 0;
    const payableDebit = isReceive ? absAmount : 0;
    const payableCredit = isReceive ? 0 : absAmount;

    const j1 = await journalRepository.create(db, {
      orgId: ORG_ID,
      localId: generateLocalId(),
      userId: payment.created_by,
      data: {
        date: new Date().toISOString(),
        reference_id: payment.local_id,
        reference_type: 'purchase_payment',
        description: payment.description,
        currency: purchase.currency,
        first_entry_account: purchaseAcct.id,
        first_entry_debit: purchaseDebit ? convertedAmount : 0,
        first_entry_credit: purchaseCredit ? convertedAmount : 0,
        second_entry_account: payableAcct.id,
        second_entry_debit: payableDebit ? convertedAmount : 0,
        second_entry_credit: payableCredit ? convertedAmount : 0,
        status: 1,
      },
    });

    const j2 = await journalRepository.create(db, {
      orgId: ORG_ID,
      localId: generateLocalId(),
      userId: payment.created_by,
      data: {
        date: new Date().toISOString(),
        reference_id: payment.local_id,
        reference_type: 'purchase_payment',
        description: payment.description,
        currency: purchase.currency,
        first_entry_account: purchase.account_id,
        first_entry_debit: purchaseDebit ? convertedAmount : 0,
        first_entry_credit: purchaseCredit ? convertedAmount : 0,
        second_entry_account: payment.account_id,
        second_entry_debit: payableDebit ? convertedAmount : 0,
        second_entry_credit: payableCredit ? convertedAmount : 0,
        status: 1,
      },
    });

    console.log(
      `purchase_payment ${payment.local_id}: added converted journals ${j1.id}, ${j2.id} ` +
        `(${convertedAmount} ${purchase.currency})`
    );
    healed += 1;
  }

  return healed;
}

(async () => {
  const saleHealed = await healSalePayments();
  const purchaseHealed = await healPurchasePayments();
  console.log(`Done. Sale payments healed: ${saleHealed}, purchase payments healed: ${purchaseHealed}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
