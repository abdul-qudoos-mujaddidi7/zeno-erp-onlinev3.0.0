/**
 * Visitor report (sales page, ?tab=visitors).
 *
 * These are wiring tests over the component sources, the same way
 * sale-receipt-paper.test.js guards its receipt: the report is a Svelte
 * component reached through a route, so there is nothing to import and mount
 * without a session and a backend. What they protect is the contract the
 * report exists for:
 *
 *   1. It reads the aggregated endpoint, never the raw sales list, so the
 *      figures cover every sale in the range instead of the current page.
 *   2. It shows the benefit, the visitor's share AND what the company kept, so
 *      "10% of 100" can be read as 10 for the visitor and 90 for the company.
 *   3. It is reachable: the sales page renders it for ?tab=visitors and the
 *      top bar links to that tab.
 *   4. It is downloadable: the PDF/Excel export carries the same columns and
 *      the same four figures the screen shows.
 */
import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

vi.mock('../../api/apiClient.js', () => ({
  api: {
    get: vi.fn(async (url) => ({ success: true, data: [], meta: {}, url })),
  },
}));

const { saleApi } = await import('../../api/saleApi.js');
const { api } = await import('../../api/apiClient.js');

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const REPORT_SOURCE = read('./VisitorReport.svelte');
const SALES_SOURCE = read('../Sales.svelte');
const TOPBAR_SOURCE = read('../../components/Topbar.svelte');
const GENERATOR_SOURCE = read('../generatePDF.js');

