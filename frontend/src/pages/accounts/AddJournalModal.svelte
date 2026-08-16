<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t } from '../../i18n/i18n';
  import AddJournal from '../journals/AddJournal.svelte';
  const dispatch = createEventDispatcher();
  let modal;
  onMount(() => {
    const modalEl = document.getElementById('editJournalModal');
    if (window.mdb) {
      modal = new window.mdb.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false,
      });
    }
  });

  export let accounts = [];
  let shareHolderAccounts = [];
  export let genInp = null;

  function openModal(inp) {
    shareHolderAccounts = accounts.filter((a) => a.account_type_id == 7);
    shareHolderAccounts.forEach((sa, i) => {
      sa.show = true;
    });
    if (modal) {
      modal.show();
    }
  }

  function closeModal() {
    if (modal) {
      modal.hide();
    }

    dispatch('closed');
  }

  function saved() {
    closeModal();
    dispatch('saved');
  }

  export { openModal, closeModal };

  let modalRefs = [];

  import { auth } from '../../auth/authStore';
  
  $: permissions = $auth.permissions;
</script>

{#if permissions?.some((p) => p.code === 'Journals' && p.edit)}
  <div
    class="modal show fade"
    id="editJournalModal"
    tabindex="-1"
    aria-labelledby="editJournalModalLabel"
    aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered journal-dialog">
      <div class="modal-content journal-modal-content">
        <div class="modal-header journal-modal-header">
          <div class="modal-heading">
            <span class="modal-heading-icon"><i class="bi bi-journal-plus"></i></span>
            <div>
              <span class="modal-eyebrow">{t('Journal')}</span>
              <h5 class="modal-title" id="editJournalModalLabel">{t('Add Journal')}</h5>
            </div>
          </div>
          <button type="button" class="journal-close" on:click={closeModal} aria-label={t('Close')}><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="modal-body journal-modal-body">
          <section class="dividend-summary">
            <span class="summary-icon"><i class="bi bi-pie-chart"></i></span>
            <div class="summary-copy"><small>{t('Total')}{t('-of-')}{t('Dividends')}</small><strong dir="ltr" class:negative={genInp && Number(genInp[1]) < 0}>{genInp ? Number(genInp[1]).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '0.00'} <em>{genInp ? t(genInp[0]) : ''}</em></strong></div>
          </section>
          <div class="journal-forms">
          {#each shareHolderAccounts as shareHolder, index}
            {#if shareHolder.show}
              <AddJournal
                bind:this={modalRefs[index]}
                {genInp}
                selectedAccountID={shareHolder.id}
                on:saved={() => {
                  shareHolder.show = false;
                }} />
            {/if}
          {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .journal-modal-content{overflow:hidden;border:0;border-radius:16px;background:var(--mdb-body-bg,#fff);box-shadow:0 24px 70px rgba(15,23,42,.22)}
  .journal-modal-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e5eaf2;background:#fbfcfe}
  .modal-heading{display:flex;align-items:center;gap:10px}.modal-heading-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#eaf1ff;color:#0f6efd;font-size:16px}.modal-heading div{display:flex;flex-direction:column}.modal-eyebrow{color:#7a879b;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.modal-title{margin:0;color:#18243a;font-size:15px;font-weight:800}.journal-close{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:#78869a;font-size:16px}.journal-close:hover{background:#eef2f7;color:#e04444}
  .journal-modal-body{padding:16px 18px 18px}.dividend-summary{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid #dce6f6;border-radius:12px;background:linear-gradient(145deg,#f9fbff,#f2f6ff)}.summary-icon{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:11px;background:#fff;color:#3165cc;box-shadow:0 3px 10px rgba(39,83,170,.1)}.summary-copy{display:flex;min-width:0;flex-direction:column}.summary-copy small{color:#748299;font-size:10px;font-weight:700}.summary-copy strong{color:#173b82;font-size:20px;font-weight:850;font-variant-numeric:tabular-nums}.summary-copy strong.negative{color:#dc3f4f}.summary-copy em{color:#66758c;font-size:11px;font-style:normal}.journal-forms{margin-top:12px}
  @media(max-width:700px){.journal-dialog{margin:.65rem}.journal-modal-header,.journal-modal-body{padding:12px}.summary-copy strong{font-size:17px}}
</style>
