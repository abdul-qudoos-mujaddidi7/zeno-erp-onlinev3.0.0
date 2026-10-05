import { describe, expect, it } from 'vitest';
import { balanceStatus } from './balanceStatus.js';

describe('customer balance status', () => {
  it('labels negative balances as owing and positive balances as credit', () => {
    expect(balanceStatus(-3240)).toBe('Debit');
    expect(balanceStatus('3240')).toBe('Credit');
    expect(balanceStatus('-0.5')).toBe('Debit');
  });

  it('leaves zero and unavailable balances unlabeled', () => {
    for (const amount of [0, -0, '0', null, undefined, NaN, Infinity, 'invalid']) {
      expect(balanceStatus(amount)).toBe('');
    }
  });
});
