<!--
  Throw-away render harness for the Add Exchange voucher.

  It mounts the production QuickEntryModal + AddExchange pair with a stubbed
  API so the dialog can be screenshotted on a machine with no signed-in
  session. Nothing here ships; delete with xe-preview.js and xe-preview.html.
-->
<script>
  import QuickEntryModal from './components/common/QuickEntryModal.svelte';
  import AddExchange from './pages/exchanges/AddExchange.svelte';
  import ToastContainer from './ToastUI/ToastContainer.svelte';
  import { t } from './i18n/i18n';

  /* Optional preselect, driven by ?account=<id> on the harness URL. */
  const params = new URLSearchParams(location.search);
  const accountId = params.get('account') ? Number(params.get('account')) : null;

  let closed = false;
  let saved = null;

  window.__xePreview = {
    state: () => ({ closed, saved }),
  };
</script>

{#if !closed}
  <QuickEntryModal
    title={t('Add Exchange')}
    subtitle=""
    icon="bi-currency-exchange"
    appearance="exchange"
    dir={t('dir')}
    on:close={() => (closed = true)}>
    <AddExchange
      selectedAccountID={accountId}
      on:close={() => (closed = true)}
      on:saved={(event) => (saved = event.detail)} />
  </QuickEntryModal>
{/if}

<ToastContainer />
