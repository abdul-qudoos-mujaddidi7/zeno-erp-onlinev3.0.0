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
];

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
  isSystemAccountCode,
  systemAccountOrderSql,
  systemAccountFlagSql,
};
