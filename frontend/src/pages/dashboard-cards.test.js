/**
 * Wiring guard for the clickable dashboard cards.
 *
 * Both dashboards turn every summary tile into a router link: the tile keeps
 * its card look, but the whole card is an `<a use:link>` that opens the section
 * page owning the figure it shows. These are source-level tests because the
 * cards only render after the dashboard API answers, so there is nothing cheap
 * to mount here; what must not silently regress is the route each tile opens.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

const dashboard = read('./Dashboard.svelte');
const dashboard2 = read('./Dashboard2.svelte');

const linkCount = (source) => (source.match(/use:link/g) || []).length;

describe('main dashboard cards', () => {
  test('the dashboard is still a valid Svelte component', () => {
    // Every card was rewritten by hand, so a mismatched </a> would only surface
    // in the browser; catch it here instead.
    expect(() => compile(dashboard, { filename: 'Dashboard.svelte' })).not.toThrow();
  });

  test('every card opens the section that owns its figure', () => {
    const routes = [
      '/dashboard/accounts/report', // benefit + expenses
      '/dashboard/accounts/general-report', // net profit
      '/dashboard/sales', // sales metric
      '/dashboard/purchases', // purchases metric
      '/dashboard/stock/returns', // sale + purchase returns
      '/dashboard/wastes', // wastes metric
      '/dashboard/product-alerts?tab=products', // top products
      '/dashboard/product-alerts?tab=quantity', // low stock / expiry alerts
      '/dashboard/treasury', // treasury
    ];

    for (const route of routes) {
      expect(dashboard).toContain(route);
    }
  });

  test('the summary tiles are links, not static articles', () => {
    expect(dashboard).not.toMatch(/<article class="metric-card/);

    for (const card of ['metric-card--benefit', 'metric-card--expense', 'metric-card--net']) {
      expect(dashboard).toMatch(
        new RegExp(`<a[\\s\\S]{0,400}?class="metric-card ${card} summary-metric-card card-link"`),
      );
    }
  });

  test('the treasury card opens the treasury account profile itself', () => {
    // The card shows treasury balances, so it must land on that account's own
    // profile (`…/dashboard/account/<id>`), not on an unrelated report. The
    // aggregate treasury page is only the fallback until the id is resolved.
    expect(dashboard).toMatch(/import \{ findTreasuryAccountId \} from '\.\/accounts\/AccountsHelper\.js'/);
    expect(dashboard).toMatch(/treasuryHref = treasuryAccountId\s*\n?\s*\? `\/dashboard\/account\/\$\{treasuryAccountId\}`\s*\n?\s*: '\/dashboard\/treasury'/);
    expect(dashboard).toMatch(/<a[\s\S]{0,200}?class="panel compact-panel card-link"[\s\S]{0,200}?href={treasuryHref}/);
  });

  test('revenue mix rows and the support panels are links too', () => {
    expect(dashboard).toMatch(/class="mix-item mix-item--link"/);
    expect(dashboard).toMatch(/class="panel compact-panel card-link"/); // treasury
    expect(dashboard).toMatch(/class="panel products-panel card-link"/); // top products
    expect(dashboard).toMatch(/class="panel compact-panel alert-panel card-link"/); // stock alerts
    expect(linkCount(dashboard)).toBeGreaterThanOrEqual(8);
  });

  test('the product cards open the matching tab of the alerts page', () => {
    // Top products is its own tab; the combined low-stock / expiry panel opens
    // the quantity tab, and the tab bar inside the page reaches expiry.
    expect(dashboard).toMatch(/class="panel products-panel card-link"[\s\S]{0,120}?href="\/dashboard\/product-alerts\?tab=products"/);
    expect(dashboard).toMatch(/class="panel compact-panel alert-panel card-link"[\s\S]{0,200}?href="\/dashboard\/product-alerts\?tab=quantity"/);
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
