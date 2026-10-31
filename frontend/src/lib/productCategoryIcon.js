/*
 * Product-row glyphs, ported from the products reference sheet
 * (`Products.html`).
 *
 * The sheet gives each of its six dosage forms one Material Symbols glyph and
 * one accent colour (`CATS` / `CATC`), then prints that glyph filled inside a
 * small tile whose background is the accent at 13% (`prTile`).
 *
 * A catalogue here spells its categories its own way — the seeded codes
 * (`TAB`, `SYR`, …), the sheet's labels in both scripts, or the short names
 * operators type (`TAB`, `SYP`, `Pomad`, `Vial`). Each of those is the same
 * dosage form the sheet drew, so they resolve to the same glyph and accent.
 *
 * Anything outside those families (a general shop's «خوراکه», an unmapped
 * form such as an inhaler) keeps the sheet's own fallback accent — it resolves
 * `CATC[cat] || '#2F6FED'` — paired with the products glyph the sheet uses in
 * its sidebar.
 */

const ACCENTS = {
  brand: '#2F6FED',
  teal: '#0E9F8E',
  violet: '#7C5CE0',
  amber: '#D9822B',
  rose: '#D64560',
  cyan: '#0891B2',
};

/*
 * One entry per dosage form in the sheet. `codes` are matched against the
 * category's code, `terms` against its name:
 *
 *   - a name that equals the term always matches, so the sheet's own
 *     abbreviations (`tab`, `cap`, `syp`) work as category names;
 *   - a longer term (four letters or more, or any Dari word) also matches
 *     inside the name, so "Tablet (تبلیت)" and "Cream (کریم)" still land.
 *
 * Short Latin terms are deliberately exact-only: `tab` must not be found
 * inside an unrelated word.
 */
export const CATEGORY_VISUALS = [
  {
    icon: 'water_drop',
    color: ACCENTS.brand,
    codes: ['SYR', 'SYP', 'LIQ', 'SOL', 'SUSP'],
    terms: [
      'syr',
      'syp',
      'liq',
      'sol',
      'susp',
      'syrup',
      'liquid',
      'solution',
      'suspension',
      'شربت',
      'مایع',
      'محلول',
      'سوسپانسیون',
    ],
  },
  {
    icon: 'healing',
    color: ACCENTS.teal,
    codes: ['OIN', 'CRE', 'GEL', 'LOT', 'PAT'],
    terms: [
      'oin',
      'ointment',
      'cream',
      'gel',
      'lotion',
      'patch',
      'pomad',
      'پماد',
      'پوماد',
      'کریم',
      'ژل',
      'لوسیون',
      'چسب پوستی',
    ],
  },
  {
    icon: 'pill',
    color: ACCENTS.violet,
    codes: ['TAB'],
    terms: ['tab', 'tablet', 'تابلیت', 'تبلیت', 'قرص'],
  },
  {
    icon: 'medication',
    color: ACCENTS.amber,
    codes: ['CAP'],
    terms: ['cap', 'capsule', 'کپسول'],
  },
  {
    icon: 'vaccines',
    color: ACCENTS.rose,
    codes: ['INJ', 'VIAL', 'AMPOL', 'AMP', 'INF'],
    terms: [
      'inj',
      'injection',
      'injectable',
      'vial',
      'ampoule',
      'ampule',
      'ampol',
      'amp',
      'inf',
      'infusion',
      'تزریق',
      'پیچکاری',
      'آمپول',
      'امپول',
      'ویال',
      'انفیوژن',
    ],
  },
  {
    icon: 'colorize',
    color: ACCENTS.cyan,
    codes: ['DRP', 'DROP'],
    terms: ['drp', 'drop', 'drops', 'قطره'],
  },
];

export const CATEGORY_VISUAL_FALLBACK = { icon: 'inventory_2', color: ACCENTS.brand };

const DARI = /[\u0600-\u06FF]/;

function matchesName(term, name) {
  if (name === term) return true;
  /* Only words long enough not to hide inside another word may match loose. */
  return (term.length >= 4 || DARI.test(term)) && name.includes(term);
}

export function categoryVisual(category) {
  const code = String(category?.code ?? '')
    .trim()
    .toUpperCase();
  const name = String(category?.name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .trim();

  const match = CATEGORY_VISUALS.find(
    (entry) =>
      entry.codes.includes(code) || entry.terms.some((term) => matchesName(term, name)),
  );

  return match
    ? { icon: match.icon, color: match.color }
    : { ...CATEGORY_VISUAL_FALLBACK };
}
