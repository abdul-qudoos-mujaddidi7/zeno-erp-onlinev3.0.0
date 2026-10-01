/**
 * Wiring guard for the Products & Alerts page.
 *
 * The page is the shared target of three dashboard cards, so what must not
 * silently regress is the contract around it: the route exists, the three tabs
 * are rendered from the same keys the cards deep-link with, and the URL is what
 * drives the active tab.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const page = read('./ProductAlerts.svelte');
const layout = read('../../layouts/DashboardLayout.svelte');
const topbar = read('../../components/Topbar.svelte');

describe('products & alerts page', () => {
  test('the page is still a valid Svelte component', () => {
    expect(() => compile(page, { filename: 'ProductAlerts.svelte' })).not.toThrow();
  });

  test('the route is registered and lazy loaded', () => {
    expect(layout).toMatch(/const loadProductAlerts = \(\) => import\('\.\.\/pages\/productalerts\/ProductAlerts\.svelte'\)/);
    expect(layout).toMatch(/loc === '\/dashboard\/product-alerts'[\s\S]{0,120}?<AsyncPage loader=\{loadProductAlerts\} \/>/);
  });

  test('the top bar carries only the three tabs, no page title', () => {
    expect(topbar).toMatch(/case '\/dashboard\/product-alerts'/);

    // The page name was removed from the strip; the tabs are the whole bar.
    expect(topbar).not.toMatch(/t\('Products & Alerts'\)/);

    // The tab strip replaces the in-page bar, exactly like sales and stock.
    expect(topbar).toMatch(/href="\/#\/dashboard\/product-alerts\?tab=products"/);
    expect(topbar).toMatch(/href="\/#\/dashboard\/product-alerts\?tab=quantity"/);
    expect(topbar).toMatch(/href="\/#\/dashboard\/product-alerts\?tab=expiry"/);
    expect(topbar).toMatch(/productAlertTab === 'products' \? 'active' : ''/);
    expect(topbar).toMatch(/return \['products', 'quantity', 'expiry'\]\.includes\(tab\) \? tab : 'products'/);
  });

  test('the tabs are the keys the dashboard cards use', () => {
    for (const tab of ['products', 'quantity', 'expiry']) {
      expect(topbar).toContain(`?tab=${tab}`);
    }
  });

  test('the active tab follows the URL, so cards and tabs agree', () => {
    expect(page).toMatch(/resolveProductAlertTab\(new URLSearchParams\(query\)\.get\('tab'\)\)/);
    expect(page).toMatch(/window\.addEventListener\('hashchange', syncTabFromHash\)/);
    expect(page).toMatch(/window\.removeEventListener\('hashchange', syncTabFromHash\)/);

    // One tab bar only: the page must not render its own nav-tabs strip.
    expect(page).not.toMatch(/nav nav-tabs/);
  });

  test('the products tab reuses the products report instead of a second table', () => {
    expect(page).toMatch(/<ProductsReport itemType="sale" bind:selectedCurrency \{currencies\} \/>/);
  });

  test('the alerts fetch actually runs on a direct deep-link', () => {
    // Regression: `loading` used to start as `true` and ensureAlertsLoaded()
    // bailed out while loading, so landing straight on ?tab=quantity or
    // ?tab=expiry showed an empty page forever. The guard must be its own
    // request flag, and the initial loading state must follow the tab.
    expect(page).toMatch(/let loading = activeTab !== 'products'/);
    expect(page).toMatch(/if \(activeTab === 'products' \|\| overviewLoaded \|\| alertsRequested\) return;/);
    expect(page).not.toMatch(/\|\| loading\) return;/);
  });

  test('the stock alerts come from the cached dashboard overview', () => {
    // Only the overview is needed, and the endpoint caches it per org, so the
    // page never pulls the heavier metrics payload.
    expect(page).toMatch(/include_overview: true/);
    expect(page).toMatch(/include_metrics: false/);
    expect(page).toMatch(/buildLowStockRows\(overview\)/);
    expect(page).toMatch(/buildExpiryRows\(overview\)/);
  });
});
