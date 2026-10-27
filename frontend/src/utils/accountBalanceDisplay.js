const CURRENCY_SYMBOLS = {
  AFN: '؋',
  USD: '$',
  PKR: 'Rs',
  EUR: '€',
};

export function isPartyBalanceAccount(account, accountTypes = []) {
  const accountTypeId = Number(account?.account_type_id);
  const accountType = accountTypes.find((type) => Number(type.id) === accountTypeId);
  const typeCode = String(accountType?.code || '').toUpperCase();

  return (
    Number(account?.can_be_customer) === 1 ||
    Number(account?.can_be_supplier) === 1 ||
    Number(accountType?.can_be_customer) === 1 ||
    Number(accountType?.can_be_supplier) === 1 ||
    [3, 4, 8, 9].includes(accountTypeId) ||
    ['EMPLOYEE', 'VISITOR'].includes(typeCode)
  );
}

const formatNumber = (value) =>
  Math.abs(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });

export function formatBalance(account, options = {}) {
  const { labels = {}, accountTypes = [] } = options;
  const party = isPartyBalanceAccount(account, accountTypes);
  const debitLabel = labels.debit || 'باقیدار';
  const creditLabel = labels.credit || 'طلبکار';

  return Object.entries(account?.computedBalances || {})
    .map(([currency, rawBalance]) => {
      const balance = Number(rawBalance) || 0;
      if (balance === 0) return null;

      const negative = balance < 0;
      const label = party ? (negative ? debitLabel : creditLabel) : '';

      return {
        label,
        labelColor: negative ? 'var(--danger-text, #b91c1c)' : 'var(--ok-text, #15803d)',
        amount: `${!party && negative ? '−' : ''}${formatNumber(balance)}`,
        color: party
          ? negative
            ? 'var(--danger-text, #b91c1c)'
            : 'var(--ok-text, #15803d)'
          : 'var(--ink, #0b1530)',
        symbol: CURRENCY_SYMBOLS[String(currency).toUpperCase()] || String(currency),
      };
    })
    .filter(Boolean);
}

export function formatBalanceNumber(value) {
  return formatNumber(Number(value) || 0);
}
