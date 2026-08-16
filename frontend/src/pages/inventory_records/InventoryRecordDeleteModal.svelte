<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { toast } from "../../ToastUI/toast.js";
    import { inventoryRecordApi } from "../../api/inventoryRecordApi.js";

    export let inventory_record;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
    let loading = true;

    let inventory_record_items = [];
    let inventory_record_payments = [];
    let inventory_record_returns = [];
    let inventory_record_return_items = [];

    let inventory_record_journals = [];

    let inventory_record_stock_transactions = [];

    onMount(() => {
        loadInventoryRecordDetails();
    });

    async function loadInventoryRecordDetails() {
        if (!inventory_record) return;

        const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_record.id));
        inventory_record = inventory_recordResponse?.data || inventory_record;
        inventory_record_items = (inventory_record.items || []).filter(
            (item) => Number(item.status) === 1,
        );

        loading = false;
        console.log("InventoryRecord details loaded:", {
            inventory_record,
            inventory_record_items,
        });
    }
    async function doDeleteInventoryRecord() {
        saving = true;
        try {
            /*
             * The backend soft-deletes the inventory record and related
             * items / payments / returns / journals / stock atomically.
             */
            await inventoryRecordApi.remove(Number(inventory_record.id));

            toast.success(t("Deleted!"),t("Inventory Record deleted successfully."));

            dispatch("close");

            push(`/dashboard/apartments/records`);
        } catch (e) {
            console.error("Error deleting inventory_record:", e);
            toast.error(t("Error"),t("An error occurred while deleting the inventory_record."));
            // alert(t("An error occurred while deleting the inventory_record."));
        } finally {
            saving = false;
        }
    }

    async function deleteInventoryRecord() {
        if (confirmationText !== String(randomNumber)) {
            toast.error(t("Confirmation Failed"),t("Confirmation text does not match. Please type the correct number to confirm deletion."));
            // alert(t("Confirmation text does not match. Please type the correct number to confirm deletion."));
            return;
        }
        let ok = await toast.confirm(t("Are you sure?"),t("Are you sure you want to delete this inventory_record? This action cannot be undone."));
        if (ok) {
            doDeleteInventoryRecord();
        }

    }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-arrow-return-left"></i>
                    {t("Delete InventoryRecord")}
                </h5>
                <button
                    type="button"
                    class="btn-close"
                    on:click={() => dispatch("close")}
                ></button>
            </div>
            <div class="modal-body">
                {#if saving}
                    <div class="d-flex align-items-center">
                        <strong>{t("Deleting...")}</strong>
                        <div
                            class="spinner-border ms-auto"
                            role="status"
                            aria-hidden="true"
                        ></div>
                    </div>
                {:else}
                    <h1 class="text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i>{t(
                            "Warning!",
                        )}
                    </h1>
                    <p>
                        {t(
                            "Are you sure you want to delete this inventory_record? This action cannot be undone.",
                        )}
                    </p>

                    <table>
                        <tbody>
                            <tr>
                                <td
                                    ><strong>{t("Associated Items")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : inventory_record_items.length}</td
                                >
                            </tr>
                        </tbody>
                    </table>

                    <!-- create a mini captcha system -->
                    <div class="mt-4">
                        <small
                            >{t(`To confirm deletion, please type`)}
                            {randomNumber}
                            {t(`in the box below:`)}</small
                        >
                        <input
                            type="text"
                            class="form-control form-control-sm mt-2 w-50 { confirmationText != randomNumber ? 'is-invalid':'is-valid' }"
                            bind:value={confirmationText}
                            placeholder={t(`To confirm deletion, please type`)}
                        />
                    </div>
                {/if}
            </div>
            <div class="modal-footer">
                <button
                    class="btn btn-secondary"
                    on:click={() => dispatch("close")}
                    ><i class="bi bi-x-lg"></i> {t("Cancel")}</button
                >
                <button
                    class="btn btn-danger"
                    on:click={deleteInventoryRecord}
                    disabled={saving || loading}
                    ><i class="bi bi-trash"></i>
                    {@html saving
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Deleting...")}</span>
</div>`
                        : t("Delete")}</button
                >
            </div>
        </div>
    </div>
</div>
