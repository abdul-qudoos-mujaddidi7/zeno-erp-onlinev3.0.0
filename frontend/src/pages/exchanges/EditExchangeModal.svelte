<script>
    import { onMount,createEventDispatcher } from "svelte";
    import { t } from "../../i18n/i18n";
    import AddExchange from "./AddExchange.svelte";
    export let exchangeId = null;


    const dispatch = createEventDispatcher();

    let modal;


    onMount(() => {
        const modalEl = document.getElementById("editExchangeModal");
        if (window.mdb) {
            modal = new window.mdb.Modal(modalEl);
            
        }
    });

    function openModal(id) {
        exchangeId = id;
        if (modal) {
            modal.show();
        }
        modalRef2.modalOpened(id);
    }

    function closeModal() {
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


</script>

<div class="modal show fade" id="editExchangeModal" tabindex="-1" aria-labelledby="editExchangeModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="editExchangeModalLabel"><i class='bi bi-pencil'></i> {t('Update Exchange')}</h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <AddExchange bind:this={modalRef2} {exchangeId} on:saved={saved} />
            </div>
        </div>
    </div>
</div>