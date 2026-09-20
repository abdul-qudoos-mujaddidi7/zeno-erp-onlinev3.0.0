import { t } from '../i18n/i18n.js';

/*
 * The fiscal-year summary returns its explanatory notes as finished English
 * sentences from the API, so they never pass through t() — every label around
 * them was translated while the notes themselves stayed English on screen.
 *
 * Rather than inventing a second translation mechanism (or changing the API
 * response shape), each note the backend can emit is recognised by a stable
 * fragment and rendered through the normal dictionary. A note the dictionary
 * does not recognise is shown exactly as the API sent it, never hidden.
 *
 * `fiscal-year-i18n.test.js` asserts that every fragment below still exists in
 * `backend/services/fiscal-year.service.js` and has a Dari entry, so rewording
 * a note in the backend fails a test instead of silently regressing to English.
 */
export const FISCAL_NOTES = [
  {
    match: 'read-time classification by accounting date',
    key: 'fiscal-note.read-time-classification',
  },
  {
    match: 'Revenue-type categories count confirmed documents',
    key: 'fiscal-note.confirmed-documents-only',
  },
  {
    match: 'No closing entries, retained earnings or carry-forward rows',
    key: 'fiscal-note.no-closing-entries-here',
  },
  {
    match: 'Opening-balance journals carry the date they were created',
    key: 'fiscal-note.opening-journal-date',
  },
  {
    match: 'Physical inventory is continuous across fiscal years',
    key: 'fiscal-note.inventory-continuous',
  },
];

/** Key used for a backend note, or `null` when the note is not recognised. */
export function fiscalNoteKey(note) {
  const text = String(note ?? '');

  return FISCAL_NOTES.find((entry) => text.includes(entry.match))?.key || null;
}

/** Localized note text; falls back to the API's own wording when unknown. */
export function translateFiscalNote(note) {
  const key = fiscalNoteKey(note);

  return key ? t(key) : String(note ?? '');
}

/** Localized list of notes, skipping blanks the API may send. */
export function translateFiscalNotes(notes) {
  return (Array.isArray(notes) ? notes : [])
    .map((note) => String(note ?? '').trim())
    .filter((note) => note.length > 0)
    .map((note) => translateFiscalNote(note));
}
