import { mount, unmount } from 'svelte'
import App from './App.svelte'
import { ensureProductUnitsLoaded } from './pages/stocktransactions/calculateStock.js'
import { registerSW } from 'virtual:pwa-register'
import './app.css'
import 'material-symbols/rounded.css'
import './components/common/quick-action-modal.css'
import './components/common/track-picker.css'
import { initGlobalDatePickers } from './calendar.js'
import { applyMdbStylesheet } from './lib/mdbTheme.js'
import { installTableCards } from './utils/tableCards.js'

const langCode = localStorage.getItem('lang') || 'fa';
const isRtl = langCode === 'fa' || langCode === 'ps';
document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
document.documentElement.lang = langCode;
applyMdbStylesheet(isRtl);

// Tables that are wider than a phone screen read as cards instead of forcing
// the user to drag the row sideways to reach the amount and the actions.
// Once per page: a second observer would re-scan every table twice.
if (!window.__zenoTablesInstalled) {
  window.__zenoTablesInstalled = true;
  installTableCards();
}

const hash = window.location.hash || '';
if (hash.startsWith('#/dashboard') || hash.startsWith('#/pos')) {
  ensureProductUnitsLoaded().catch((error) => {
    console.warn('Failed to preload product units:', error);
  });
}

/*
 * Boot the app exactly once.
 *
 * This module can be evaluated more than once in development — an HMR pass
 * that re-runs the entry, or the dev service worker handing the page back to
 * Vite — and `mount()` *appends* to its target instead of replacing it. A
 * second evaluation therefore left the whole application (sidebar, topbar and
 * the current form) drawn twice, one shell below the other.
 *
 * Tearing down the previous instance and emptying the container first makes a
 * repeated boot a redraw rather than a duplicate.
 */
const target = document.getElementById('app')

if (window.__zenoApp) {
  try {
    unmount(window.__zenoApp)
  } catch (error) {
    // The previous tree was already removed (e.g. a hot update replaced it).
  }
  window.__zenoApp = null
}

target?.replaceChildren()

const app = mount(App, {
  target,
  intro: true,
})

window.__zenoApp = app

if (!window.__zenoBooted) {
  window.__zenoBooted = true
  initGlobalDatePickers()
}

/* ---------------------------------------------------------------------------
 * PWA service worker (static assets only - the app stays online-only)
 * ------------------------------------------------------------------------- */
let reloadPending = false;

// Never reload while the user is typing or has a dialog open, otherwise an
// in-progress form / modal would be lost.
function appIsBusy() {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return false;

  const active = document.activeElement;
  if (
    active &&
    (active.isContentEditable ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT')
  ) {
    return true;
  }

  const overlays = document.querySelectorAll(
    '[aria-modal="true"], .modal.show, .swal2-container, .quick-action-modal',
  );
  for (const overlay of overlays) {
    if (overlay.offsetParent !== null) return true;
  }

  return false;
}

function reloadWhenIdle() {
  if (!reloadPending) return;
  if (appIsBusy()) {
    setTimeout(reloadWhenIdle, 15000);
    return;
  }
  window.location.reload();
}

// Registering twice would add a second set of update listeners to the same
// registration, so only the first evaluation of this module registers it.
if (!window.__zenoSwRegistered) {
  window.__zenoSwRegistered = true;

  registerSW({
    immediate: true,
    // Called by vite-plugin-pwa when a freshly activated version is waiting for
    // the page to pick up the new assets.
    onNeedReload() {
      reloadPending = true;
      reloadWhenIdle();
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      // Look for a new version when the tab becomes visible again and at most
      // once an hour for long running sessions.
      const checkForUpdate = () => {
        registration.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      setInterval(checkForUpdate, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed:', error);
    },
  })
}

export default app
