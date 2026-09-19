/*
 * Authoritative bill-payment posting service.
 *
 * Every sale/purchase payment — whether it is created from the sale
 * screen, the purchase screen, the journal screen, or the generic
 * sale-payment / purchase-payment endpoints — must flow through this
 * single module. It owns:
 *
 *   - the payment row insert/update/soft-delete
 *   - the two payment journals (SALES/PURCHASE + control, and
 *     customer/supplier + treasury)
 *   - the single `remaining` recomputation formula
 *   - the activity log entries
 *   - the journal-driven "shadow payment" used when a manual journal
 *     references a bill
 *
 * This module deliberately depends only on repositories and utils. It
 * must NOT require sale.service / purchase.service / journal.service so
 * that journal insertion can happen without recursive business callbacks.
 *
 * Accounting semantics in this module intentionally mirror the previous
 * behaviour exactly (same debit/credit sides, same signed-amount
 * conventions, same currency conversion). Step 1 is about consistency,
 * not about redesigning the accounting.
 */

const AppError =
  require('../errors/AppError');

const journalRepository =
  require('../repositories/journal.repository');

const saleRepository =
  require('../repositories/sale.repository');

const purchaseRepository =
  require('../repositories/purchase.repository');

const salePaymentRepository =
  require('../repositories/sale-payment.repository');

const purchasePaymentRepository =
  require('../repositories/purchase-payment.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  convertCurrencyAmount,
} = require('../utils/currency');

const {
  accountingDate,
} = require('../utils/accountingDate');

function billRepository(isSale) {
  return isSale ? saleRepository : purchaseRepository;
}

function billPaymentRepository(isSale) {
  return isSale ? salePaymentRepository : purchasePaymentRepository;
}

function paymentReferenceType(isSale) {
  return isSale ? 'sale_payment' : 'purchase_payment';
}

function isConfirmedBill(billStatus) {
  return String(billStatus || '') === 'confirmed';
}

function isBillReference(referenceType) {
  return referenceType === 'sale' || referenceType === 'purchase';
}

/*
 * Low-level journal insert. Mirrors the createJournalEntry helpers
 * already used by sale/purchase services, but lives here so the payment
 * flows share one implementation and never re-enter journal.service.
 */
async function createJournalEntry(
  connection,
  {
    orgId,
    userId,
    requestContext,
    data,
    description,
  },
) {
  const localId = generateLocalId();

  const journal =
    await journalRepository.create(
      connection,
      {
        orgId,
        localId,
        userId,
        data,
      },
    );

  await activityRepository.create(
    connection,
    {
      orgId,
      userId,

      action: 'create',
      tableName: 'journals',
      entityId: journal.id,

      oldValues: null,
      newValues: journal,

      description:
        description || `Created journal entry ${journal.id}`,

      ipAddress: requestContext?.ipAddress,
      sessionId: requestContext?.sessionId,
      deviceInfo: requestContext?.deviceInfo,
    },
  );

  return journal;
}

/*
 * Optional idempotency marker. When a caller supplies the same
 * `request_id` twice (frontend retry, network timeout + retry, double
 * click), the second call returns the payment that already carries the
 * marker instead of posting a duplicate. No schema change is needed —
 * the marker rides in the payment description.
 */
function requestIdMarker(requestId) {
  if (
    requestId === undefined ||
    requestId === null ||
    requestId === ''
  ) {
    return null;
  }

  return `[rid:${String(requestId).slice(0, 80)}]`;
}

async function findBillPayments(
  executor,
  {
    orgId,
    billId,
    isSale,
    includeDeleted = false,
  },
) {
  return isSale
    ? saleRepository.findPaymentsBySale(
        executor,
        {
          orgId,
          saleId: billId,
          includeDeleted,
        },
      )
    : purchaseRepository.findPaymentsByPurchase(
        executor,
        {
          orgId,
          purchaseId: billId,
          includeDeleted,
        },
      );
}

async function findBillReturns(
  executor,
  {
    orgId,
    billId,
    isSale,
    includeDeleted = false,
  },
) {
  return isSale
    ? saleRepository.findReturnsBySale(
        executor,
        {
          orgId,
          saleId: billId,
          includeDeleted,
        },
      )
    : purchaseRepository.findReturnsByPurchase(
        executor,
        {
          orgId,
          purchaseId: billId,
          includeDeleted,
        },
      );
}

async function findAccountByCode(
  executor,
  {
    orgId,
    code,
    isSale,
  },
) {
  return isSale
    ? saleRepository.findAccountByCode(
        executor,
        {
          orgId,
          code,
        },
      )
    : purchaseRepository.findAccountByCode(
        executor,
        {
          orgId,
          code,
        },
      );
}

