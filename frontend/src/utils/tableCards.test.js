import { describe, expect, it } from 'vitest';
import { columnLabels, labelsForSpans } from './tableCards.js';

/*
 * The phone card layout prints a table cell's column header in front of its
 * value, so a wrong mapping does not look broken — it silently labels the
 * amount as the date and the actions as the status. These tests pin the two
 * halves of that mapping.
 */

describe('columnLabels', () => {
  it('keeps the header text and trims it', () => {
    expect(columnLabels(['  Invoice #  ', 'Total'])).toEqual(['Invoice #', 'Total']);
  });

  it('collapses the whitespace a multi-line header leaves behind', () => {
    expect(columnLabels(['Invoice\n   Date'])).toEqual(['Invoice Date']);
  });

  it('falls back to the column number when a header has no text', () => {
    expect(columnLabels(['Total', '', '   '])).toEqual(['Total', '#2', '#3']);
  });

  it('reads the header text the way a cell does, icons included', () => {
    // A sortable header is `<th>Date <i class="bi …"></i></th>`; the icon
    // contributes no text, so the label must come out as just "Date".
    expect(columnLabels(['Date \u2191'])).toEqual(['Date \u2191']);
    expect(columnLabels([null, undefined])).toEqual(['#1', '#2']);
  });
});

describe('labelsForSpans', () => {
  const labels = ['#', 'Date', 'Customer', 'Total', 'Actions'];

  it('gives every plain cell the header of its own column', () => {
    expect(labelsForSpans(labels, [1, 1, 1, 1, 1])).toEqual(labels);
  });

  it('leaves a spanning cell unlabelled', () => {
    expect(labelsForSpans(labels, [1, 4])).toEqual(['#', '']);
  });

  it('keeps the cells after a spanning cell aligned with their headers', () => {
    // Row: `#` | `Date` spanning two columns | `Total` | `Actions`
    expect(labelsForSpans(labels, [1, 2, 1, 1])).toEqual(['#', '', 'Total', 'Actions']);
  });

  it('treats a missing or unusable colspan as a single column', () => {
    expect(labelsForSpans(labels, [undefined, null, 0, 'x', 1])).toEqual([
      '#',
      'Date',
      'Customer',
      'Total',
      'Actions',
    ]);
  });

  it('stops labelling once the headers run out', () => {
    expect(labelsForSpans(['#'], [1, 1])).toEqual(['#', '']);
  });
});
