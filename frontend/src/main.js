import { mount } from 'svelte'
import App from './App.svelte'
import { ensureProductUnitsLoaded } from './pages/stocktransactions/calculateStock.js'
import { registerSW } from 'virtual:pwa-register'
import './app.css'
import './components/common/quick-action-modal.css'
import './components/common/track-picker.css'
import { initGlobalDatePickers } from './calendar.js'
import { applyMdbStylesheet } from './lib/mdbTheme.js'

const langCode = localStorage.getItem('lang') || 'fa';
const isRtl = langCode === 'fa' || langCode === 'ps';
document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
document.documentElement.lang = langCode;
applyMdbStylesheet(isRtl);

const hash = window.location.hash || '';
if (hash.startsWith('#/dashboard') || hash.startsWith('#/pos')) {
  ensureProductUnitsLoaded().catch((error) => {
    console.warn('Failed to preload product units:', error);
  });
}

const app = mount(App, {
  target: document.getElementById('app'),
  intro: true,
})

initGlobalDatePickers()

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

export default app
