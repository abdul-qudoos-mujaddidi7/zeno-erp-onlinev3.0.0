const SYSTEM_ACCOUNT_CODES = [
  'TREASURY',
  'RECEIVABLE',
  'PAYABLE',
  'ASSETS',
  'BENEFITS',
  'EXPENSES',
  'SALES',
  'NOTRACK',
  'WALKIN',
  'PURCHASE',
  'EXCHANGE',
  'RETAINED',
];

/*
 * The four profit-and-loss accounts of THIS application's accounting model.
 *
 * They are identified by code, never by account_type_id: account_type_id is
 * per organization and was found to be inconsistent across organizations, so
 * it cannot be trusted to classify an account. See the Step 4 report.
 *
 *   SALES     revenue (normally credit)
 *   PURCHASE  period cost — purchases are expensed on receipt, there is no
 *             inventory asset / COGS ledger account in this model
 *   EXPENSES  period expense
 *   BENEFITS  exchange gain/loss, debit OR credit depending on the result
 */
const PNL_ACCOUNT_CODES = [
  'SALES',
  'PURCHASE',
  'EXPENSES',
  'BENEFITS',
];

/*
 * Retained business profit. Deliberately a separate account from the owner /
 * shareholder accounts so capital and accumulated profit stay independent,
 * and so the Step 4 close never posts into an owner account.
 */
const RETAINED_ACCOUNT_CODE = 'RETAINED';

function isSystemAccountCode(code) {
  return SYSTEM_ACCOUNT_CODES.includes(
    String(code || '').trim().toUpperCase(),
  );
}

function systemAccountOrderSql(column = 'code') {
  const list = SYSTEM_ACCOUNT_CODES.map((code) => `'${code}'`).join(', ');

  return `
    CASE WHEN ${column} IN (${list}) THEN 0 ELSE 1 END ASC,
    FIELD(${column}, ${list}) ASC
  `;
}

function systemAccountFlagSql(column = 'code') {
  const list = SYSTEM_ACCOUNT_CODES.map((code) => `'${code}'`).join(', ');

  return `
    CASE
      WHEN ${column} IN (${list}) THEN 1
      ELSE 0
    END
  `;
}

module.exports = {
  SYSTEM_ACCOUNT_CODES,
  PNL_ACCOUNT_CODES,
  RETAINED_ACCOUNT_CODE,
  isSystemAccountCode,
  systemAccountOrderSql,
  systemAccountFlagSql,
};
