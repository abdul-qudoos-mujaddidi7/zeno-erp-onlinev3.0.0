/*
 * Opening-balance rows for the account reports (and anything else that lists an
 * account's transactions).
 *
 * When a fiscal year is closed, the closing engine carries the balance-sheet
 * accounts forward and stores each one as an opening balance of the NEXT
 * fiscal year (fiscal_year_opening_balances). Those balances are what the new
 * year starts from, and an operator opening an account right after a close must
 * SEE that starting line: the year the close just opened has no journals yet,
 * so the opening row is the only thing there is to show.
 *
 * They are presented as read-only rows — reference_type 'fiscal_year_open',
 * dated the receiving year's first day — and they are NOT inserted into the
 * journals table: every balance screen in this application computes an
 * account's balance as "credit - debit over ALL journals", so posting a second
 * copy of each balance-sheet balance as a journal would double every one of
 * them (Accounts page, dashboard, reports, reconciliation). The rows are built
 * from the stored opening-balance records instead, which keeps the ledger and
 * its balances exactly as they were.
 *
 * Pure functions only (no I/O), so the rules can be unit tested without a
 * browser or a server.
 */

/** `YYYY-MM-DD` from a date-only string, an ISO timestamp or a Date. */
export function toDateOnly(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const text = String(value);

  /* A plain calendar day never shifts: only timestamps are truncated. */
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/**
 * One read-only statement row for one opening balance.
 *
 * Signs follow the account statement (`opening_balance = credit - debit`): a
 * negative opening balance is a DEBIT side balance, a positive one is a CREDIT
 * side balance — the same convention the account report already uses for its
 * opening row, so the two screens can never disagree.
 */
function buildRow({ fiscalYear, start, row, allowZero = false }) {
  const amount = Number(row?.opening_balance || 0);

  /* The close writes no row for a zero balance: nothing to show. */
  if (!amount && !allowZero) {
    return null;
  }

  const debit = amount < 0 ? Math.abs(amount) : 0;
  const credit = amount > 0 ? amount : 0;
  const currency = row?.currency || 'AFN';

  return {
    id: `fy-opening-${fiscalYear.id}-${row?.account_id}-${currency}`,
    local_id: null,

    is_opening_balance: true,
    read_only: true,

    reference_type: 'fiscal_year_open',
    reference_id: fiscalYear.id,

    fiscal_year_id: fiscalYear.id,
    fiscal_year_name: fiscalYear.name || null,
    source_fiscal_year_name: row?.source_fiscal_year_name || null,

    date: start,

    account_id: row?.account_id ?? null,
    account_name: row?.account_name || null,
    account_code: row?.account_code || null,

    /*
     * The counterpart of a carried-forward balance is the previous year itself,
     * not an account: the row shows one account, exactly like a statement's
     * opening line.
     */
    first_entry_account: row?.account_id ?? null,
    first_entry_debit: debit,
    first_entry_credit: credit,
    second_entry_account: null,
    second_entry_debit: 0,
    second_entry_credit: 0,

    currency,
    description:
      `Opening balance carried into ${fiscalYear.name || 'the fiscal year'}`,

    debit,
    credit,
    balance: amount,
    running: { [currency]: amount },

    status: 1,
  };
}

/**
 * One read-only row per account + currency that the close carried into
 * `fiscalYear`.
 *
 * `ensureAccount` (`{ id, name, currency }`) guarantees a row for ONE account
 * even when the close wrote no balance for it — its opening is then simply zero.
 * That is only done when the year actually received a roll-forward (`rows` is
 * not empty): otherwise the year was never carried into this one, and a zero
 * row would state something that is not true.
 */
export function toOpeningBalanceRows({
  fiscalYear,
  rows = [],
  ensureAccount = null,
} = {}) {
  if (!fiscalYear?.id) {
    return [];
  }

  const start = toDateOnly(fiscalYear.start_date);
  const source = Array.isArray(rows) ? rows : [];

  const mapped = source
    .map((row) => buildRow({ fiscalYear, start, row }))
    .filter(Boolean);

  const ensuredId = ensureAccount?.id ?? ensureAccount?.account_id ?? null;

  if (ensuredId !== null && ensuredId !== undefined && source.length > 0) {
    const hasRow = mapped.some(
      (row) => String(row.account_id) === String(ensuredId),
    );

    if (!hasRow) {
      mapped.push(
        buildRow({
          fiscalYear,
          start,
          allowZero: true,
          row: {
            account_id: ensuredId,
            account_name: ensureAccount.name || null,
            currency:
              ensureAccount.currency || mapped[0]?.currency || 'AFN',
            opening_balance: 0,
          },
        }),
      );
    }
  }

  return mapped;
}

export default {
  toDateOnly,
  toOpeningBalanceRows,
};
