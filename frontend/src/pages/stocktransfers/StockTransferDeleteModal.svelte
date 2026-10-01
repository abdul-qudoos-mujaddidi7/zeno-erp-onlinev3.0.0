<script>
    import { stockTransferApi } from '../../api/stockTransferApi.js';
    import { journalApi } from '../../api/journalApi.js';
    import { stockTransactionApi } from '../../api/stockTransactionApi.js';
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    import { push } from "svelte-spa-router";
    export let stocktransfer;
    const dispatch = createEventDispatcher();
    let saving = false;
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
            const journalsResponse = await journalApi.getAll({
                status: 1,
                reference_type: 'stock_transfer',
                reference_id: Number(stocktransfer.id),
            });
            stocktransfer_journals = (journalsResponse?.data || []).filter(
                (j) => j.status === 1,
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
            toast.success(t("Deleted!"), t("Stock Transfer deleted successfully."));
            dispatch("close");
            push(`/dashboard/stock-transfers`);
        } catch (e) {
            console.error("Error deleting stock transfer:", e);
            toast.error(t("Error"), t("An error occurred while deleting the stock transfer."));
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Delete Stock Transfer")}
    icon="bi-trash"
    variant="danger"
    dangerAlert
    {loading}
    {saving}
    savingLabel={t("Deleting...")}
    warningMessage={t("Are you sure you want to delete this stock transfer? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Items"), value: loading ? "…" : stocktransfer_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : stocktransfer_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : stocktransfer_stock_transactions.length },
    ]}
    actionLabel={t("Delete")}
    actionIcon="bi-trash"
    actionVariant="danger"
    inputId="delete-stock-transfer-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to delete this stock transfer? This action cannot be undone."),
        confirmText: t("Yes, delete it!"),
        cancelText: t("No, keep it"),
        variant: "danger",
        icon: "bi-trash",
    }}
    on:confirm={doDeleteStockTransfer}
    on:close={() => dispatch("close")} />
