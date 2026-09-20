const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const CLOSED_YEAR_ERROR =
  'FISCAL_YEAR_CLOSED';

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const OPEN_STATUS = 'open';

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

/*
 * Fiscal years are compared as plain YYYY-MM-DD strings: they sort
 * chronologically and match the DATE columns in MySQL, so a range test needs
 * no timezone conversion. `Date` values (mysql2 returns DATE as a JS Date)
 * are normalized back to the calendar day.
 */
function toDateOnly(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  if (DATE_PATTERN.test(text)) {
    return text;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeYear(row) {
  if (!row) return null;

  return {
    ...row,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    fiscal_status:
      String(row.fiscal_status || OPEN_STATUS).toLowerCase(),
  };
}

function normalizeYears(rows) {
  return (rows || []).map(normalizeYear);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function defaultYearName(startDate, endDate) {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);

  return startYear === endYear
    ? `FY ${startYear}`
    : `FY ${startYear}-${endYear}`;
}

function assertValidRange(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new AppError(
      'start_date and end_date are required as YYYY-MM-DD dates.',
      422,
      'INVALID_FISCAL_YEAR_DATES',
    );
  }

  if (startDate > endDate) {
    throw new AppError(
      'start_date must be on or before end_date.',
      422,
      'INVALID_FISCAL_YEAR_RANGE',
      {
        start_date: startDate,
        end_date: endDate,
      },
    );
  }
}

/*
 * Overlap is enforced in the service transaction, not by a database
 * constraint (MySQL cannot express an exclusive range). Callers therefore
 * lock the organization's fiscal years first — see createFiscalYear /
 * updateFiscalYear — so the check and the write cannot interleave.
 */
async function assertNoOverlap(
  executor,
  {
    orgId,
    startDate,
    endDate,
    excludeLocalId = null,
  },
) {
  const overlapping =
    await fiscalYearRepository.findOverlapping(
      executor,
      {
        orgId,
        startDate,
        endDate,
        excludeLocalId,
      },
    );

  if (overlapping.length) {
    throw new AppError(
      `The dates overlap the existing fiscal year "${overlapping[0].name}" (${toDateOnly(overlapping[0].start_date)} to ${toDateOnly(overlapping[0].end_date)}).`,
      409,
      'FISCAL_YEAR_OVERLAP',
      {
        conflicting_fiscal_year_id: overlapping[0].local_id,
        conflicting_start_date: toDateOnly(overlapping[0].start_date),
        conflicting_end_date: toDateOnly(overlapping[0].end_date),
      },
    );
  }
}

/* ------------------------------ reads ------------------------------ */

async function listFiscalYears({
  user,
  filters = {},
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const rows =
    await fiscalYearRepository.findAll(
      db,
      {
        orgId,
        status:
          filters.include_deleted === 1 ? null : 1,
        fiscalStatus: filters.fiscal_status || null,
      },
    );

  return normalizeYears(rows);
}

async function getFiscalYear({
  user,
  fiscalYearId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const row =
    await fiscalYearRepository.findByLocalId(
      db,
      {
        orgId,
        localId: fiscalYearId,
      },
    );

  if (!row || Number(row.status) === 0) {
    throw new AppError(
      'Fiscal year not found.',
      404,
      'FISCAL_YEAR_NOT_FOUND',
    );
  }

  return normalizeYear(row);
}

/*
 * Resolves the fiscal year that contains a date. Nothing is ever assigned
 * silently: when no configured year covers the date this returns null, so the
 * caller decides whether that is a report gap or a business error.
 */
async function findFiscalYearForDate(
  executor,
  {
    orgId,
    date,
  },
) {
  const day = toDateOnly(date);

  if (!day) {
    throw new AppError(
      'A valid date (YYYY-MM-DD) is required.',
      422,
      'INVALID_DATE',
    );
  }

  const row =
    await fiscalYearRepository.findCoveringDate(
      executor,
      {
        orgId,
        date: day,
      },
    );

  return normalizeYear(row);
}

/*
 * An absent date means "today"; an unparseable date is a caller error and is
 * never quietly replaced with today.
 */
function resolveRequestedDate(date) {
  if (date === undefined || date === null || date === '') {
    return todayDateOnly();
  }

  const day = toDateOnly(date);

  if (!day) {
    throw new AppError(
      'A valid date (YYYY-MM-DD) is required.',
      422,
      'INVALID_DATE',
      {
        date,
      },
    );
  }

  return day;
}

async function resolveFiscalYearForDate({
  user,
  date,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const day = resolveRequestedDate(date);
  const fiscalYear =
    await findFiscalYearForDate(
      db,
      {
        orgId,
        date: day,
      },
    );

  return {
    date: day,
    fiscal_year: fiscalYear,
    found: Boolean(fiscalYear),
  };
}

/*
 * The "current" fiscal year is derived from the organization's configured
 * ranges, never from the calendar year: an organization may run a fiscal year
 * that starts in any month.
 */
async function getCurrentFiscalYear({
  user,
  date,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const day = resolveRequestedDate(date);
  const fiscalYear =
    await findFiscalYearForDate(
      db,
      {
        orgId,
        date: day,
      },
    );

  if (!fiscalYear) {
    throw new AppError(
      `No fiscal year is configured for ${day}. Create the fiscal year before relying on period reporting.`,
      404,
      'FISCAL_YEAR_NOT_FOUND',
      {
        date: day,
      },
    );
  }

  return fiscalYear;
}

/*
 * Foundation helpers for the later enforcement step. They are deliberately
 * NOT wired into the sale/purchase/payment/journal services yet: Step 3 must
 * not start blocking existing production transactions.
 */
async function isDateInClosedFiscalYear(
  executor,
  {
    orgId,
    date,
  },
) {
  const fiscalYear =
    await findFiscalYearForDate(
      executor,
      {
        orgId,
        date,
      },
    );

  if (!fiscalYear) {
    return false;
  }

  return fiscalYear.fiscal_status === 'closed';
}

async function isDateInOpenFiscalYear(
  executor,
  {
    orgId,
    date,
  },
) {
  const fiscalYear =
    await findFiscalYearForDate(
      executor,
      {
        orgId,
        date,
      },
    );

  return Boolean(fiscalYear) &&
    fiscalYear.fiscal_status === OPEN_STATUS;
}

/* ------------------------------ writes ------------------------------ */

async function createFiscalYear({
  user,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const startDate = toDateOnly(data.start_date);
  const endDate = toDateOnly(data.end_date);

  assertValidRange(startDate, endDate);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Serialize fiscal-year writes per organization, then re-check the range
     * while the rows are locked.
     */
    await fiscalYearRepository.lockOrganizationYears(
      connection,
      {
        orgId,
      },
    );

    await assertNoOverlap(
      connection,
      {
        orgId,
        startDate,
        endDate,
      },
    );

    const localId = generateLocalId();

    const fiscalYear =
      await fiscalYearRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data: {
            name:
              String(data.name || '').trim() ||
              defaultYearName(startDate, endDate),
            start_date: startDate,
            end_date: endDate,
            note: data.note ?? null,
          },
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'fiscal_years',
        entityId: fiscalYear.id,

        oldValues: null,
        newValues: fiscalYear,

        description:
          `Created fiscal year ${fiscalYear.name} (${startDate} to ${endDate})`,

        ipAddress: requestContext?.ipAddress,

        sessionId: requestContext?.sessionId,

        deviceInfo: requestContext?.deviceInfo,
      },
    );

    await connection.commit();

    return normalizeYear(fiscalYear);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * Only an OPEN fiscal year can be edited. Dates may be changed, but the new
 * range must not collide with another year. Closing a year is a later,
 * explicitly approved step, so there is no status change here.
 */
async function updateFiscalYear({
  user,
  fiscalYearId,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldFiscalYear =
      await fiscalYearRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: fiscalYearId,
          forUpdate: true,
        },
      );

    if (!oldFiscalYear || Number(oldFiscalYear.status) === 0) {
      throw new AppError(
        'Fiscal year not found.',
        404,
        'FISCAL_YEAR_NOT_FOUND',
      );
    }

    if (
      String(oldFiscalYear.fiscal_status).toLowerCase() !==
      OPEN_STATUS
    ) {
      throw new AppError(
        'A closed fiscal year cannot be edited.',
        409,
        CLOSED_YEAR_ERROR,
        {
          fiscal_year_id: oldFiscalYear.local_id,
        },
      );
    }

    const startDate =
      data.start_date !== undefined
        ? toDateOnly(data.start_date)
        : toDateOnly(oldFiscalYear.start_date);

    const endDate =
      data.end_date !== undefined
        ? toDateOnly(data.end_date)
        : toDateOnly(oldFiscalYear.end_date);

    assertValidRange(startDate, endDate);

    /*
     * A date change can widen the range into another year, so the overlap
     * check runs again under the organization-wide lock.
     */
    if (
      data.start_date !== undefined ||
      data.end_date !== undefined
    ) {
      await fiscalYearRepository.lockOrganizationYears(
        connection,
        {
          orgId,
        },
      );

      await assertNoOverlap(
        connection,
        {
          orgId,
          startDate,
          endDate,
          excludeLocalId: Number(oldFiscalYear.local_id),
        },
      );
    }

    const updatedFiscalYear =
      await fiscalYearRepository.update(
        connection,
        {
          orgId,
          localId: fiscalYearId,
          userId,
          data: {
            ...(data.name !== undefined
              ? { name: String(data.name).trim() }
              : {}),
            ...(data.start_date !== undefined
              ? { start_date: startDate }
              : {}),
            ...(data.end_date !== undefined
              ? { end_date: endDate }
              : {}),
            ...(data.note !== undefined
              ? { note: data.note }
              : {}),
          },
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'fiscal_years',
        entityId: updatedFiscalYear.id,

        oldValues: oldFiscalYear,
        newValues: updatedFiscalYear,

        description:
          `Updated fiscal year ${updatedFiscalYear.name} (${startDate} to ${endDate})`,

        ipAddress: requestContext?.ipAddress,

        sessionId: requestContext?.sessionId,

        deviceInfo: requestContext?.deviceInfo,
      },
    );

    await connection.commit();

    return normalizeYear(updatedFiscalYear);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ------------------------------ summary ------------------------------ */

function collapse(rows, {
  amountField = 'total',
  countField = 'cnt',
} = {}) {
  let total = 0;
  let count = 0;
  const byCurrency = {};

  for (const row of rows || []) {
    const currency = row.currency || 'AFN';
    const amount = Number(row[amountField]) || 0;

    byCurrency[currency] =
      (byCurrency[currency] || 0) + amount;
    total += amount;
    count += Number(row[countField]) || 0;
  }

  return {
    total,
    count,
    by_currency: byCurrency,
  };
}

function collapseSigned(rows, {
  debitField = 'debit',
  creditField = 'credit',
} = {}) {
  let debit = 0;
  let credit = 0;
  const debitByCurrency = {};
  const creditByCurrency = {};

  for (const row of rows || []) {
    const currency = row.currency || 'AFN';
    const rowDebit = Number(row[debitField]) || 0;
    const rowCredit = Number(row[creditField]) || 0;

    debitByCurrency[currency] =
      (debitByCurrency[currency] || 0) + rowDebit;
    creditByCurrency[currency] =
      (creditByCurrency[currency] || 0) + rowCredit;
    debit += rowDebit;
    credit += rowCredit;
  }

  const byCurrency = {};

  for (const currency of new Set([
    ...Object.keys(debitByCurrency),
    ...Object.keys(creditByCurrency),
  ])) {
    byCurrency[currency] =
      (creditByCurrency[currency] || 0) -
      (debitByCurrency[currency] || 0);
  }

  return {
    debit,
    credit,
    net: credit - debit,
    debit_by_currency: debitByCurrency,
    credit_by_currency: creditByCurrency,
    net_by_currency: byCurrency,
  };
}

/*
 * Read-only fiscal-year summary. It classifies documents by their accounting
 * date inside the fiscal-year range — it never writes, never creates closing
 * entries and never touches inventory or account balances.
 */
async function getFiscalYearSummary({
  user,
  fiscalYearId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const row =
    await fiscalYearRepository.findByLocalId(
      db,
      {
        orgId,
        localId: fiscalYearId,
      },
    );

  if (!row || Number(row.status) === 0) {
    throw new AppError(
      'Fiscal year not found.',
      404,
      'FISCAL_YEAR_NOT_FOUND',
    );
  }

  const fiscalYear = normalizeYear(row);

  const range = {
    orgId,
    startDate: fiscalYear.start_date,
    endDate: fiscalYear.end_date,
  };

  const [
    salesRows,
    purchaseRows,
    saleReturnRows,
    purchaseReturnRows,
    wasteRows,
    customerPaymentRows,
    supplierPaymentRows,
    expenseRows,
    treasuryRows,
    ownerRows,
    openingRows,
  ] = await Promise.all([
    fiscalYearRepository.sumConfirmedSales(db, range),
    fiscalYearRepository.sumConfirmedPurchases(db, range),
    fiscalYearRepository.sumConfirmedSaleReturns(db, range),
    fiscalYearRepository.sumConfirmedPurchaseReturns(db, range),
    fiscalYearRepository.sumConfirmedWastes(db, range),
    fiscalYearRepository.sumCustomerPayments(db, range),
    fiscalYearRepository.sumSupplierPayments(db, range),
    fiscalYearRepository.sumJournalsForAccountCode(db, {
      ...range,
      code: 'EXPENSES',
    }),
    fiscalYearRepository.sumJournalsForAccountCode(db, {
      ...range,
      code: 'TREASURY',
    }),
    fiscalYearRepository.sumOwnerAccounts(db, range),
    fiscalYearRepository.sumOpeningBalanceJournals(db, range),
  ]);

  const expenses = collapseSigned(expenseRows);
  const treasury = collapseSigned(treasuryRows);
  const owners = collapseSigned(ownerRows);

  return {
    fiscal_year: fiscalYear,
    range: {
      start_date: fiscalYear.start_date,
      end_date: fiscalYear.end_date,
    },
    read_only: true,
    classification: 'accounting_date_range',
    basis: {
      sales: 'invoice_status = confirmed, sales.invoice_date',
      purchases: 'bill_status = confirmed, purchases.bill_date',
      sale_returns: 'return_status = confirmed, sale_returns.return_date',
      purchase_returns:
        'return_status = confirmed, purchase_returns.return_date',
      wastes: 'waste_status = confirmed, wastes.date',
      customer_payments: 'sale_payments.payment_date',
      supplier_payments: 'purchase_payments.payment_date',
      expenses: 'journals touching the EXPENSES account',
      treasury: 'journals touching the TREASURY account',
      owners: 'journals touching accounts with account_type_id = 7',
      opening_balances: "journals with reference_type = 'account'",
      fallback: 'COALESCE(<document date>, created_at) when the date is null',
    },
    categories: {
      sales: collapse(salesRows),
      purchases: collapse(purchaseRows),
      sale_returns: collapse(saleReturnRows),
      purchase_returns: collapse(purchaseReturnRows),
      wastes: collapse(wasteRows),
      customer_payments: collapse(customerPaymentRows),
      supplier_payments: collapse(supplierPaymentRows),
      expenses: {
        total: expenses.debit - expenses.credit,
        count: 0,
        by_currency: Object.fromEntries(
          Object.entries(expenses.debit_by_currency).map(
            ([currency, debit]) => [
              currency,
              debit - (expenses.credit_by_currency[currency] || 0),
            ],
          ),
        ),
      },
      owner_investment: {
        total: owners.credit,
        count: 0,
        by_currency: owners.credit_by_currency,
      },
      owner_withdrawals: {
        total: owners.debit,
        count: 0,
        by_currency: owners.debit_by_currency,
      },
      owner_net: {
        total: owners.net,
        count: 0,
        by_currency: owners.net_by_currency,
      },
      treasury_net: {
        total: treasury.net,
        count: 0,
        by_currency: treasury.net_by_currency,
      },
      opening_balance_journals: collapse(openingRows),
    },
    inventory: {
      continuous: true,
      reset: false,
      note:
        'Physical inventory is continuous across fiscal years. No stock ' +
        'quantity, batch or stock transaction is reset or re-created by a ' +
        'fiscal-year boundary, and this summary never writes to them.',
    },
    notes: [
      'This is a read-time classification by accounting date. No fiscal_year_id is stamped on historical (or new) documents.',
      'Revenue-type categories count confirmed documents only; draft documents are not fiscal-year events yet.',
      'No closing entries, retained earnings or carry-forward rows are produced here. Customer and supplier balances are not reset.',
      'Opening-balance journals carry the date they were created, not a user-entered accounting date, so they can fall into a different fiscal year than the year they describe.',
    ],
  };
}

module.exports = {
  /*
   * Exported so the close engine names the fiscal year it creates
   * automatically with exactly the same rule as a year created by hand.
   */
  defaultYearName,
  listFiscalYears,
  getFiscalYear,
  getFiscalYearSummary,
  createFiscalYear,
  updateFiscalYear,
  resolveFiscalYearForDate,
  getCurrentFiscalYear,
  findFiscalYearForDate,
  isDateInClosedFiscalYear,
  isDateInOpenFiscalYear,
  toDateOnly,
};