/*
 * The one and only remaining formula:
 *   total - active payments - active returns
 * Active payments are those with status = 1. Writes the result back to
 * sales.remaining / purchases.remaining (the column the lists read).
 */
async function recomputeBillRemaining(
  connection,
  {
    orgId,
    userId,
    bill,
    isSale,
  },
) {
  const repository = billRepository(isSale);

  const [payments, returns] = await Promise.all([
    findBillPayments(
      connection,
      {
        orgId,
        billId: bill.id,
        isSale,
        includeDeleted: true,
      },
    ),
    findBillReturns(
      connection,
      {
        orgId,
        billId: bill.id,
        isSale,
        includeDeleted: true,
      },
    ),
  ]);

  const totalPayments = payments
    .filter((payment) => Number(payment.status) === 1)
    .reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );

  const totalReturns = returns
    .filter((saleReturn) => Number(saleReturn.status) === 1)
    .reduce(
      (sum, saleReturn) => sum + Number(saleReturn.total_amount || 0),
      0,
    );

  const remaining =
    Number(bill.total_amount || 0) -
    totalPayments -
    totalReturns;

  await repository.update(
    connection,
    {
      orgId,
      localId: bill.id,
      userId,
      data: { remaining },
    },
  );

  return remaining;
}

/*
 * Posts the two journals that represent a payment for a bill.
 *
 *   entry 1: SALES/PURCHASE        <-> RECEIVABLE/PAYABLE
 *   entry 2: customer/supplier     <-> treasury/cash
 *
 * The signed-amount convention is preserved exactly:
 *   sale     : amount >= 0 is a Receive, amount < 0 is a refund
 *   purchase : amount <  0 is a Receive, amount >= 0 is a Payment
 *
 * Cross-currency payments are converted into the bill's currency before
 * posting so the customer/supplier balance only moves in the bill's
 * currency.
 */
async function postBillPaymentJournals(
  connection,
  {
    orgId,
    userId,
    requestContext,
    bill,
    payment,
    isSale,
    treasuryAccountId,
    description,
  },
) {
  const primaryCode = isSale ? 'SALES' : 'PURCHASE';
  const controlCode = isSale ? 'RECEIVABLE' : 'PAYABLE';

  const controlAccount = await findAccountByCode(
    connection,
    {
      orgId,
      code: controlCode,
      isSale,
    },
  );

  const primaryAccount = await findAccountByCode(
    connection,
    {
      orgId,
      code: primaryCode,
      isSale,
    },
  );

  if (!controlAccount) {
    throw new AppError(
      `${controlCode} account not found.`,
      500,
      `${controlCode}_ACCOUNT_NOT_FOUND`,
    );
  }

  if (!primaryAccount) {
    throw new AppError(
      `${primaryCode} account not found.`,
      500,
      `${primaryCode}_ACCOUNT_NOT_FOUND`,
    );
  }

  const signedAmount = Number(payment.amount || 0);
  const isReceive = isSale
    ? signedAmount >= 0
    : signedAmount < 0;
  const absAmount = Math.abs(signedAmount);

  const primaryDebit = isReceive ? 0 : absAmount;
  const primaryCredit = isReceive ? absAmount : 0;
  const controlDebit = isReceive ? absAmount : 0;
  const controlCredit = isReceive ? 0 : absAmount;

  const billCurrency = bill.currency || payment.currency || null;
  const isCrossCurrency =
    payment.currency &&
    billCurrency &&
    payment.currency !== billCurrency &&
    absAmount > 0;

  let journalCurrency = payment.currency || null;
  let journalAmount = absAmount;

  if (isCrossCurrency) {
    journalCurrency = billCurrency;
    journalAmount = await convertCurrencyAmount(
      connection,
      {
        orgId,
        amount: absAmount,
        fromCurrency: payment.currency,
        toCurrency: billCurrency,
      },
    );
  }

  if (!(Number(journalAmount) > 0)) {
    return {
      journalCurrency,
      journalAmount,
    };
  }

  const paymentDescription =
    description ||
    (isSale
      ? 'Payment for Sales Invoice'
      : 'Payment for Purchase Invoice');

  /*
   * The payment carries its own accounting date. The journal must use it
   * rather than the moment the posting happened, so a payment recorded on
   * 31 Dec for a December bill is filed in December — and therefore in the
   * fiscal year the user intended — even when it is entered days later.
   *
   * A payment with no usable date falls back to today's LOCAL calendar day,
   * never the UTC day.
   */
  const journalDate = accountingDate(payment.payment_date);

  const referenceType = paymentReferenceType(isSale);

  // SALES/PURCHASE <-> RECEIVABLE/PAYABLE
  await createJournalEntry(
    connection,
    {
      orgId,
      userId,
      requestContext,
      data: {
        date: journalDate,
        reference_id: payment.id,
        reference_type: referenceType,
        description: paymentDescription,
        currency: journalCurrency,
        first_entry_account: primaryAccount.id,
        first_entry_debit: primaryDebit ? journalAmount : 0,
        first_entry_credit: primaryCredit ? journalAmount : 0,
        second_entry_account: controlAccount.id,
        second_entry_debit: controlDebit ? journalAmount : 0,
        second_entry_credit: controlCredit ? journalAmount : 0,
        status: 1,
      },
      description:
        `Created ${primaryCode.toLowerCase()}/${controlCode.toLowerCase()} journal for payment ${payment.id}`,
    },
  );

  // customer/supplier <-> treasury/cash
  await createJournalEntry(
    connection,
    {
      orgId,
      userId,
      requestContext,
      data: {
        date: journalDate,
        reference_id: payment.id,
        reference_type: referenceType,
        description: paymentDescription,
        currency: journalCurrency,
        first_entry_account: bill.account_id,
        first_entry_debit: primaryDebit ? journalAmount : 0,
        first_entry_credit: primaryCredit ? journalAmount : 0,
        second_entry_account: treasuryAccountId,
        second_entry_debit: controlDebit ? journalAmount : 0,
        second_entry_credit: controlCredit ? journalAmount : 0,
        status: 1,
      },
      description:
        `Created ${isSale ? 'customer' : 'supplier'}/treasury journal for payment ${payment.id}`,
    },
  );

  return {
    journalCurrency,
    journalAmount,
  };
}

