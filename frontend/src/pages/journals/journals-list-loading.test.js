import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for how the journal list loads.
 *
 * The sheet used to strand itself on its spinner: the boot reads ran one after
 * another and any of them could reject before the list request was made, a
 * failed or stalled list request was never retried, and `loading` was only
 * cleared on the happy path. The page then looked empty until it was reloaded
 * several times.
 *
 * These tests read the component's own source — they are a wiring guard, not a
 * substitute for a browser test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT = readFileSync(join(HERE, 'JournalsIndex.svelte'), 'utf8');

describe('journal list loading', () => {
  it('starts reference lookups without blocking the first journal read', () => {
    expect(COMPONENT).toMatch(/void loadAccounts\(\)\.catch/);
    expect(COMPONENT).toMatch(/void loadCurrencies\(\)\.catch/);
    expect(COMPONENT).toMatch(/void loadFiscalYears\(\)/);
    expect(COMPONENT).toMatch(/const fiscalYearScope = await applyCurrentFiscalYearRange/);
  });

  it('loads KPI summary separately from the visible journal rows', () => {
    const listParams = COMPONENT.match(/const params = \{([\s\S]*?)\n    \};/)[1];
    expect(listParams).not.toMatch(/include_summary:\s*1/);
    expect(COMPONENT).toMatch(/include_summary:\s*1,\s*summary_only:\s*1/);
    expect(COMPONENT).toMatch(/void loadJournalSummary\(summaryParams, summaryKey\)/);
  });

  it('gives a slow list request a ceiling', () => {
    expect(COMPONENT).toMatch(/const LIST_TIMEOUT_MS = \d+;/);
    expect(COMPONENT).toMatch(/setTimeout\(\(\) => reject\(/);
  });

  it('retries the list once before giving up', () => {
    expect(COMPONENT).toMatch(
      /journalResponse = await readJournals\(params\);\s*\}\s*catch \(error\) \{\s*[\s\S]*?\n\s*journalResponse = await readJournals\(params\);/,
    );
  });

  it('loads counterparty names without holding the sheet open', () => {
    expect(COMPONENT).toMatch(/void ensurePeerAccounts\(journals\)\.catch/);
  });

  it('always releases the spinner', () => {
    expect(COMPONENT).toMatch(
      /\}\s*finally \{\s*[\s\S]*?if \(requestId === loadRequestId\) loading = false;/,
    );
    /* The happy path no longer clears `loading` early: there is one exit. */
    expect(COMPONENT).toMatch(/loading = false;/g);
    expect(COMPONENT.match(/loading = false;/g)).toHaveLength(1);
  });

  it('still reads the list exactly once when the page opens', () => {
    expect(COMPONENT).toMatch(/await loadJournals\(\);\s*\}\);/);
  });
});
