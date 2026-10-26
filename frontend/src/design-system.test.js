import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the Zeno design system.
 *
 * Index pages share one shell (IndexPageLayout), one table (DataTable), one
 * toolbar (FilterToolbar) and one pager (PaginationBar). The look of those
 * pieces lives in the shared components and the --z-* tokens, so an index page
 * must not restate table-cell styling of its own: that is exactly how the old
 * per-page designs drifted apart.
 *
 * These tests read component source — they are a wiring guard, not a substitute
 * for the (impossible here) browser test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE);
const read = (path) => readFileSync(join(HERE, path), 'utf8');

function svelteFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(full);
    return entry.name.endsWith('.svelte') ? [full] : [];
  });
}

const FILES = svelteFiles().map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  source: readFileSync(path, 'utf8'),
}));

const TABLE_CONSUMERS = FILES.filter((file) => file.source.includes('<DataTable'));

describe('shared index page stack', () => {
  it('styles the Add Journal modal from the journal voucher reference', () => {
    const modal = read('components/common/QuickEntryModal.svelte');
    const appModal = read('components/common/AppModal.svelte');
    const journals = read('pages/journals/JournalsIndex.svelte');
    const journalForm = read('pages/journals/AddJournal.svelte');

    expect(modal).toContain('width: min(95vw, 520px);');
    expect(modal).toContain('padding: 10px 14px;');
    expect(modal).toContain('width: 30px;');
    expect(modal).toContain('--quick-entry-control-height: 40px;');
    /* The voucher fields moved into AddJournal, so the 11px label scale and the
       40px controls are asserted against the form itself. */
    expect(journalForm).toContain('font-size: 11px;');
    expect(journalForm).toContain('height: 40px;');
    expect(journalForm).toContain('padding: 9px 14px;');
    expect(appModal).toContain('resolvedIcon.startsWith(\'ms:\')');
    expect(appModal).toContain('<span class="ms f">{materialIcon}</span>');
    /* The header glyph follows the voucher direction, as in Journal.dc.html:
       north_west for debit, south_east for credit. */
    expect(journals).toContain("let addJournalIcon = 'ms:north_west';");
    expect(journals).toContain("event.detail === 'cr' ? 'ms:south_east' : 'ms:north_west'");
    expect(journalForm).toContain("$: dispatch('side', journalSide);");
    expect(journals).toContain('referenceModal={true}');
    expect(journalForm).toContain('export let referenceModal = false;');
  });

  it('removes the treasury and track mode switch from Add Journal', () => {
    const journalForm = read('pages/journals/AddJournal.svelte');

    expect(journalForm).not.toContain('class="jv-modes"');
    expect(journalForm).not.toContain('class="jv-mode"');
    expect(journalForm).not.toContain('.jv-modes');
    expect(journalForm).toContain('class="jv-account-select"');
    expect(journalForm).toContain('showTrackModal = true');
  });

  it('shows the configured currency symbol in the Add Journal amount picker', () => {
    const journalForm = read('pages/journals/AddJournal.svelte');

    expect(journalForm).toContain('function currencySymbol(code)');
    expect(journalForm).toContain('?.symbol || t(normalizedCode)');
    expect(journalForm).toContain('<span>{currencySymbol(currency)}</span>');
  });

  it('styles the Add Journal balance preview like the journal reference', () => {
    const journalForm = read('pages/journals/AddJournal.svelte');

    expect(journalForm).toContain('balanceStatus(firstEntryBefore)');
    expect(journalForm).toContain('balanceStatus(firstEntryAfter)');
    expect(journalForm).toContain('currencySymbol(currency)');
    expect(journalForm).toContain('jv-balance__value b.has-debt');
    expect(journalForm).toContain('jv-balance__value b.has-credit');
  });

  it('shows only the account name in the selected account field', () => {
    const journalForm = read('pages/journals/AddJournal.svelte');

    expect(journalForm).toContain('{t(\'Account\')}');
    expect(journalForm).toContain('class="jv-req" aria-hidden="true">*</span>');
    expect(journalForm).toContain('class="jv-account-select"');
    expect(journalForm).toContain('account_balance_wallet');
    expect(journalForm).toContain('showTrackModal = true');
    /* The field carries the account name only: no balance, no type/code. */
    expect(journalForm).toContain('class="jv-account-select__name"');
    expect(journalForm).not.toContain('class="jv-account-select__balance"');
    expect(journalForm).not.toContain('class="jv-account-select__meta"');
    /* Reference geometry: chip in a row beside a 34x32 icon button. */
    expect(journalForm).toContain('class="jv-account-row"');
    expect(journalForm).toContain('class="jv-account-toggle"');
    expect(journalForm).toContain('on:click={openSecondAccountPicker}');
    expect(journalForm).toContain('style={trackPickerStyle}');
    expect(journalForm).toContain('position: fixed;');
  });

  it('renders the customer dropdown like the reference account list', () => {
    const journalForm = read('pages/journals/AddJournal.svelte');

    /* Search row with the "new" chip, then one row per account carrying a
       class-tinted tile, name over code · type, the balance and a pin. */
    expect(journalForm).toContain('class="jv-dd__search"');
    expect(journalForm).toContain('id="form_account_panel_search"');
    expect(journalForm).toContain('{t(\'New\')}');
    expect(journalForm).toContain('class="jv-opt-row"');
    expect(journalForm).toContain('class="jv-opt__tile"');
    expect(journalForm).toContain('style={tint.style}');
    expect(journalForm).toContain('class="jv-opt__bal"');
    expect(journalForm).toContain('class="jv-opt__pin"');
    expect(journalForm).toContain('on:click|stopPropagation={() => toggleAccountPin(acc.id)}');
  });

  it('has index pages on the shared table', () => {
    expect(TABLE_CONSUMERS.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps the journal pages on the shared components', () => {
    for (const page of ['pages/journals/JournalsIndex.svelte', 'pages/journals/JournalsReport.svelte']) {
      const source = read(page);
      expect(source, page).toContain('<IndexPageLayout');
      expect(source, page).toContain('<DataTable');
      expect(source, page).toContain('<FilterToolbar');
      expect(source, page).toContain('<PaginationBar');
    }
  });

  it('renders journal report Jalali dates with Latin digits', () => {
    const report = read('pages/journals/JournalsReport.svelte');
    expect(report).toContain("fa-AF-u-ca-persian-nu-latn");

    const parts = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(2026, 9, 25, 12));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    expect(values.year).toBe('1405');
    expect(values.month).toMatch(/^\d{2}$/);
    expect(values.day).toMatch(/^\d{2}$/);
  });

  it('uses configured currency symbols in journal report amounts', () => {
    const report = read('pages/journals/JournalsReport.svelte');

    expect(report).toContain("?.symbol || t(normalizedCode)");
    expect(report).toContain('currencySymbol(journal.currency || \'\')');
    expect(report).toContain('currencySymbol(currency.code)');
    expect(report).toContain('currencySymbol(currency)');
    expect(report).toContain('sym: currencySymbol(c.code)');
    expect(report).toContain('sym: currencySymbol(currency)');
  });

  it('calculates report balances from the full filtered result, not the visible page', () => {
    const report = read('pages/journals/JournalsReport.svelte');

    expect(report).toContain('getReportRunningBalanceRows()');
    expect(report).toContain('attachJournalRunningBalances(rows, balanceRows)');
    expect(report).toContain('runningBalanceCacheKey === key');
    expect(report).toContain('return withJournalRunningBalances(all.map(mapJournalAmounts))');
  });

  it('replaces currency names next to amounts in journal report descriptions', () => {
    const report = read('pages/journals/JournalsReport.svelte');

    expect(report).toContain('replaceCurrencyNamesWithSymbols(');
    expect(report).toContain('descriptionWithCurrencySymbols(journal.description)');
    expect(report).toContain('descriptionWithCurrencySymbols(j.description)');
  });

  it('places journal type choices inside the shared filter popover', () => {
    const report = read('pages/journals/JournalsReport.svelte');

    expect(report).toContain("key: 'type'");
    expect(report).toContain('typeTabs.map((tab) => ({ value: tab.value, label: lbl(tab.labelKey) }))');
    expect(report).toContain("if (key === 'type') typeFilter = value;");
    expect(report).toContain("typeFilter = 'all';");
    expect(report).not.toContain('class="report-tabs"');
  });

  it('keeps the top-level index pages on the shared components', () => {
    const pages = [
      'pages/Sales.svelte',
      'pages/Purchases.svelte',
      'pages/products/ProductsIndex.svelte',
      'pages/products/ServicesIndex.svelte',
      'pages/accounts/AccountsIndex.svelte',
    ];

    for (const page of pages) {
      const source = read(page);
      expect(source, page).toContain('<IndexPageLayout');
      expect(source, page).toContain('<DataTable');
      expect(source, page).toContain('<FilterToolbar');
      expect(source, page).toContain('<PaginationBar');
    }
  });

  it('matches the reference underline tabs for journal navigation', () => {
    const topbar = read('components/Topbar.svelte');

    expect(topbar).toContain('class="journal-section-tabs"');
    expect(topbar).toContain('menu_book');
    expect(topbar).toContain('summarize');
    expect(topbar).toContain('height: 38px;');
    expect(topbar).toContain('gap: 18px;');
    expect(topbar).toContain('aria-current="page"');
    expect(topbar).toContain('font-variation-settings: \'FILL\' 1;');
  });

  it('applies the same underline tab treatment to every top-bar page group', () => {
    const topbar = read('components/Topbar.svelte');

    expect(topbar).toContain(':global(.navbar-nav .nav-link)');
    expect(topbar).toContain('gap: 18px;');
    expect(topbar).toContain('height: 38px;');
    expect(topbar).toContain(':global(.navbar-nav .nav-link.active::after)');
    expect(topbar).toContain('box-shadow: inset 0 -1px 0 var(--z-border, #e1e7f0);');
  });

  it('keeps the stock, catalogue and settings index pages on the shared table', () => {
    /* These settings-style pages and the two stock lists used to draw a
       Bootstrap <table> (or a whole card + select toolbar) inside the shared
       panel, so the design stopped at the panel edge. */
    const pages = [
      'pages/StockTransfers.svelte',
      'pages/stocktransactions/StockTransactionsIndex.svelte',
      'pages/products/Units.svelte',
      'pages/products/Categories.svelte',
      'pages/products/UnitCategories.svelte',
      'pages/settings/Brands.svelte',
      'pages/settings/Currencies.svelte',
      'pages/settings/Generics.svelte',
      'pages/users/UserRoles.svelte',
      'pages/accounts/AccountGroups.svelte',
    ];

    for (const page of pages) {
      const source = read(page);
      expect(source, page).toContain('<IndexPageLayout');
      expect(source, page).toContain('<DataTable');
      expect(source, page).toContain('<TableActions');
    }
  });

  it('draws no Bootstrap table inside a shared index panel', () => {
    /* The panel, the toolbar, the table and the pager are the shared stack; a
       page that mixes a Bootstrap table back in loses the design again. A
       report is exempt: it renders its own ledger grid with row numbers,
       running-balance columns and print rules rather than a record list. */
    const reportTables = new Set(['pages/accounts/GeneralReport.svelte']);
    const bootstrapTable = /<table[^>]*\sclass="table[\s"]/;
    const offenders = FILES.filter(
      (file) =>
        file.source.includes('<IndexPageLayout') &&
        !reportTables.has(file.path) &&
        bootstrapTable.test(file.source),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('leaves the table look to DataTable instead of restating it per page', () => {
    /* A page may tint a row state (.row-overdue) but not restate header, row or
       cell chrome — that belongs to DataTable. */
    const tableChrome = /\.data-table\s*(?:>\s*)?(?:thead|tbody)\s*(?:>\s*)?(?:tr|th|td)(?![\w.-])/;
    const offenders = TABLE_CONSUMERS.filter((file) => tableChrome.test(file.source)).map(
      (file) => file.path,
    );
  
    expect(offenders).toEqual([]);
  });

  it('pins the reference column grid through DataTable instead of page CSS', () => {
    /* The reference journal sheet places its columns with a grid template; a
       page hands DataTable the same widths so a fixed layout reproduces them. */
    const table = read('components/common/DataTable.svelte');

    expect(table).toContain('<colgroup>');
    expect(table).toContain("columns?.length ? 'fixed'");
    expect(read('pages/journals/JournalsIndex.svelte')).toContain('columns={[');
  });

  it('pads the reference journal row through DataTable instead of a page override', () => {
    /* The reference row is 9px top and bottom; DataTable takes that as a prop so
       the page never restates cell padding. */
    expect(read('components/common/DataTable.svelte')).toContain('--dt-cell-pad-y');
    expect(read('pages/journals/JournalsIndex.svelte')).toContain('cellPaddingY="9px"');
  });

  it('matches the Journal reference type pill dimensions, icon, and colors', () => {
    const page = read('pages/journals/JournalsIndex.svelte');

    expect(page).toContain('class="journal-pill"');
    expect(page).toContain('height: 22px;');
    expect(page).toContain('padding: 0 8px 0 7px;');
    expect(page).toContain('gap: 4px;');
    expect(page).toContain('font-size: 14px;');
    expect(page).toContain('background: color-mix(in srgb, var(--journal-type, #2f6fed) 11%, transparent);');
    expect(page).toContain("'assignment_return', '#DB2777'");
    expect(page).toContain("'payments', '#D9822B'");
    expect(page).toContain("'flag', '#64748B'");
    expect(page).toContain('class="journal-type__sub"');
    expect(page).not.toContain('journal-type__icon');
  });

  it('folds the journal row actions into the reference kebab', () => {
    /* The reference row shows a single more_vert button; every action, print
       included, lives in its menu, and both the label and the kebab are centred. */
    const page = read('pages/journals/JournalsIndex.svelte');

    expect(page).toContain('foldAll material');
    expect(page).toMatch(/<th class="col-center">\{lbl\('actions'\)\}/);
    expect(page).toMatch(/<td class="col-center">\s*(?:<!--[\s\S]*?-->\s*)?<TableActions/);

    /* Reference kebab: 28×28, 7px radius, 18px more_vert glyph. */
    const actions = read('components/common/TableActions.svelte');
    expect(actions).toContain('more_vert');
    expect(actions).toContain('width: 28px;');
    expect(actions).toContain('font-size: 18px;');

    /* Reference menu: 176px wide, 28px rows, 11.5px/600 labels, 16px glyphs,
       and the destructive entry always closes the list after a hairline. */
    expect(actions).toContain('width: 176px;');
    expect(actions).toContain('font-size: 11.5px;');
    expect(actions).toContain("const isDestructive = (action) => action.tone === 'delete' || action.tone === 'danger';");
    expect(actions).toContain('...visibleActions.filter(isDestructive),');

    /* Only «نمایش» is link-blue; «چاپ» keeps the muted reference glyph. */
    expect(page).toContain("tone: 'muted',");
  });

  it('opens every journal in the reference read-only voucher card', () => {
    const page = read('pages/journals/JournalsIndex.svelte');
    const dialog = read('pages/journals/ViewJournalModal.svelte');

    /* «نمایش» is now the first row action and opens the dialog, not a route. */
    expect(page).toContain("icon: 'bi-eye',");
    expect(page).toContain('onClick: () => openJournalView(journal),');
    expect(page).toContain('<ViewJournalModal');
    expect(page).toContain('view={viewData}');

    /* Reference `.jvd`: 640px sheet, 18px radius, 16/18 header, 40px tile. */
    expect(dialog).toContain('width: 640px;');
    expect(dialog).toContain('border-radius: 18px;');
    expect(dialog).toContain('0 40px 90px -24px rgba(11, 21, 48, 0.6)');
    expect(dialog).toContain('padding: 16px 18px;');
    expect(dialog).toContain('width: 40px;');
    expect(dialog).toContain('font-size: 22px;');

    /* Posting table: 32px head, 76/110px columns, 9px totals row. The account
       code column is intentionally absent from this dialog. */
    expect(dialog).toContain('height: 32px;');
    expect(dialog).not.toContain('is-code');
    expect(dialog).toContain('width: 76px;');
    expect(dialog).toContain('width: 110px;');
    expect(dialog).toContain('padding: 9px 12px;');

    /* Action bar: surface-2, 34px buttons. */
    expect(dialog).toContain('padding: 12px 18px;');
    expect(dialog).toContain('height: 34px;');

    /* The kebab maps the new entries onto reference glyphs. */
    expect(read('components/common/TableActions.svelte')).toContain("'bi-eye': 'visibility',");
  });

  it('imports the shared primitives instead of re-implementing them', () => {
    const primitives = [
      'ActionButton',
      'DataTable',
      'EmptyState',
      'ExportMenu',
      'FilterToolbar',
      'PaginationBar',
      'StatusBadge',
      'SummaryCard',
      'TableActions',
    ];

    for (const name of primitives) {
      const users = FILES.filter((file) => file.source.includes(`<${name}`));
      expect(users.length, name).toBeGreaterThan(0);

      for (const file of users) {
        /* Imports wrap over several lines in a few pages — compare them flat. */
        const flat = file.source.replace(/\s+/g, ' ');
        expect(flat, `${file.path} -> ${name}`).toMatch(
          new RegExp(
            `import ${name} from ['"](?:[^'"]*components/common/|\\./)${name}\\.svelte['"]`,
          ),
        );
      }
    }
  });

  it('uses Journal Material Symbols for shared search, filter, export, and print controls', () => {
    const filterToolbar = read('components/common/FilterToolbar.svelte');
    const exportMenu = read('components/common/ExportMenu.svelte');
    const actionButton = read('components/common/ActionButton.svelte');

    expect(filterToolbar).toContain('export let material = true;');
    expect(filterToolbar).toContain('>search</span>');
    expect(filterToolbar).toContain('>tune</span>');
    expect(exportMenu).toContain('export let material = true;');
    expect(exportMenu).toContain('>download</span>');
    expect(actionButton).toContain("export let iconSet = 'material';");
    expect(actionButton).toContain("'bi-printer-fill': 'print'");
    expect(actionButton).toContain("'bi-plus-lg': 'add'");
  });

  it('keeps the actions header over its TableActions cells', () => {
    /* DataTable pins the actions cell to the row end (or centres it), so the
       label must follow the same alignment or it sits over the opposite edge. */
    const users = FILES.filter((file) => file.source.includes('<TableActions'));
    expect(users.length).toBeGreaterThan(5);

    const offenders = users
      .filter(
        (file) =>
          !/<th[^>]*col-(?:end|center)[^>]*>\s*\{[^}]*['"](?:actions|Actions)['"][^}]*\}/.test(
            file.source,
          ),
      )
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });
});

describe('design tokens', () => {
  it('defines the Zeno tokens the shared components read', () => {
    const app = readFileSync(join(SRC, 'app.css'), 'utf8');

    for (const token of ['--z-brand', '--z-ink', '--z-surface', '--z-row-border', '--z-th-bg']) {
      expect(app, token).toContain(`${token}:`);
    }
  });

  it('uses increased responsive page gutters across the shell and dashboard', () => {
    const app = read('app.css');
    const layout = read('layouts/DashboardLayout.svelte');

    expect(app).toContain('--page-padding-x: 24px;');
    expect(app).toContain('--page-padding-x: 20px;');
    expect(app).toContain('--page-padding-x: 16px;');
    expect(app).toContain('--page-padding-x: 14px;');
    expect(layout).toContain('padding: 0 var(--page-padding-x) 32px;');
  });

  it('draws the table from tokens rather than literal greys', () => {
    const table = read('components/common/DataTable.svelte');

    expect(table).toContain('var(--z-th-bg');
    expect(table).toContain('var(--z-row-border');
    expect(table).toContain('var(--z-surface');
  });
});

describe('shell top bar', () => {
  it('dresses the shell header with shared reference-style tabs and controls', () => {
    const bar = read('components/Topbar.svelte');

    expect(bar).toContain('box-shadow: inset 0 -1px 0 var(--z-border, #e1e7f0);');
    expect(bar).toContain('background: #2f6fed;');
    expect(bar).toContain('class="btn erp-icon-btn"');
    expect(bar).toContain('class="topbar-clock"');
    expect(bar).not.toContain('version-pill');
    expect(bar).not.toContain('title="Notifications"');
    expect(bar).not.toContain('title="Fullscreen"');
    expect(bar).not.toContain('btn-light');
  });
});

describe('mixed-script fonts', () => {
  /* One family stack, two faces: Inter owns the latin unicode-range and
     Vazirmatn the arabic one. Glyph-by-glyph selection is what lets an RTL
     sentence carry English words in Inter without a lang=/dir= selector. */
  const fonts = readFileSync(join(SRC, '..', 'public', 'fonts', 'vazirmatn.css'), 'utf8');

  it('declares Inter for latin and Vazirmatn for arabic only', () => {
    expect(fonts).toMatch(/font-family:\s*'Inter';[\s\S]*?unicode-range:\s*U\+0000-00FF/);
    expect(fonts).toContain('U+0600-06FF');
    expect(fonts).not.toMatch(/\[(?:lang|dir)[^\]]*\]/);
  });

  it('orders the default stack Inter first so mixed runs switch per character', () => {
    expect(fonts).toMatch(/\*\s*\{\s*font-family:\s*'Inter',\s*'Vazirmatn',\s*sans-serif;/);
    expect(readFileSync(join(SRC, 'app.css'), 'utf8')).toContain(
      "--z-font: 'Inter', 'Vazirmatn', sans-serif;",
    );
  });

  it('ships that stylesheet to the app and to the print documents', () => {
    expect(readFileSync(join(SRC, '..', 'index.html'), 'utf8')).toContain(
      '/fonts/vazirmatn.css',
    );

    const vazirFirst = FILES.filter((file) =>
      /font-family:\s*['"]?Vazirmatn/.test(file.source),
    ).map((file) => file.path);

    expect(vazirFirst).toEqual([]);
  });
});

describe('icon set', () => {
  it('keeps Material Symbols scoped to the opt-in journal toolbar', () => {
    /* The reference journal design draws its toolbar with Material Symbols.
       The shared primitives opt in through `material` / `iconSet="material"`;
       every other page keeps the lighter, offline Bootstrap Icons. */
    const materialUsers = new Set([
      'components/common/ActionButton.svelte',
      'components/common/AppModal.svelte',
      'components/common/ExportMenu.svelte',
      'components/common/FilterSelect.svelte',
      'components/common/FilterToolbar.svelte',
      'components/common/PaginationBar.svelte',
      'components/common/TableActions.svelte',
      'components/Topbar.svelte',
      'pages/journals/AddJournal.svelte',
      'pages/journals/JournalsIndex.svelte',
      'pages/journals/ViewJournalModal.svelte',
    ]);

    const offenders = FILES.filter(
      (file) => /class="ms["\s]/.test(file.source) && !materialUsers.has(file.path),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('self-hosts the Material Symbols font instead of loading a CDN', () => {
    expect(read('main.js')).toContain('material-symbols/rounded.css');
    expect(readFileSync(join(SRC, 'app.css'), 'utf8')).toContain("'Material Symbols Rounded'");

    const offenders = FILES.filter((file) => file.source.includes('fonts.googleapis.com')).map(
      (file) => file.path,
    );

    expect(offenders).toEqual([]);
  });

  it('uses the reference icon set for journal tabs in the active top bar', () => {
    const topbar = read('components/Topbar.svelte');
    const legacyTopbar = read('components/common/TopNavbar.svelte');

    expect(topbar).toContain('menu_book');
    expect(topbar).toContain('summarize');
    expect(legacyTopbar).toContain('bi-journal-text');
    for (const [shell, source] of [
      ['components/Topbar.svelte', topbar],
      ['components/common/TopNavbar.svelte', legacyTopbar],
    ]) {
      expect(source, shell).toContain('/dashboard/journals/list');
      expect(source, shell).toContain('/dashboard/journals/report');
      expect(source, shell).not.toContain('fonts.googleapis.com');
    }
  });
});