async function postBillPaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    requestContext,
    bill,
    billId,
    isSale,
    data,
  },
) {
  const repository = billRepository(isSale);

  const marker = requestIdMarker(data.request_id);

  if (marker) {
    const existing = await findBillPayments(
      connection,
      {
        orgId,
        billId,
        isSale,
        includeDeleted: false,
      },
    );

    const duplicate = existing.find((payment) =>
      (payment.description || '').includes(marker),
    );

    if (duplicate) {
      return duplicate;
    }
  }

  const defaultDescription = isSale
    ? 'Payment for Sales Invoice'
    : 'Payment for Purchase Invoice';

  const storedDescription =
    data.description ||
    defaultDescription;

  const description = marker
    ? `${storedDescription} ${marker}`
    : storedDescription;

  const paymentLocalId = generateLocalId();

  const payment = await repository.createPayment(
    connection,
    {
      orgId,
      localId: paymentLocalId,
      userId,
      data: {
        ...data,
        ...(isSale
          ? { sale_id: billId }
          : { purchase_id: billId }),
        description,
      },
    },
  );

  await postBillPaymentJournals(
    connection,
    {
      orgId,
      userId,
      requestContext,
      bill,
      payment,
      isSale,
      treasuryAccountId: data.account_id,
      description,
    },
  );

  await activityRepository.create(
    connection,
    {
      orgId,
      userId,

      action: 'create',
      tableName: isSale ? 'sale_payments' : 'purchase_payments',
      entityId: payment.id,

      oldValues: null,
      newValues: payment,

      description:
        `Added payment of ${payment.amount} ${payment.currency} for ${isSale ? 'sale' : 'purchase'} #${billId}`,

      ipAddress: requestContext?.ipAddress,
      sessionId: requestContext?.sessionId,
      deviceInfo: requestContext?.deviceInfo,
    },
  );

  await recomputeBillRemaining(
    connection,
    {
      orgId,
      userId,
      bill,
      isSale,
    },
  );

  return payment;
}

async function postSalePaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    requestContext,
    sale,
    saleId,
    data,
  },
) {
  return postBillPaymentOnConnection(
    connection,
    {
      orgId,
      userId,
      requestContext,
      bill: sale,
      billId: saleId,
      isSale: true,
      data,
    },
  );
}

async function postPurchasePaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    requestContext,
    purchase,
    purchaseId,
    data,
  },
) {
  return postBillPaymentOnConnection(
    connection,
    {
      orgId,
      userId,
      requestContext,
      bill: purchase,
      billId: purchaseId,
      isSale: false,
      data,
    },
  );
}

