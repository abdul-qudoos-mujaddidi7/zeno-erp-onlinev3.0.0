/*
 * Searchable filter dropdowns.
 *
 * Every filter toolbar in this application renders its dropdowns through
 * `components/common/FilterSelect.svelte`, and a handful of report pages still
 * carry their own checkbox dropdowns (account types, account groups, patient
 * types). Those lists grow with real data — customers, products, accounts,
 * warehouses — so an operator must be able to TYPE the value instead of
 * scrolling a 300-row menu.
 *
 * Rules kept here (pure functions, no I/O — unit tested without a browser):
 *
 * - Matching is text-only, case-insensitive, and folds the Persian/Arabic
 *   letter variants an operator may type (`ي` vs `ی`, `ك` vs `ک`, `ة` vs `ه`),
 *   plus diacritics, tatweel and the ZWNJ that Dari text is full of. Searching
 *   `ميوه` therefore finds `میوه`, and a ZWNJ can never hide a match.
 * - The "all"/empty entries are CONTROLS (clear the filter), not data. They are
 *   pinned above the results so a search can never strand the operator without
 *   the reset entry.
 * - Searching never reorders the data when the query is empty: the menu looks
 *   exactly as it did before a query was typed.
 */

/** `all` and `''` are the sentinel values this app uses for "no filter". */
export const RESET_VALUES = ['all', ''];

/** Lists shorter than this do not get a search box on `searchable="auto"`. */
export const SEARCH_MIN_OPTIONS = 5;

const SEARCH_FOLD = [
  [/[\u200c\u200e\u200f]/g, ''], // ZWNJ, LRM, RLM
  [/[\u064b-\u065f\u0670\u0640]/g, ''], // Arabic diacritics + tatweel
  [/[أإآٱ]/g, 'ا'],
  [/[يىئ]/g, 'ی'],
  [/ك/g, 'ک'],
  [/[ةۀہ]/g, 'ه'],
  [/ؤ/g, 'و'],
];

/** Lower-cased, letter-folded search text. */
export function foldFilterText(input) {
  let text = String(input ?? '').toLowerCase();

  for (const [pattern, replacement] of SEARCH_FOLD) {
    text = text.replace(pattern, replacement);
  }

  return text.trim();
}

/** `true` for the "all"/empty reset entries that stay pinned at the top. */
export function isResetOption(option) {
  return RESET_VALUES.includes(String(option?.value));
}

/**
 * Whether a dropdown should render a search box.
 *
 * `auto` (the default) only adds one to lists long enough to be worth
 * searching, so a three-option status filter keeps its current compact look.
 */
export function shouldShowFilterSearch(options = [], searchable = 'auto') {
  if (searchable === false) {
    return false;
  }

  if (searchable === true) {
    return true;
  }

  return options.length >= SEARCH_MIN_OPTIONS;
}

/** `true` when a label matches the (possibly empty) query. Used by the checkbox dropdowns that filter their own list. */
export function matchesFilterText(label, query) {
  const queryText = foldFilterText(query);

  if (!queryText) {
    return true;
  }

  return foldFilterText(label).includes(queryText);
}

/**
 * The next highlighted row for an ArrowUp/ArrowDown press inside the search
 * box. Navigation starts on the first MATCH (not on the pinned `All` row), so
 * one ArrowDown + Enter after typing picks what was searched for.
 */
export function resolveKeyboardIndex({
  direction = 1,
  visibleOptions = [],
  queryText = '',
  pinnedOptions = [],
  activeIndex = -1,
} = {}) {
  const total = visibleOptions.length;

  if (!total) {
    return -1;
  }

  if (activeIndex < 0) {
    const firstMatch = queryText ? pinnedOptions.length : 0;
    return (direction === 1 ? firstMatch : total - 1) % total;
  }

  return (activeIndex + direction + total) % total;
}

/**
 * Which option an Enter press selects. With no row highlighted it takes the
 * first match, never the pinned `All` row: pressing Enter after typing must
 * apply the thing that was searched for, not silently clear the filter.
 */
export function resolveKeyboardSelection({
  visibleOptions = [],
  matchedOptions = [],
  queryText = '',
  activeIndex = -1,
} = {}) {
  if (activeIndex >= 0) {
    return visibleOptions[activeIndex];
  }

  return queryText ? matchedOptions[0] : undefined;
}

/**
 * Split an option list into what the menu should render for a query.
 *
 * Returns the pinned reset entries, the matching data entries and the final
 * `visibleOptions` (pinned first, then matches). An empty query returns the
 * original array untouched, so nothing moves unless the operator searches.
 */
export function filterSelectOptions(options = [], query = '') {
  const queryText = foldFilterText(query);
  const pinnedOptions = options.filter(isResetOption);
  const dataOptions = options.filter((option) => !isResetOption(option));
  const matchedOptions = queryText
    ? dataOptions.filter((option) => foldFilterText(option?.label).includes(queryText))
    : dataOptions;

  return {
    queryText,
    pinnedOptions,
    matchedOptions,
    visibleOptions: queryText ? [...pinnedOptions, ...matchedOptions] : options,
  };
}
