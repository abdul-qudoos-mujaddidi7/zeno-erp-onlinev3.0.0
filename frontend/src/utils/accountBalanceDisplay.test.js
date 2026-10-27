import { describe, expect, it } from 'vitest';
import { formatBalance } from './accountBalanceDisplay.js';

describe('formatBalance', () => {
  it('formats non-party balances with a typographic minus and currency symbols', () => {
    expect(formatBalance({
      account_type_id: 1,
      computedBalances: { AFN: -896747, USD: 1250 },
    })).toEqual([
      {
        label: '',
        labelColor: 'var(--danger-text, #b91c1c)',
        amount: '−896,747',
        color: 'var(--ink, #0b1530)',
        symbol: '؋',
      },
      {
        label: '',
        labelColor: 'var(--ok-text, #15803d)',
        amount: '1,250',
        color: 'var(--ink, #0b1530)',
        symbol: '$',
      },
    ]);
  });

  it('labels party balances by direction and omits the sign from amounts', () => {
    expect(formatBalance({
      can_be_customer: 1,
      computedBalances: { AFN: -1100.5, EUR: 7000 },
    }, { debit: 'باقیدار', credit: 'طلبکار' })).toEqual([
      {
        label: 'باقیدار',
        labelColor: 'var(--danger-text, #b91c1c)',
        amount: '1,100.5',
        color: 'var(--danger-text, #b91c1c)',
        symbol: '؋',
      },
      {
        label: 'طلبکار',
        labelColor: 'var(--ok-text, #15803d)',
        amount: '7,000',
        color: 'var(--ok-text, #15803d)',
        symbol: '€',
      },
    ]);
  });

  it('omits zero balances and uses the currency code when no symbol is defined', () => {
    expect(formatBalance({
      account_type_id: 4,
      computedBalances: { AFN: 0, CAD: 12.345 },
    })).toEqual([
      {
        label: 'طلبکار',
        labelColor: 'var(--ok-text, #15803d)',
        amount: '12.35',
        color: 'var(--ok-text, #15803d)',
        symbol: 'CAD',
      },
    ]);
  });
});