/*
 * Reverses the accounting of an existing payment: soft-delete the two
 * payment journals and refresh the parent bill's remaining. Used by both
 * delete and the "reverse" half of an update.
 */
async function reverseBillPaymentJournals(
  connection,
  {
    orgId,
    userId,
    paymentId,
    isSale,
  },
) {
  await journalRepository.softDeleteByReference(
    connection,
    {
      orgId,
      referenceId: paymentId,
      referenceType: paymentReferenceType(isSale),
      userId,
    },
  );
}

async function softDeleteBillPaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    payment,
    isSale,
  },
) {
  const repository = billRepository(isSale);

  const deletedPayment = await repository.softDeletePayment(
    connection,
    {
      orgId,
      localId: payment.id,
      userId,
    },
  );

  await reverseBillPaymentJournals(
    connection,
    {
      orgId,
      userId,
      paymentId: payment.id,
      isSale,
    },
  );

  const billId = isSale
    ? payment.sale_id
    : payment.purchase_id;

  if (billId) {
    const bill = await repository.findByLocalId(
      connection,
      {
        orgId,
        localId: billId,
        forUpdate: true,
      },
    );

    if (bill) {
      await recomputeBillRemaining(
        connection,
        {
          orgId,
          userId,
          bill,
          isSale,
        },
      );
    }
  }

  return deletedPayment;
}

/*
 * Updates a payment row while keeping its journals and both bills'
 * remaining values consistent. The old journals are reversed, the row is
 * updated in place, and fresh journals are posted against the (possibly
 * new) bill.
 */
async function updateBillPaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    requestContext,
    oldPayment,
    isSale,
    data,
    newBillId,
  },
) {
  const repository = billRepository(isSale);
  const paymentRepository = billPaymentRepository(isSale);

  const oldBillId = isSale
    ? oldPayment.sale_id
    : oldPayment.purchase_id;

  const targetBillId = newBillId ?? oldBillId;

  const merged = {
    ...(isSale
      ? { sale_id: targetBillId }
      : { purchase_id: targetBillId }),
    account_id: oldPayment.account_id,
    amount: oldPayment.amount,
    currency: oldPayment.currency,
    payment_date: oldPayment.payment_date,
    description: oldPayment.description,
    status: oldPayment.status,
  };

  if (data.account_id !== undefined) {
    merged.account_id = data.account_id;
  }
  if (data.amount !== undefined) {
    merged.amount = data.amount;
  }
  if (data.currency !== undefined) {
    merged.currency = data.currency;
  }
  if (data.payment_date !== undefined) {
    merged.payment_date = data.payment_date;
  }
  if (data.description !== undefined) {
    merged.description = data.description;
  }
  if (data.status !== undefined) {
    merged.status = data.status;
  }

  await reverseBillPaymentJournals(
    connection,
    {
      orgId,
      userId,
      paymentId: oldPayment.id,
      isSale,
    },
  );

  const updatedPayment = await paymentRepository.update(
    connection,
    {
      orgId,
      localId: oldPayment.id,
      userId,
      data: merged,
    },
  );

  const bill = await repository.findByLocalId(
    connection,
    {
      orgId,
      localId: targetBillId,
      forUpdate: true,
    },
  );

  if (bill) {
    await postBillPaymentJournals(
      connection,
      {
        orgId,
        userId,
        requestContext,
        bill,
        payment: updatedPayment,
        isSale,
        treasuryAccountId: merged.account_id,
        description: merged.description,
      },
    );
  }

  if (
    oldBillId &&
    String(oldBillId) !== String(targetBillId)
  ) {
    const oldBill = await repository.findByLocalId(
      connection,
      {
        orgId,
        localId: oldBillId,
        forUpdate: true,
      },
    );

    if (oldBill) {
      await recomputeBillRemaining(
        connection,
        {
          orgId,
          userId,
          bill: oldBill,
          isSale,
        },
      );
    }
  }

  if (bill) {
    await recomputeBillRemaining(
      connection,
      {
        orgId,
        userId,
        bill,
        isSale,
      },
    );
  }

  return updatedPayment;
}

/* ------------------------------------------------------------------ *
 * Journal-driven payments
 *
 * When a user enters a journal that references a sale/purchase bill, the
 * journal itself IS the accounting entry, so we must not post the two
 * standard payment journals on top of it. We only create/remove the
 * payment row that keeps the bill's remaining in sync, using the same
 * remaining formula as every other path.
 * ------------------------------------------------------------------ */

