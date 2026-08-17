export const SYSTEM_ACCOUNT_CODES = [
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

export function isSystemAccount(account) {
  if (!account) return false;

  if (
    account.is_system != null &&
    account.is_system !== ''
  ) {
    return (
      Number(account.is_system) === 1 ||
      account.is_system === true ||
      account.is_system === 'true'
    );
  }

  return SYSTEM_ACCOUNT_CODES.includes(
    String(account.code || '').trim().toUpperCase(),
  );
}

export function isDefaultSystemDescription(description) {
  return /^\s*Default\s+/i.test(String(description || ''));
}
