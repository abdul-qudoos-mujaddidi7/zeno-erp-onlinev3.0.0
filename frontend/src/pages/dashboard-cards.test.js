/**
 * Wiring guard for the clickable dashboard cards.
 *
 * The dashboard board turns every figure into a router link: the KPI card, the
 * quick action, a debtor row, an account tile and the collapsed report rows all
 * open the section page that owns the number they show. These are source-level
 * tests because the cards only render after the dashboard API answers, so there
 * is nothing cheap to mount here; what must not silently regress is the route
 * each tile opens.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

const dashboard = read('./Dashboard.svelte');
const board = read('../components/DashboardBoard.svelte');
const dashboard2 = read('./Dashboard2.svelte');

const linkCount = (source) => (source.match(/use:link/g) || []).length;

describe('main dashboard cards', () => {
  test('the dashboard and its board are valid Svelte components', () => {
    // The redesign was hand-written, so a mismatched </a> or a stray block
    // would only surface in the browser; catch it here instead.
    expect(() => compile(dashboard, { filename: 'Dashboard.svelte' })).not.toThrow();
    expect(() => compile(board, { filename: 'DashboardBoard.svelte' })).not.toThrow();
  });

  test('every card opens the section that owns its figure', () => {
    const routes = [
      '/dashboard/sales', // sales KPI
      '/dashboard/purchases', // purchases KPI
      '/dashboard/stock/returns', // sale + purchase returns
      '/dashboard/wastes', // wastes
      '/dashboard/product-alerts?tab=products', // top products
      '/dashboard/product-alerts?tab=quantity', // low stock
      '/dashboard/product-alerts?tab=expiry', // expiry
      '/dashboard/treasury', // treasury fallback
      '/dashboard/accounts/list', // account tiles
      '/dashboard/journals/list', // receive money / record expense
      '/dashboard/exchanges/list', // exchange quick action
      '/dashboard/sale-form/0', // new sale
      '/dashboard/purchase-form/0', // new purchase
      '/dashboard/product-form/new', // new product
      '/dashboard/settings/currencies', // set rate
    ];

    // Routes can be built in the container (data-driven cards) or written
    // straight into the board (fixed links such as the products tab).
    const routes_owner = `${dashboard}\n${board}`;

    for (const route of routes) {
      expect(routes_owner).toContain(route);
    }
  });

  test('the board renders its cards as router links', () => {
    expect(board).toContain('class="zb-kpi"');
    expect(board).toContain('href={card.href} use:link');

    expect(board).toContain('class="zb-qa"');
    expect(board).toContain('href={action.href} use:link');

    expect(board).toContain('class="zb-debtor"');
    expect(board).toContain('href={`/dashboard/account/${debtor.id}`}');

    expect(board).toContain('class="zb-account"');
    expect(board).toContain('href={account.href} use:link');

    expect(board).toContain('class="zb-returns-row"');
    expect(board).toContain('href={row.href} use:link');

    expect(linkCount(board)).toBeGreaterThanOrEqual(8);
  });

  test('operations and quick-action cards fill responsive grid tracks', () => {
    expect(board).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));',
    );
    expect(board).toMatch(/width:\s*100%;\s*min-width:\s*0;\s*height:\s*75\.52px;/);
    // The quick actions share one row on desktop: one auto-generated track per
    // card, never a fixed card width that pushes the last action down a line.
    expect(board).toMatch(
      /\.zb \.zb-qa-grid\s*\{\s*grid-template-columns: none;\s*grid-auto-flow: column;/,
    );
    // Narrower screens reflow them to three per row (two on small phones); those
    // overrides must stay below the single-row rule so desktop keeps one line.
    const oneRow = board.indexOf('grid-auto-flow: column;');
    const threeUp = board.indexOf('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(threeUp).toBeGreaterThan(oneRow);
    expect(board).toMatch(
      /@media \(max-width: 420px\) \{\s*\.zb \.zb-qa-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(board).toMatch(/width:\s*100%;\s*min-width:\s*0;\s*height:\s*65\.33px;/);
    expect(board).not.toMatch(/\.zb-kpi-grid\s*\{\s*grid-template-columns: repeat\(2,/);
  });

  test('alerts search keeps its left alignment when the header wraps', () => {
    expect(board).toContain('margin-inline-start: auto;');
    expect(board).toMatch(/\.zb-search\s*\{\s*width:\s*100%;\s*max-width:\s*320px;/);
    expect(board).not.toMatch(/\.zb-search\s*\{\s*margin-inline-start:\s*0;/);
  });

  test('journal quick actions navigate to the journal page and open the matching direction', () => {
    const journalForm = read('./journals/AddJournal.svelte');
    const journalsPage = read('./journals/JournalsIndex.svelte');

    expect(dashboard).toContain("href: '/dashboard/journals/list?addJournal=1&side=cr'");
    expect(dashboard).toContain(
      "href: '/dashboard/journals/list?addJournal=1&side=dr&accountCode=EXPENSES'",
    );
    expect(board).toContain('href={action.href} use:link');
    expect(dashboard).not.toContain('QuickEntryModal');
    expect(journalsPage).toContain("journalParams.get('addJournal') === '1'");
    expect(journalsPage).toContain('initialJournalSide={addJournalSide}');
    expect(journalsPage).toContain('initialAccountCode={addJournalAccountCode}');
    expect(journalForm).toContain("export let initialJournalSide = 'dr'");
    expect(journalForm).toContain("export let initialAccountCode = ''");
    expect(journalForm).toContain("String(item.code || '').toUpperCase()");
    expect(journalForm).toContain('let journalSide = initialJournalSide');
  });

  test('exchange quick action opens the Add Exchange popup on the exchanges page', () => {
    const exchangesPage = read('./exchanges/ExchangesIndex.svelte');

    expect(dashboard).toContain("href: '/dashboard/exchanges/list?addExchange=1'");
    expect(exchangesPage).toContain("get('addExchange') === '1'");
    expect(exchangesPage).toContain('openAddExchange();');
    expect(exchangesPage).toContain("push('/dashboard/exchanges/list')");
  });

  test('the treasury card opens the treasury account profile itself', () => {
    // The card shows treasury balances, so it must land on that account's own
    // profile (`…/dashboard/account/<id>`), not on an unrelated report. The
    // aggregate treasury page is only the fallback until the id is resolved.
    expect(dashboard).toContain(
      "import { findTreasuryAccountId } from './accounts/AccountsHelper.js'",
    );
    expect(dashboard).toContain('treasuryHref = treasuryAccountId');
    expect(dashboard).toContain('? `/dashboard/account/${treasuryAccountId}`');
    expect(dashboard).toContain(": '/dashboard/treasury'");
    expect(dashboard).toContain('href: treasuryHref');

    expect(board).toContain('href={data.treasury.href} use:link class="zb-treasury-link"');
  });

  test('each card stays behind its module permission', () => {
    // A permission set that hides a module must remove its card, not just the
    // link target, so every conditional card is built inside a guard.
    const guardedCard = (key) =>
      new RegExp(`if \\([\\s\\S]{0,80}?\\) \\{[\\s\\S]{0,160}?key: '${key}'`);

    expect(guardedCard('sales').test(dashboard)).toBe(true);
    expect(guardedCard('purchases').test(dashboard)).toBe(true);
    expect(guardedCard('expenses').test(dashboard)).toBe(true);
    expect(guardedCard('profit').test(dashboard)).toBe(true);

    expect(dashboard).toContain('if (cardStockAlerts && enable_expiry_date)');
    expect(dashboard).toContain('debtors: cardDebtors');
  });

  test('financial trend totals use the selected chart period', () => {
    expect(dashboard).toContain('(trendData.benefit || []).reduce(');
    expect(dashboard).toContain('(trendData.expenses || []).reduce(');
    expect(dashboard).toContain('benefit: chartBenefitTotal');
    expect(dashboard).toContain('expenses: chartExpenseTotal');
    expect(dashboard).toContain('net: chartBenefitTotal - chartExpenseTotal');
  });
});

describe('dashboard chart ranges', () => {
  /* Every report card owns its own range: picking a range on the financial trend
     must not repaint the warehouse chart, and the warehouse buttons must not
     change the trend the page reloads. */
  test('the warehouse card drives its own period', () => {
    expect(board).toMatch(/export let warehousePeriod = 'week';/);
    expect(board).toMatch(
      /function pickWarehousePeriod\(next\) \{[\s\S]{0,140}dispatch\('warehouseperiod', next\)/,
    );
    expect(board).toMatch(
      /aria-pressed=\{warehousePeriod === 'week'\}[\s\S]{0,120}pickWarehousePeriod\('week'\)/,
    );
    expect(board).toMatch(
      /aria-pressed=\{warehousePeriod === 'month'\}[\s\S]{0,120}pickWarehousePeriod\('month'\)/,
    );
  });

  test('the page keeps the trend and warehouse ranges apart', () => {
    const setPeriodBody = dashboard.match(/async function setPeriod\(period\) \{([\s\S]*?)\n  \}/)[1];
    // Rebuilding the inventory series here is exactly what made the two filters
    // move together.
    expect(setPeriodBody).not.toContain('loadWarehouseHistory');
    expect(setPeriodBody).toContain('activePeriod = period;');

    expect(dashboard).toMatch(/async function setWarehousePeriod\(period\) \{[\s\S]{0,120}loadWarehouseHistory\(\);/);
    expect(dashboard).toMatch(/function handleWarehousePeriod\(event\)/);
    expect(dashboard).toMatch(/function handleWarehouseCustomRange\(event\)/);
    expect(dashboard).toMatch(/warehousePeriod=\{warehousePeriod\}/);
    expect(dashboard).toMatch(/on:warehouseperiod=\{handleWarehousePeriod\}/);
    expect(dashboard).toMatch(/on:warehousecustom=\{handleWarehouseCustomRange\}/);
  });

  test('the warehouse chart buckets follow the warehouse period', () => {
    const dates = dashboard.match(/function buildWarehouseHistoryDates\(\) \{([\s\S]*?)\n  \}/)[1];
    expect(dates).toContain("warehousePeriod === 'week'");
    expect(dates).not.toContain('activePeriod');
  });
});