describe('visitor report component', () => {
  test('it is a valid Svelte component', () => {
    expect(() => compile(REPORT_SOURCE, { filename: 'VisitorReport.svelte' })).not.toThrow();
  });

  test('it reads the aggregated endpoint, not the sales list', () => {
    expect(REPORT_SOURCE).toMatch(/saleApi\.getVisitorReport\(/);
    expect(REPORT_SOURCE).not.toMatch(/saleApi\.getAll\(/);
  });

  test('it sends the active date range, currency and selected products', () => {
    expect(REPORT_SOURCE).toMatch(/date_from: fromDate/);
    expect(REPORT_SOURCE).toMatch(/date_to: toDate/);
    expect(REPORT_SOURCE).toMatch(/currency: selectedCurrency/);
    expect(REPORT_SOURCE).toMatch(/product_ids: selectedProducts/);
    expect(REPORT_SOURCE).toMatch(/multiple: true/);
  });

  test('it offers a visitor-account filter built from the visitor accounts', () => {
    expect(REPORT_SOURCE).toMatch(/lookupAccounts\(\{ role: 'visitor'/);
    expect(REPORT_SOURCE).toMatch(/key: 'visitor'/);
    expect(REPORT_SOURCE).toMatch(/if \(key === 'visitor'\) selectedVisitors =/);
  });

  test('the visitor filter is applied by the endpoint, not by hiding rows locally', () => {
    expect(REPORT_SOURCE).toMatch(/visitor_ids: selectedVisitors/);
    /* visibleRows only narrows the free-text search. */
    expect(REPORT_SOURCE).toMatch(/\$: visibleRows = \(rows \|\| \[\]\)\.filter/);
  });

  test('clearing the filters drops the chosen visitors too', () => {
    const reset = REPORT_SOURCE.match(/function resetReportFilters\(\) \{[\s\S]*?\n  \}/)?.[0] || '';

    expect(reset).toContain('selectedVisitors = [];');
  });

  test('it shows the benefit, the visitor share and the company share', () => {
    expect(REPORT_SOURCE).toMatch(/t\('Benefit'\)/);
    expect(REPORT_SOURCE).toMatch(/t\('Visitor Share'\)/);
    expect(REPORT_SOURCE).toMatch(/t\('Company Share'\)/);
    expect(REPORT_SOURCE).toMatch(/total_share/);
    expect(REPORT_SOURCE).toMatch(/company_share/);
  });

  test('the company share is the benefit minus the visitor share, never a re-derivation', () => {
    /*
     * Both figures come from the report rows (the backend computes the company
     * share from the posted commission). Recomputing 100 - 10 here from the
     * percentage would silently disagree with the ledger.
     */
    expect(REPORT_SOURCE).not.toMatch(/total_benefit\s*-\s*total_share/);
    expect(REPORT_SOURCE).toMatch(/activeTotals\?\.company_share/);
  });

  test('each visitor links to their own account', () => {
    expect(REPORT_SOURCE).toMatch(/\/dashboard\/account\/\$\{row\.visitor_account_id\}/);
  });

  test('it defaults to the working fiscal year like the sales list does', () => {
    expect(REPORT_SOURCE).toMatch(/applyCurrentFiscalYearRange\(/);
  });
});

describe('the visitor filter reaches the endpoint', () => {
  test('the chosen visitor accounts are sent as comma-separated IDs', async () => {
    api.get.mockClear();

    await saleApi.getVisitorReport({
      visitor_ids: ['10995116277761', 22],
      product_ids: [5],
    });

    const [url] = api.get.mock.calls[0];

    expect(url).toContain('/api/v2/sales/visitor-report?');
    expect(url).toContain('visitor_ids=10995116277761%2C22');
    expect(url).toContain('product_ids=5');
  });

  test('an unfiltered report carries no visitor_ids parameter', async () => {
    api.get.mockClear();

    await saleApi.getVisitorReport({});

    expect(api.get.mock.calls[0][0]).not.toContain('visitor_ids');
  });
});

describe('the visitor report is downloadable', () => {
  test('the report offers PDF and Excel download', () => {
    expect(REPORT_SOURCE).toMatch(/<ExportMenu/);
    expect(REPORT_SOURCE).toMatch(/on:export=\{\(event\) => exportReport\(event\.detail\)\}/);
    expect(REPORT_SOURCE).toMatch(/format === 'excel' \? generateExcel : generatePDF/);
    expect(REPORT_SOURCE).toMatch(/'visitor_report',/);
  });

  test('nothing can be downloaded while the report is empty or loading', () => {
    expect(REPORT_SOURCE).toMatch(
      /disabled=\{exportingReport \|\| loading \|\| visibleRows\.length === 0\}/,
    );
  });

  test('the download exports exactly what is on screen', () => {
    expect(REPORT_SOURCE).toMatch(/const items = visibleRows\.map\(decorateRow\)/);
    expect(REPORT_SOURCE).toMatch(/sumByCurrency\(items, 'total_amount'\)/);
  });

  test('the exporter knows the visitor report', () => {
    expect(GENERATOR_SOURCE).toMatch(/visitor_report: t\('Visitor Report'\)/);
    expect(GENERATOR_SOURCE).toMatch(
      /if \(type === 'visitor_report'\) \{\s*\n\s*return buildVisitorReportTable\(/,
    );
  });

  test('the downloaded table keeps the same columns as the screen', () => {
    const start = GENERATOR_SOURCE.indexOf('function buildVisitorReportTable(');

    expect(start).toBeGreaterThan(-1);

    const fn = GENERATOR_SOURCE.slice(start, GENERATOR_SOURCE.indexOf('\n}', start));

    expect(fn).toMatch(
      /'#',\s*t\('Visitor'\),\s*t\('Rate'\),\s*t\('Sales Count'\),\s*t\('Total Sales'\),\s*t\('Benefit'\),\s*t\('Visitor Share'\),\s*t\('Company Share'\),/,
    );

    /* The commission and the company's share are money cells, not text. */
    expect(fn).toMatch(/createMoneyCell\(item\.total_share, currency\)/);
    expect(fn).toMatch(/createMoneyCell\(item\.company_share, currency\)/);
    /* User-supplied account names must never reach the PDF as markup. */
    expect(fn).toMatch(/stripTags\(item\.visitor_display_name/);
  });

  test('the downloaded summary carries the same figures as the screen', () => {
    const branch = GENERATOR_SOURCE.match(
      /if \(type === 'visitor_report'\) \{[\s\S]*?\n  \}/,
    )?.[0] || '';

    expect(branch).toContain("t('Date Range')");
    expect(branch).toContain("t('Total Sales')");
    expect(branch).toContain("t('Benefit')");
    expect(branch).toContain("t('Visitor Share')");
    expect(branch).toContain("t('Company Share')");
    expect(branch).toContain("formatCurrencyMap(sumByCurrency('company_share')");
  });

  test('the download file is named after the report', () => {
    expect(GENERATOR_SOURCE).toMatch(
      /`ZenoERP-\$\{safeType \|\| 'report'\}-\$\{date\}\.pdf`/,
    );
  });
});

describe('the visitor report is reachable from the sales page', () => {
  test('the sales page knows the visitors tab', () => {
    expect(SALES_SOURCE).toMatch(/enable_visitor \? \['sales', 'products', 'visitors'\]/);
    expect(SALES_SOURCE).toMatch(/enable_visitor && activeTab === 'visitors'/);
    expect(SALES_SOURCE).toMatch(/import VisitorReport from '\.\/sales\/VisitorReport\.svelte'/);
    expect(SALES_SOURCE).toMatch(/activeTab === 'visitors'/);
  });

  test('the top bar links to the tab', () => {
    expect(TOPBAR_SOURCE).toMatch(/dashboard\/sales\?tab=visitors/);
    expect(TOPBAR_SOURCE).toMatch(/enable_visitor \? \['visitors'\]/);
  });
});
