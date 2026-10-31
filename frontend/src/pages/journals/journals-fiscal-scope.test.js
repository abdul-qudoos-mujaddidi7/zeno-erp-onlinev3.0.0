import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the journal list's fiscal-year scope.
 *
 * The list must open INSIDE one fiscal year (the working one), let the user
 * switch to another year — a closed year's history stays readable — and send the
 * chosen year's [start_date, end_date] to the API. If any of that is dropped the
 * list silently goes back to showing every year at once, which is exactly what
 * the closed-year work is meant to stop.
 *
 * These tests read the component's own source: they are a wiring guard, not a
 * substitute for the (impossible here) browser test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT = readFileSync(join(HERE, 'JournalsIndex.svelte'), 'utf8');

describe('journal list fiscal-year scope', () => {
  it('defaults to the working fiscal year', () => {
    expect(COMPONENT).toMatch(/applyCurrentFiscalYearRange\(/);
    expect(COMPONENT).toMatch(
      /const fiscalYearScope = await applyCurrentFiscalYearRange\(/,
    );
    expect(COMPONENT).toMatch(/workingFiscalYear = fiscalYearScope;/);
    expect(COMPONENT).toMatch(
      /workingFiscalYear = fiscalYearScope;[\s\S]*?await loadJournals\(\);/,
    );
  });

  it('sends the selected year as a date window to the API', () => {
    expect(COMPONENT).toMatch(/date_from: startDate \|\| undefined/);
    expect(COMPONENT).toMatch(/date_to: endDate \|\| undefined/);
  });

  it('offers a fiscal-year selector with every year plus "All"', () => {
    expect(COMPONENT).toMatch(/key: 'fiscal_year'/);
    expect(COMPONENT).toMatch(/value: 'all', label: t\('All'\)/);
    expect(COMPONENT).toMatch(/\.\.\.fiscalYears\.map\(/);
  });

  it('maps a chosen year to its range and "All" back to no window', () => {
    expect(COMPONENT).toMatch(/function applyFiscalYearFilter\(value\)/);
    expect(COMPONENT).toMatch(/fiscalYearRangeOf\(year\)/);
    expect(COMPONENT).toMatch(/startDate = range\?\.from \|\| ''/);
    expect(COMPONENT).toMatch(/endDate = range\?\.to \|\| ''/);
  });

  it('reloads the list when the year changes', () => {
    expect(COMPONENT).toMatch(
      /if \(event\.detail\.key === 'fiscal_year'\) applyFiscalYearFilter/,
    );
  });

  it('clearing the filters goes back to the working year, and reloads', () => {
    expect(COMPONENT).toMatch(
      /applyFiscalYearFilter\(workingFiscalYear\?\.id \?\? 'all'\)/,
    );
    expect(COMPONENT).toMatch(
      /applyFiscalYearFilter\(workingFiscalYear\?\.id \?\? 'all'\);\s*\n\s*currentPage = 1;\s*\n\s*loadJournals\(\);/,
    );
  });

  it('keeps the unscoped behaviour when no fiscal year exists', () => {
    /* An empty year list means no range is ever applied: the previous
       lifetime behaviour is preserved. */
    expect(COMPONENT).toMatch(/fiscalYears = \[\]/);
    expect(COMPONENT).toMatch(/workingFiscalYear\?\.id/);
  });
});
