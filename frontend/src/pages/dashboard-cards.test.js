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
