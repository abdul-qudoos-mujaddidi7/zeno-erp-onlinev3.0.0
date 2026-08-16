<script>
    import { onMount,createEventDispatcher } from "svelte";
    import { t } from "../../i18n/i18n";
    import AddJournal from "./AddJournal.svelte";
    export let journalId = null;
    const dispatch = createEventDispatcher();
    let modal;
    let editJournalModalEL;
    onMount(() => {
        
    });

    function openModal(id) {
        journalId = id;
        const modal = new window.mdb.Modal(editJournalModalEL);
        if (modal) {
            modal.show();
        }
        modalRef2.modalOpened(id);
    }

    function closeModal() {
        const modal = new window.mdb.Modal(editJournalModalEL);
        if (modal) {
            modal.hide();
        }
    }

    function saved() {
        closeModal();
        dispatch("saved");
    }

    export { openModal, closeModal };
    
    let modalRef2;

    import { auth } from '../../auth/authStore';

    $: permissions = $auth.permissions;
</script>

{#if !permissions?.some((p) => p.code === 'Journals' && p.edit)}
  <!-- <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3> -->
{:else}

<div class="modal show fade" bind:this={editJournalModalEL} tabindex="-1" aria-labelledby="editJournalModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="editJournalModalLabel"><i class='bi bi-pencil'></i> {t('Update Journal')}</h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <AddJournal bind:this={modalRef2} {journalId} on:saved={saved} />
            </div>
        </div>
    </div>
</div>

{/if}