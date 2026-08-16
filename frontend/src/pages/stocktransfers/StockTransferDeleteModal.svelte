<script>
    import { stockTransferApi } from '../../api/stockTransferApi.js';
    import { journalApi } from '../../api/journalApi.js';
    import { stockTransactionApi } from '../../api/stockTransactionApi.js';
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    import { on } from "svelte/events";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    import { push } from "svelte-spa-router";
    export let stocktransfer;
    const dispatch = createEventDispatcher();
    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100;
    let loading = true;
    let stocktransfer_items = [];
    let stocktransfer_journals = [];
    let stocktransfer_stock_transactions = [];
    onMount(() => {
        loadStockTransferDetails();
    });
    async function loadStockTransferDetails() {
        if (!stocktransfer) return;
        try {
            const response = await stockTransferApi.getById(Number(stocktransfer.id));
            const data = response?.data;
            if (!data) return;
            stocktransfer = data;
            stocktransfer_items = (data.items || []).filter((item) => item.status === 1);
            const journalsResponse = await journalApi.getAll({ status: 1 });
            stocktransfer_journals = (journalsResponse?.data || []).filter(
                (j) => j.reference_type === "stock_transfer" && Number(j.reference_id) === Number(stocktransfer.id) && j.status === 1,
            );
            const stxResponse = await stockTransactionApi.getAll({ status: 1 });
            stocktransfer_stock_transactions = (stxResponse?.data || []).filter(
                (st) => st.reference_type === "stock_transfer" && Number(st.reference_id) === Number(stocktransfer.id) && st.status === 1,
            );
        } catch (err) {
            console.error(err);
        } finally {
            loading = false;
        }
        console.log("Stock Transfer details loaded:", {
            stocktransfer,
            stocktransfer_items,
            stocktransfer_journals,
            stocktransfer_stock_transactions,
        });
    }
    async function doDeleteStockTransfer() {
        saving = true;
        try {
            await stockTransferApi.remove(Number(stocktransfer.id));
            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Stock Transfer deleted successfully."),
            });
            dispatch("close");
            push(`/dashboard/stock-transfers`);
        } catch (e) {
            console.error("Error deleting stock transfer:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the stock transfer."),
                confirmButtonText: t("OK"),
            });
        } finally {
            saving = false;
        }
    }
    async function deleteStockTransfer() {
        if (confirmationText !== String(randomNumber)) {
            Swal.fire({
                icon: "error",
                title: t("Confirmation Failed"),
                text: t(
                    "Confirmation text does not match. Please type the correct number to confirm deletion.",
                ),
                confirmButtonText: t("OK"),
            });
            return;
        }
        Swal.fire({
            title: t("Are you sure?"),
            text: t(
                "Are you sure you want to delete this stock transfer? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeleteStockTransfer();
            }
        });
    }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-arrow-return-left"></i>
                    {t("Delete Stock Transfer")}
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
                        <i class="bi bi-exclamation-triangle me-2"></i>{t("Warning!")}
                    </h1>
                    <p>
                        {t("Are you sure you want to delete this stock transfer? This action cannot be undone.")}<br />
                        {t("All associated journals, items and payments will also be deleted.")}
                    </p>
                    <table>
                        <tbody>
                            <tr>
                                <td><strong>{t("Associated Items")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading
                                ? `<div class="spinner-border spinner-border-sm" role="status">
                                    <span class="visually-hidden">${t("Loading...")}</span>
                                </div>` : stocktransfer_items.length}</td>
                            </tr>
                            <tr>
                                <td><strong>{t("Associated Journals")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading 
                                ?   `<div class="spinner-border spinner-border-sm" role="status">
                                                            <span class="visually-hidden">${t("Loading...")}</span>
                                                        </div>` : stocktransfer_journals.length}</td>
                            </tr>
                            <tr>
                                <td><strong>{t("Associated Stock Transactions")}:</strong></td>
                                <td class="fw-bold ps-3">{@html loading
                                ? ` <div class="spinner-border spinner-border-sm" role="status">
                                            <span class="visually-hidden">${t("Loading...")}</span>
                                        </div>` : stocktransfer_stock_transactions.length}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="mt-4">
                        <small>
                            {t(`To confirm deletion, please type`)}
                            {randomNumber}
                            {t(`in the box below:`)}
                        </small>
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
                <button class="btn btn-secondary" on:click={() => dispatch("close")}><i class="bi bi-x-lg"></i> {t("Cancel")}</button>
                <button class="btn btn-danger" on:click={deleteStockTransfer} disabled={saving || loading}>
                    <i class="bi bi-trash"></i>{@html saving
                    ? ` <div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t("Deleting...")}</span>
                        </div>`
                    : t("Delete")}
                </button>
            </div>
        </div>
    </div>
</div>