function billPaymentAmount(journal) {
  if (journal.reference_type === 'sale') {
    return (
      Number(journal.first_entry_credit || 0) -
      Number(journal.first_entry_debit || 0)
    );
  }

  if (journal.reference_type === 'purchase') {
    return (
      Number(journal.first_entry_debit || 0) -
      Number(journal.first_entry_credit || 0)
    );
  }

  return 0;
}

function journalPaymentTag(journalId) {
  return `journal:${journalId}`;
}

function billDisplayNumber(bill, isSale) {
  return isSale
    ? bill.invoice_number || bill.bill_number || `#${bill.id}`
    : bill.bill_number || bill.invoice_number || `#${bill.id}`;
}

async function findJournalBillPayment(
  executor,
  {
    orgId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type)) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';

  const payments = await findBillPayments(
    executor,
    {
      orgId,
      billId: journal.reference_id,
      isSale,
      includeDeleted: true,
    },
  );

  const tag = journalPaymentTag(journal.id);

  const matches = payments.filter((payment) =>
    (payment.description || '').includes(tag),
  );

  return (
    matches.find((payment) => Number(payment.status) === 1) ||
    matches[0] ||
    null
  );
}

async function recordJournalBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type)) {
    return null;
  }

  const amount = billPaymentAmount(journal);
  if (!amount || !journal.reference_id) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';
  const repository = billRepository(isSale);

  const bill = await repository.findByLocalId(
    connection,
    {
      orgId,
      localId: journal.reference_id,
      forUpdate: true,
    },
  );

  if (!bill || Number(bill.status) === 0) {
    return null;
  }

  const confirmed = isSale
    ? isConfirmedBill(bill.invoice_status)
    : isConfirmedBill(bill.bill_status);

  if (!confirmed) {
    return null;
  }

  let paymentAmount = amount;
  let paymentCurrency = journal.currency || bill.currency || null;

  if (
    paymentCurrency &&
    bill.currency &&
    paymentCurrency !== bill.currency
  ) {
    paymentAmount = await convertCurrencyAmount(
      connection,
      {
        orgId,
        amount,
        fromCurrency: paymentCurrency,
        toCurrency: bill.currency,
      },
    );

    paymentCurrency = bill.currency;
  }

  const paymentLocalId = generateLocalId();

  const payment = await repository.createPayment(
    connection,
    {
      orgId,
      localId: paymentLocalId,
      userId,
      data: {
        ...(isSale
          ? { sale_id: bill.id }
          : { purchase_id: bill.id }),
        account_id:
          journal.second_entry_account ||
          journal.first_entry_account,
        amount: paymentAmount,
        currency: paymentCurrency,
        payment_date:
          journal.date || new Date().toISOString(),
        description:
          `Payment via ${journalPaymentTag(journal.id)} for ${isSale ? 'Sale' : 'Purchase'} #${billDisplayNumber(bill, isSale)}`,
        status: 1,
      },
    },
  );

  await recomputeBillRemaining(
    connection,
    {
      orgId,
      userId,
      bill,
      isSale,
    },
  );

  return payment;
}

async function removeJournalBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (
    !isBillReference(journal.reference_type) ||
    !journal.reference_id
  ) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';
  const repository = billRepository(isSale);

  const bill = await repository.findByLocalId(
    connection,
    {
      orgId,
      localId: journal.reference_id,
      forUpdate: true,
    },
  );

  if (!bill) {
    return null;
  }

  const existing = await findJournalBillPayment(
    connection,
    {
      orgId,
      journal,
    },
  );

  if (!existing) {
    return null;
  }

  await repository.softDeletePayment(
    connection,
    {
      orgId,
      localId: existing.id,
      userId,
    },
  );

  await recomputeBillRemaining(
    connection,
    {
      orgId,
      userId,
      bill,
      isSale,
    },
  );

  return existing;
}

async function syncJournalBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (
    !isBillReference(journal.reference_type) ||
    !journal.reference_id
  ) {
    return null;
  }

  await removeJournalBillPayment(
    connection,
    {
      orgId,
      userId,
      journal,
    },
  );

  return recordJournalBillPayment(
    connection,
    {
      orgId,
      userId,
      journal,
    },
  );
}

module.exports = {
  recomputeBillRemaining,
  postSalePaymentOnConnection,
  postPurchasePaymentOnConnection,
  updateBillPaymentOnConnection,
  softDeleteBillPaymentOnConnection,
  reverseBillPaymentJournals,
  recordJournalBillPayment,
  removeJournalBillPayment,
  syncJournalBillPayment,
  billPaymentAmount,
  journalPaymentTag,
};
