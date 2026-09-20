import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Localization guard for the fiscal-year screens.
 *
 * Every label on those screens is written as `t('…')`, so a key that is missing
 * from the Dari block is not an error — it silently falls back to the English
 * key and the page reads half-English, half-Dari. That is exactly what happened
 * to the whole fiscal-year feature after it was added.
 *
 * These tests fail if a new string is introduced without a Dari translation, or
 * if a Dari entry is left as a copy of its English key (an untranslated
 * placeholder that looks translated in the JSON but not on screen).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = [
  join(HERE, '..', 'FiscalYears.svelte'),
  join(HERE, 'FiscalYearHistory.svelte'),
];

const translations = JSON.parse(
  readFileSync(join(HERE, '..', '..', 'i18n', 'translations.json'), 'utf8'),
);

/* Keys whose Dari text is legitimately the same as the key. */
const IDENTICAL_ALLOWED = new Set(['-']);

/*
 * Escape-aware: a label containing an apostrophe is written `t('… year\'s …')`,
 * so a naive /t\('([^']*)'\)/ stops at the backslash, fails to match the call at
 * all, and the key is never checked. That is how the long close warning stayed
 * English on screen while these tests passed.
 */
const KEY_PATTERN = /t\('((?:\\.|[^'\\])*)'\)/g;

const unescapeKey = (key) =>
  key.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');

function keysUsedBy(files) {
  const keys = new Set();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(KEY_PATTERN)) {
      keys.add(unescapeKey(match[1]));
    }
  }

  return [...keys];
}

/** Number of `t('` call sites in the files, used to prove none were skipped. */
function callSiteCount(files) {
  return files.reduce((total, file) => {
    const source = readFileSync(file, 'utf8');
    return total + [...source.matchAll(/t\('/g)].length;
  }, 0);
}

function rawMatchCount(files) {
  return files.reduce((total, file) => {
    const source = readFileSync(file, 'utf8');
    return total + [...source.matchAll(KEY_PATTERN)].length;
  }, 0);
}

const KEYS = keysUsedBy(FILES);

/*
 * Labels that are not `t()` call sites: config objects (the history modal's tab
 * list) are read at module load, so their labels are plain strings and were
 * invisible to the key sweep — 'Opening balances' and 'Account statement' stayed
 * English on screen while every other tab was translated.
 */
function configLabelsUsedBy(files) {
  const labels = new Set();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(/\blabel:\s*'([A-Za-z][^']*)'/g)) {
      labels.add(match[1]);
    }
  }

  return [...labels];
}

const CONFIG_LABELS = configLabelsUsedBy(FILES);

const BACKEND_SERVICE = join(
  HERE,
  '..',
  '..',
  '..',
  '..',
  'backend',
  'services',
  'fiscal-year.service.js',
);

const NOTES_SOURCE = readFileSync(join(HERE, '..', '..', 'utils', 'fiscalNotes.js'), 'utf8');

const NOTE_FRAGMENTS = [...NOTES_SOURCE.matchAll(/match:\s*'([^']+)'/g)].map((m) => m[1]);

const PAGES_RENDERING_NOTES = [
  join(HERE, '..', 'FiscalYears.svelte'),
  join(HERE, 'FiscalYearHistory.svelte'),
];

describe('fiscal-year screens are translated in Dari', () => {
  it('uses a real string key on every label', () => {
    expect(KEYS.length).toBeGreaterThan(100);
  });

  it('parses every t() call site, including labels with an apostrophe', () => {
    expect(rawMatchCount(FILES)).toBe(callSiteCount(FILES));
  });

  it('checks labels that contain an apostrophe', () => {
    expect(KEYS.filter((key) => key.includes("'"))).toContain(
      "Closing is an accounting action. It posts one balanced closing journal per currency that moves this year's profit or loss into Retained Earnings, carries the remaining balance-sheet balances into the next fiscal year as opening balances, and locks the year. It can be undone with Reopen.",
    );
  });

  it('has a Dari entry for every key', () => {
    const missing = KEYS.filter((key) => !(key in translations.fa));

    expect(missing).toEqual([]);
  });

  it('does not leave an English placeholder in the Dari block', () => {
    const untranslated = KEYS.filter(
      (key) =>
        key.length > 2 &&
        !IDENTICAL_ALLOWED.has(key) &&
        translations.fa[key] === key,
    );

    expect(untranslated).toEqual([]);
  });

  it('never translates a key to an empty string', () => {
    const empty = KEYS.filter((key) => !String(translations.fa[key] || '').trim());

    expect(empty).toEqual([]);
  });

  it('keeps currency placeholders and dashes intact', () => {
    expect(translations.fa['-']).toBe('-');
  });

  it('keeps the apostrophes of the English source in the Dari keys', () => {
    const withApostrophe = KEYS.filter((key) => key.includes("'"));

    for (const key of withApostrophe) {
      expect(translations.fa[key]).toBeTruthy();
    }
  });

  it('translates labels that live in config objects, not in t() calls', () => {
    const untranslated = CONFIG_LABELS.filter(
      (label) => !(label in translations.fa) || translations.fa[label] === label,
    );

    expect(CONFIG_LABELS.length).toBeGreaterThan(5);
    expect(untranslated).toEqual([]);
  });
});

describe('fiscal-year summary notes coming from the API are translated', () => {
  it('recognises every note the backend can emit', () => {
    const service = readFileSync(BACKEND_SERVICE, 'utf8');
    const unknown = NOTE_FRAGMENTS.filter((fragment) => !service.includes(fragment));

    expect(NOTE_FRAGMENTS.length).toBeGreaterThan(3);
    expect(unknown).toEqual([]);
  });

  it('has a real Dari entry for every note key', () => {
    const keys = [...NOTES_SOURCE.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);

    expect(keys.length).toBe(NOTE_FRAGMENTS.length);

    for (const key of keys) {
      expect(String(translations.fa[key] || '').trim()).not.toBe('');
      expect(translations.fa[key]).not.toBe(key);
    }
  });

  it('renders the notes through the dictionary on both fiscal-year screens', () => {
    for (const file of PAGES_RENDERING_NOTES) {
      const source = readFileSync(file, 'utf8');

      expect(source).toMatch(/summary\.notes[\s\S]{0,200}translateFiscalNote\(note\)/);
      expect(source).not.toMatch(/<li>\{note\}<\/li>/);
    }
  });
});
