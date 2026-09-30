/**
 * Account-type codes that carry behaviour.
 *
 * `account_types.code` is the stable, machine-readable name of a type; the
 * visible `name` is translated and organizations may rename it. A capability
 * is therefore always decided by the code, never by the name.
 *
 * VISITOR is the newest one: a visitor is not a customer and not a supplier.
 * It is a person or entity that brings a sale and receives an agreed
 * percentage of that sale's benefit, posted to their own account.
 */
const VISITOR_ACCOUNT_TYPE_CODE = 'VISITOR';

function normalizeAccountTypeCode(code) {
  if (code === null || code === undefined) {
    return '';
  }

  return String(code).trim().toUpperCase();
}

function isVisitorAccountType(accountType) {
  return (
    normalizeAccountTypeCode(accountType?.code) === VISITOR_ACCOUNT_TYPE_CODE
  );
}

module.exports = {
  VISITOR_ACCOUNT_TYPE_CODE,
  normalizeAccountTypeCode,
  isVisitorAccountType,
};
