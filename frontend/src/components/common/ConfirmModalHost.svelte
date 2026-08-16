<script>
  import ConfirmModal from './ConfirmModal.svelte';
  import { confirmModalStore } from './confirmModalStore.js';

  let modal = null;

  $: modal = $confirmModalStore;

  function handleConfirm() {
    confirmModalStore.close(true);
  }

  function handleCancel() {
    confirmModalStore.close(false);
  }
</script>

{#if modal}
  <ConfirmModal
    open={true}
    title={modal.title}
    message={modal.message}
    confirmText={modal.confirmText}
    cancelText={modal.cancelText}
    variant={modal.variant}
    icon={modal.icon}
    closeOnOverlay={!modal.loading}
    on:confirm={handleConfirm}
    on:cancel={handleCancel} />
{/if}
