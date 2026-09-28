<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../i18n/i18n.js';

  $: _lang = $lang;

  // Chrome/Edge/Android only expose this once the app is installable. The raw
  // event is captured in index.html so it cannot be missed, and mirrored here.
  let installPrompt = null;
  let installed = false;

  function isRunningAsApp() {
    if (typeof window === 'undefined') return false;
    try {
      return (
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
        window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
        window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true ||
        window.navigator.standalone === true // iOS home screen app
      );
    } catch (e) {
      return false;
    }
  }

  function syncWithWindow() {
    if (window.__zenoPwaInstalled || isRunningAsApp()) {
      installed = true;
      installPrompt = null;
      return;
    }
    installPrompt = window.__zenoPwaInstallEvent || null;
  }

  function handleInstallPrompt(event) {
    event.preventDefault();
    // Nothing to offer once the application is already installed.
    if (installed || window.__zenoPwaInstalled || isRunningAsApp()) return;
    installPrompt = event;
  }

  function handleInstalled() {
    installPrompt = null;
    window.__zenoPwaInstallEvent = null;
    installed = true;
  }

  onMount(() => {
    syncWithWindow();

    // The custom events come from the early capture script in index.html; the
    // native listeners cover the case where that script is not present.
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('zeno-pwa-installprompt', syncWithWindow);
    window.addEventListener('zeno-pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('zeno-pwa-installprompt', syncWithWindow);
      window.removeEventListener('zeno-pwa-installed', handleInstalled);
    };
  });

  async function installApp() {
    const prompt = installPrompt;
    if (!prompt) return;

    // A captured prompt can only be used once.
    installPrompt = null;
    window.__zenoPwaInstallEvent = null;

    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      installed = choice?.outcome === 'accepted';
    } catch (error) {
      console.warn('Install prompt failed:', error);
    }
  }
</script>

{#if installPrompt && !installed}
  <button
    type="button"
    class="install-pwa-btn"
    title={t('Install ZenoERP')}
    aria-label={t('Install ZenoERP')}
    on:click={installApp}>
    <i class="bi bi-download" aria-hidden="true"></i>
    <span>{t('Install ZenoERP')}</span>
  </button>
{/if}

<style>
  .install-pwa-btn {
    display: inline-flex;
    flex-shrink: 0;
    gap: 0.35rem;
    align-items: center;
    height: var(--control-height-sm, 2.125rem);
    padding-inline: 0.6rem;
    border: 1px solid #cfe0ff;
    border-radius: 9px;
    background: var(--erp-primary-soft, #eaf2ff);
    color: var(--erp-primary, #2f6fed);
    font-size: var(--app-font-xs, 0.78rem);
    font-weight: 850;
    white-space: nowrap;
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .install-pwa-btn:hover {
    border-color: var(--erp-primary, #2f6fed);
    transform: translateY(-1px);
    box-shadow: 0 5px 12px rgba(21, 32, 51, 0.08);
  }

  .install-pwa-btn i {
    font-size: 0.9rem;
  }

  @media (max-width: 767px) {
    .install-pwa-btn {
      width: var(--control-height-sm, 2.125rem);
      justify-content: center;
      padding-inline: 0;
    }

    .install-pwa-btn span {
      display: none;
    }
  }
</style>