describe('alternate dashboard cards', () => {
  test('the dashboard is still a valid Svelte component', () => {
    expect(() => compile(dashboard2, { filename: 'Dashboard2.svelte' })).not.toThrow();
  });

  test('every card opens the section that owns its figure', () => {
    const routes = [
      '/dashboard/stock/products', // products, inventory value, stock alerts
      '/dashboard/accounts/list', // accounts
      '/dashboard/stock/warehouses', // warehouses
      '/dashboard/sales', // sales + payments collected
      '/dashboard/purchases', // purchases
      '/dashboard/stock/returns', // sale + purchase returns
      '/dashboard/wastes', // wastes
      '/dashboard/accounts/report', // net benefit
      '/dashboard/treasury', // treasury
    ];

    for (const route of routes) {
      expect(dashboard2).toContain(route);
    }
  });

  test('the quick stats, metric and summary cards are links', () => {
    expect(dashboard2).not.toMatch(/<div class="card border-start border-4/);
    expect(dashboard2).toMatch(/href={item\.href}/); // quick stats
    expect(dashboard2).toMatch(/href={m\.href}/); // metric cards

    // Quick stats row plus net benefit / treasury / payments collected, all four
    // rendered from a linked card template.
    const summaryLinks = dashboard2.match(/class="card border-0 shadow-sm dashboard-card h-100"/g) || [];
    expect(summaryLinks).toHaveLength(4);
    expect(linkCount(dashboard2)).toBeGreaterThanOrEqual(5);
  });

  test('the treasury card opens the treasury account profile itself', () => {
    expect(dashboard2).toMatch(/href={treasuryHref}/);
    expect(dashboard2).toMatch(/findTreasuryAccountId/);
  });
});

describe('dashboard card icons', () => {
  /* Every dashboard card tile reproduces Main.dc.html's Material Symbols glyph
     (`.ktile`, `.qa-ic`, `.ch3 .ct`, `.dz-ic`, `.dz-bt`), not a Bootstrap icon. */
  const GLYPHS = {
    dashboard: 'More Reports header',
    monitoring: 'Financial Trend block + Sales/Expenses chart',
    inventory_2: 'Inventory & Returns block',
    assignment_return: 'Returns & Wastes card',
    warehouse: 'Warehouses card',
    emoji_events: 'Top Products card',
    account_balance_wallet: 'Treasury card',
    person_search: 'Top Debtors card',
    currency_exchange: 'Exchange Rate card',
  };

  test('each card tile carries its reference glyph', () => {
    for (const [glyph, card] of Object.entries(GLYPHS)) {
      expect(board, card).toContain(`class="ms f" aria-hidden="true">${glyph}</span>`);
    }
  });

  test('the replaced Bootstrap icons are gone', () => {
    for (const icon of [
      'bi-grid-1x2-fill',
      'bi-graph-up',
      'bi-boxes',
      'bi-arrow-return-left',
      'bi-trophy-fill',
      'bi-wallet2',
      'bi-person-lines-fill',
    ]) {
      expect(board, icon).not.toContain(icon);
    }
    // The warehouse tile used to be a hand-drawn outline; the reference glyph
    // replaces it.
    expect(board).not.toContain('<path d="M3 9.5 12 4l9 5.5V20H3z">');
  });

  test('the KPI and quick-action tiles use the reference glyph set', () => {
    // Main.dc.html: ktile shopping_cart / shopping_bag / receipt_long /
    // trending_up, qa-ic add_shopping_cart / payments / shopping_bag /
    // add_box / receipt_long / currency_exchange.
    for (const glyph of [
      'shopping_cart',
      'shopping_bag',
      'receipt_long',
      'trending_up',
      'add_shopping_cart',
      'payments',
      'add_box',
    ]) {
      expect(dashboard, glyph).toContain(`icon: '${glyph}'`);
    }
    expect(dashboard).not.toMatch(/icon: 'bi-/);
  });
});
