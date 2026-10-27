<script>
  import { createEventDispatcher } from 'svelte';
  import { t } from '../../i18n/i18n';
  import { auth } from '../../auth/authStore';
  import AddJournal from './AddJournal.svelte';
  import QuickEntryModal from '../../components/common/QuickEntryModal.svelte';

  export let journalId = null;

  const dispatch = createEventDispatcher();

  let showModal = false;
  let editJournalIcon = 'ms:north_west';

  $: permissions = $auth.permissions;

  function openModal(id) {
    journalId = id;
    editJournalIcon = 'ms:north_west';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  function saved() {
    closeModal();
    dispatch('saved');
  }

  export { openModal, closeModal };
</script>

{#if permissions?.some((permission) => permission.code === 'Journals' && permission.edit) && showModal}
  <QuickEntryModal
    title={t('Update Journal')}
    icon={editJournalIcon}
    appearance="journal"
    dir={t('dir')}
    on:close={closeModal}>
    <AddJournal
      {journalId}
      on:side={(event) =>
        (editJournalIcon = event.detail === 'cr' ? 'ms:south_east' : 'ms:north_west')}
      on:saved={saved}
      on:close={closeModal} />
  </QuickEntryModal>
{/if}
