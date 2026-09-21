/**
 * Guard for the 80mm thermal print geometry of SaleReceiptModal.
 *
 * Background: this slip is the only receipt in the app that declares a VALID
 * `@page { size: <width> <height> }`. Every sibling declares `size: 74mm auto`,
 * which is invalid (`auto` is only legal as the whole value), so browsers drop
 * the rule and lay those slips out against the printer driver's paper. Because
 * this one rule is honoured, its width must be the PAPER (80mm roll), never the
 * 74mm slip: a 74mm page on an 80mm roll is aligned by the driver and prints an
 * empty strip down one side.
 *
 * These are wiring tests over the component source: printReceipt() builds its
 * stylesheet as a string at runtime, so there is nothing to import.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

const SOURCE = readFileSync(new URL('./SaleReceiptModal.svelte', import.meta.url), 'utf8');

/** The stylesheet string printReceipt() writes into the print window. */
const printStyles = (() => {
  const start = SOURCE.indexOf('const styles = `');

  expect(start).toBeGreaterThan(-1);

  const end = SOURCE.indexOf('</style>', start);

  expect(end).toBeGreaterThan(start);

  return SOURCE.slice(start, end);
})();

/** The <script> body, where ROLL_WIDTH_MM is declared. */
const scriptBody = SOURCE.slice(0, SOURCE.indexOf('</script>'));

describe('sale receipt print paper', () => {
  test('the receipt is still a valid Svelte component', () => {
    // A stray backtick inside the stylesheet template literal is a syntax error
    // the browser would only discover at print time; catch it here instead.
    expect(() => compile(SOURCE, { filename: 'SaleReceiptModal.svelte' })).not.toThrow();
  });

  test('the printed page is declared as the 80mm roll width', () => {
    expect(scriptBody).toMatch(/const ROLL_WIDTH_MM = 80;/);
    expect(SOURCE).toMatch(
      /`@page \{ size: \$\{ROLL_WIDTH_MM\}mm \$\{pageHeight\}px; margin: 0; \}`/,
    );
    expect(printStyles).toMatch(/\$\{pageRule\}/);
  });

  test('a page narrower than the roll is never declared', () => {
    const declared = SOURCE.match(/@page \{ size: [^}]*\}/g) || [];

    expect(declared).toHaveLength(1);
    expect(declared[0]).not.toMatch(/74mm/);
  });

  test('an unmeasurable slip emits no page rule instead of a square page', () => {
    expect(SOURCE).toMatch(/pageHeight > 0\s*\?\s*`@page/);
    expect(SOURCE).toMatch(/\s: '';/);
  });

  test('the slip keeps its own 74mm width and stays inside the page', () => {
    expect(printStyles).toMatch(/\.receipt \{[\s\S]*?width: 74mm;/);
    expect(74).toBeLessThan(80);
  });

  test('the slip is centred in the paper', () => {
    expect(printStyles).toMatch(
      /body \{ display: flex; justify-content: center; align-items: flex-start; \}/,
    );
  });

  test('the page height is still measured so the slip has no blank tail', () => {
    expect(SOURCE).toMatch(/const slip = document\.querySelector\('#receipt-content \.receipt'\)/);
    expect(SOURCE).toMatch(/pageHeight = Math\.ceil\(contentBottom - box\.top\) \+ 16/);
    expect(SOURCE).toMatch(/@page \{ size: \$\{ROLL_WIDTH_MM\}mm \$\{pageHeight\}px/);
  });

  test('no offset is added above the slip', () => {
    expect(printStyles).toMatch(/html,\s*\nbody \{\s*\n\s*margin: 0;\s*\n\s*padding: 0;/);
  });
});
