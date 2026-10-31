import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the collapsed payment rows in the journal day book.
 *
 * A bill payment posts TWO vouchers — `customer ↔ treasury` and the internal
 * `SALES ↔ RECEIVABLE` settlement — so the list used to show the same sale bill
 * twice, with the same amount and timestamp. The day book now asks the API to
 * drop the settlement leg (`exclude_report_accounts`), which also keeps the
 * server summary, the row count and the export in step with the visible rows.
 *
 * The remaining row is the payment's own voucher, and the dialog totals it
 * ONCE: an 8,160 payment must read `Dr treasury 8,160 / Cr customer 8,160`,
 * never 16,320. Stacking both vouchers into the dialog did exactly that, so the
 * lines are read from the row alone.
 *
 * These tests read the component's own source: they are a wiring guard, not a
 * substitute for the (impossible here) browser test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT = readFileSync(join(HERE, 'JournalsIndex.svelte'), 'utf8');

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

describe('journal list collapses a payment into one row', () => {
  it('asks the API to drop the internal settlement voucher', () => {
    /* The list and the cancelled-count read the same visible set; the toolbar
       no longer offers an export sweep of its own. */
    expect(countMatches(COMPONENT, /exclude_report_accounts: accountScopedView\(\) \? 0 : 1/g)).toBe(2);
  });

  it('asks the API to drop the invoice rows that only move a control account', () => {
    expect(countMatches(COMPONENT, /exclude_control_accounts: accountScopedView\(\) \? 0 : 1/g)).toBe(2);
  });

  it('keeps both legs for an account-scoped ledger', () => {
    expect(COMPONENT).toMatch(/function accountScopedView\(\)/);
    expect(COMPONENT).toMatch(/return Boolean\(account_id\) \|\| filterAccount !== 'all'/);
  });

  it('reloads the cancelled count with the same rule as the list', () => {
    const loader = COMPONENT.slice(
      COMPONENT.indexOf('async function loadCancelledCount'),
      COMPONENT.indexOf('async function loadCancelledCount') + 900,
    );

    expect(loader).toMatch(/exclude_report_accounts: accountScopedView\(\) \? 0 : 1/);
  });
});

describe('payment voucher dialog totals the payment once', () => {
  it('reads the lines of the row itself', () => {
    expect(COMPONENT).toMatch(/function journalView\(j\) \{/);
    expect(COMPONENT).toMatch(/const lines = journalLines\(j\);/);
  });

  it('never pulls the sibling settlement voucher into the dialog', () => {
    expect(COMPONENT).not.toMatch(/loadPaymentLegs/);
    expect(COMPONENT).not.toMatch(/flatMap\(\(leg/);
  });

  it('totals debit and credit from the single voucher', () => {
    expect(COMPONENT).toMatch(/const totalDr = lines\.reduce\(\(sum, line\) => sum \+ \(line\.dr \|\| 0\), 0\);/);
    expect(COMPONENT).toMatch(/const totalCr = lines\.reduce\(\(sum, line\) => sum \+ \(line\.cr \|\| 0\), 0\);/);
    expect(COMPONENT).toMatch(/\$: viewData = viewedJournal \? journalView\(viewedJournal\) : null;/);
  });
});

describe('control accounts stay out of the day book', () => {
  it('knows the two accounts the postings use internally', () => {
    expect(COMPONENT).toMatch(/const HIDDEN_ACCOUNT_CODES = \['RECEIVABLE', 'PAYABLE'\];/);
  });

  it('drops the control side of a row, not every row', () => {
    expect(COMPONENT).toMatch(/drId: hideDr && !hideBoth \? null : drId,/);
    expect(COMPONENT).toMatch(/crId: hideCr && !hideBoth \? null : crId,/);
  });

  it('renders a party line only when the row has one', () => {
    expect(COMPONENT).toMatch(/\{#if info\.drId\}/);
    expect(COMPONENT).toMatch(/\{#if info\.crId\}/);
  });

  it('keeps the account visible in its own ledger', () => {
    expect(COMPONENT).toMatch(/if \(account_id\) return false;/);
  });

  it('names each side from the leg carrying the amount, return or not', () => {
    expect(COMPONENT).toMatch(/const drId = fDr !== 0 \? j\.first_entry_account : j\.second_entry_account;/);
    expect(COMPONENT).toMatch(/const crId = fCr !== 0 \? j\.first_entry_account : j\.second_entry_account;/);
  });
});
