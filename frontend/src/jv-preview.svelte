<!--
  Throw-away render harness for the Add Journal voucher.

  It mounts the production QuickEntryModal + AddJournal pair with a stubbed
  API so the dialog can be screenshotted on a machine with no signed-in
  session. Nothing here ships; delete with jv-preview.js and jv-preview.html.
-->
<script>
  import QuickEntryModal from './components/common/QuickEntryModal.svelte';
  import AddJournal from './pages/journals/AddJournal.svelte';
  import ToastContainer from './ToastUI/ToastContainer.svelte';
  import { t } from './i18n/i18n';

  /* Optional preselect, driven by ?account=<id> on the harness URL. */
  const params = new URLSearchParams(location.search);
  const accountId = params.get('account') ? Number(params.get('account')) : null;

  let closed = false;
  let saved = null;
  /* Mirrors the direction-aware header glyph used by JournalsIndex. */
  let headerIcon = 'ms:north_west';
  window.__jvPreview = {
    state: () => ({ closed, saved }),
  };
</script>

{#if !closed}
  <QuickEntryModal
    title={t('Add Journal')}
    subtitle=""
    icon={headerIcon}
    appearance="journal"
    dir={t('dir')}
    on:close={() => (closed = true)}>
    <AddJournal
      selectedAccountID={accountId}
      referenceModal={true}
      on:side={(event) => (headerIcon = event.detail === 'cr' ? 'ms:south_east' : 'ms:north_west')}
      on:close={() => (closed = true)}
      on:saved={(event) => (saved = event.detail)} />
  </QuickEntryModal>
{/if}

<ToastContainer />
