/**
 * Phone-friendly tables.
 *
 * A Bootstrap `.table-responsive` table answers a narrow screen by scrolling
 * sideways: the amount, the status and the row actions all sit off-screen and
 * have to be dragged into view. On a phone that is the single most common
 * "the app is not responsive" complaint.
 *
 * This module gives every such table a card layout instead — one label/value
 * line per cell, the label taken from the column header — but *only* when the
 * table really does overflow its container. A three-column table that already
 * fits is left alone, so the change cannot disturb a layout that works.
 *
 * The label is written onto each cell as `data-label` and printed by the CSS in
 * `app.css` (`.table-responsive.table-cards`); `DataTable.svelte` shares the
 * same labelling for its own wrapper.
 */

const MOBILE_QUERY = '(max-width: 767px)';

/** Columns whose header could not be read still need something to print. */
const FALLBACK_LABEL = (index) => `#${index + 1}`;

/** Normalise the header row into one label per column, never an empty one. */
export function columnLabels(headerTexts = []) {
  return headerTexts.map((text, i) => (text || '').replace(/\s+/g, ' ').trim() || FALLBACK_LABEL(i));
}

/**
 * Walk one row and give each cell the label of the column it starts at.
 *
 * A cell that spans several columns has no single column to name, so it gets
 * no label; the walk still advances past every column it covers, which is what
 * keeps the cells after it aligned with their own headers.
 */
export function labelsForSpans(labels = [], spans = []) {
  let index = 0;

  return spans.map((span) => {
    const width = Number(span) > 1 ? Number(span) : 1;
    const label = width > 1 ? '' : labels[index] || '';

    index += width;
    return label;
  });
}

/**
 * Header text without its icon glyphs.
 *
 * A sortable header is `<th>Date <i class="bi bi-arrow-down"></i></th>`; the
 * Bootstrap glyph is an empty element, but a Material Symbols glyph carries its
 * ligature name as text (`swap_vert`), which would otherwise be printed in
 * front of the value on a phone card.
 */
function headerText(th) {
  const clone = th.cloneNode(true);
  clone.querySelectorAll('.ms, .bi').forEach((icon) => icon.remove());
  return clone.textContent;
}

/**
 * Copy each column header onto the matching cell of every row as `data-label`.
 *
 * The headers live in a slot or in hand-written markup, so the rendered
 * `<thead>` is the only reliable source. `textContent` (not `innerText`) is
 * used so a column hidden with `d-none` still contributes its label — its cell
 * is hidden by the very same class. A cell that spans columns (`colspan`) has
 * no single column to name, so its label is removed and the CSS prints the row
 * as a plain line.
 */
export function labelTableRows(table) {
  if (!table) return;

  const labels = columnLabels([...table.querySelectorAll('thead th')].map(headerText));
  if (!labels.length) return;

  table.querySelectorAll('tbody tr').forEach((row) => {
    const cells = [...row.children].filter((cell) => cell.tagName === 'TD');
    const rowLabels = labelsForSpans(
      labels,
      cells.map((cell) => cell.getAttribute('colspan') || 1),
    );

    cells.forEach((cell, i) => {
      if (rowLabels[i]) cell.setAttribute('data-label', rowLabels[i]);
      else cell.removeAttribute('data-label');
    });
  });
}

/**
 * Turn a `.table-responsive` wrapper into cards when its table is wider than
 * the space it was given. The class is cleared before measuring so a table that
 * is already showing as cards is measured against its natural table layout, not
 * against the card layout it is currently wearing.
 */
function refreshWrapper(wrap, mobile) {
  const table = wrap.querySelector('table');

  if (!table) {
    wrap.classList.remove('table-cards');
    return;
  }

  if (!mobile || wrap.getAttribute('data-table-cards') === 'off') {
    wrap.classList.remove('table-cards');
    return;
  }

  labelTableRows(table);

  wrap.classList.remove('table-cards');
  if (table.scrollWidth - wrap.clientWidth > 4) wrap.classList.add('table-cards');
}

/** Re-evaluate every table that is not already handled by `DataTable`. */
export function refreshTableCards(root = document) {
  const mobile = window.matchMedia(MOBILE_QUERY).matches;

  root.querySelectorAll('.table-responsive').forEach((wrap) => {
    // DataTable owns its own wrapper and labels.
    if (wrap.closest('.data-table-wrap')) return;
    refreshWrapper(wrap, mobile);
  });
}

/**
 * Keep the tables in step with the app: rows are re-rendered on sort, filter
 * and paging, and the phone can be rotated at any time. Work is deferred to the
 * next animation frame so a burst of DOM changes costs one pass.
 */
export function installTableCards() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refreshTableCards();
    });
  };

  schedule();

  const observer = new MutationObserver(schedule);
  // Only structure and text are watched; `data-label` is an attribute, so
  // writing it cannot feed the observer.
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  /*
   * A pane that was hidden at load — a tab, a collapsed panel, a modal — shows
   * up without any DOM insertion, so the observer above would never see it.
   * Interaction is what reveals those, and classes are deliberately *not*
   * observed: the card class this module writes is an attribute change, and
   * watching it would make the refresh loop forever.
   */
  const onInteract = () => schedule();
  document.addEventListener('click', onInteract, true);
  document.addEventListener('focusin', onInteract, true);

  window.addEventListener('resize', schedule);
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener?.('change', schedule);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener('click', onInteract, true);
    document.removeEventListener('focusin', onInteract, true);
    window.removeEventListener('resize', schedule);
    media.removeEventListener?.('change', schedule);
  };
}
