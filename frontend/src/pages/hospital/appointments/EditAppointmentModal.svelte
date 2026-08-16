<script>
    import { onMount,createEventDispatcher } from "svelte";
    import { t } from "../../../i18n/i18n";
    import AddAppointment from "./AddAppointment.svelte";
    export let appointmentId = null;


    const dispatch = createEventDispatcher();

    let modal;


    onMount(() => {
        const modalEl = document.getElementById("editAppointmentModal");
        if (window.mdb) {
            modal = new window.mdb.Modal(modalEl);
            
        }
    });

    function openModal(id) {
        appointmentId = id;
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

<div class="modal show fade" id="editAppointmentModal" tabindex="-1" aria-labelledby="editAppointmentModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="editAppointmentModalLabel"><i class='bi bi-pencil'></i> {t('Update Appointment')}</h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <AddAppointment bind:this={modalRef2} {appointmentId} on:saved={saved} />
            </div>
        </div>
    </div>
</div>