import { beforeAll, describe, expect, it } from 'vitest';

/*
 * The notes are English sentences produced by the backend summary, so they are
 * translated by a small fragment → key map instead of being hard-coded in the
 * dictionary as whole sentences.
 *
 * i18n reads the language from localStorage at module load, which does not
 * exist in this node test environment, so the store is stubbed before the
 * import.
 */

let translateFiscalNote;
let fiscalNoteKey;
let translations;

beforeAll(async () => {
  globalThis.localStorage = {
    store: { lang: 'fa' },
    getItem(key) {
      return this.store[key] ?? null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
  };

  ({ translateFiscalNote, fiscalNoteKey } = await import('./fiscalNotes.js'));
  translations = (await import('../i18n/translations.json', { with: { type: 'json' } })).default;
});

const READ_TIME_NOTE =
  'This is a read-time classification by accounting date. No fiscal_year_id is stamped on historical (or new) documents.';

describe('fiscal summary notes', () => {
  it('maps a known backend note to its Dari text', () => {
    expect(fiscalNoteKey(READ_TIME_NOTE)).toBe('fiscal-note.read-time-classification');

    const translated = translateFiscalNote(READ_TIME_NOTE);

    expect(translated).toBe(translations.fa['fiscal-note.read-time-classification']);
    expect(translated).not.toContain('read-time classification');
  });

  it('translates every note the close preview can show', () => {
    const notes = [
      "Revenue-type categories count confirmed documents only; draft documents are not fiscal-year events yet.",
      'No closing entries, retained earnings or carry-forward rows are produced here. Customer and supplier balances are not reset.',
      'Opening-balance journals carry the date they were created, not a user-entered accounting date, so they can fall into a different fiscal year than the year they describe.',
      'Physical inventory is continuous across fiscal years.',
    ];

    for (const note of notes) {
      expect(fiscalNoteKey(note)).toBeTruthy();
      expect(translateFiscalNote(note)).not.toBe(note);
    }
  });

  it('matches a note whose backend source is split across lines', () => {
    expect(fiscalNoteKey('Physical inventory is continuous across fiscal years. No stock quantity, batch or stock transaction is reset.')).toBe(
      'fiscal-note.inventory-continuous',
    );
  });

  it('shows an unknown note exactly as the API sent it', () => {
    const unknown = 'A note this build has never heard of.';

    expect(fiscalNoteKey(unknown)).toBeNull();
    expect(translateFiscalNote(unknown)).toBe(unknown);
  });

  it('never turns a missing note into another note', () => {
    expect(translateFiscalNote(null)).toBe('');
    expect(translateFiscalNote(undefined)).toBe('');
    expect(translateFiscalNote('')).toBe('');
  });
});
