<script>
  import { purchaseApi } from "../../api/purchaseApi.js";
  import { journalApi } from "../../api/journalApi.js";
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";

    import { stockTransactionApi } from '../../api/stockTransactionApi.js';
    export let purchase;

    const dispatch = createEventDispatcher();

    let saving = false;
    let loading = true;

    let purchase_items = [];
    let purchase_payments = [];
    let purchase_returns = [];
    let purchase_return_items = [];

    let purchase_journals = [];

    let purchase_stock_transactions = [];

    onMount(() => {
        loadPurchaseDetails();
    });

    async function loadPurchaseDetails() {
        if (!purchase) return;

        const response = await purchaseApi.getById(Number(purchase.id));
        purchase = response?.data;
        // Load purchase items
        purchase_items = (purchase.items || []).filter((item) => Number(item.status) === 1);

        // Load payments
        purchase_payments = (purchase.payments || []).filter((p) => Number(p.status) === 1);

        // Load returns
        purchase_returns = (purchase.returns || []).filter((r) => Number(r.status) === 1);

        purchase_return_items = purchase_returns.flatMap((r) => r.items || []);

        // Load associated journals (online)
        const journalResponse =
            await journalApi.getAll({
                status: 1,
                reference_id: purchase.id,
                reference_type: "purchase",
            });

        purchase_journals = journalResponse?.data || [];

        // Load associated stock transactions
        purchase_stock_transactions = (await stockTransactionApi.getAll({ status: 1, reference_type: "purchase", reference_id: purchase.id }))?.data || [];

        // append purchase return transactions to purchase stock transactions for unified display
        for (const ret of purchase_returns) {
            const retTrans = (await stockTransactionApi.getAll({ status: 1, reference_type: "purchase_return", reference_id: ret.id }))?.data || [];
            purchase_stock_transactions = purchase_stock_transactions.concat(retTrans);
        }

        // append purchase_return/payment journals for unified display
        const purchaseRefs = [
            ...purchase_returns.map((r) => r.id),
            ...purchase_payments.map((p) => p.id),
        ];

        if (purchaseRefs.length > 0) {
            const refJournalResponse =
                await journalApi.getAll({ status: 1, reference_ids: purchaseRefs });

            purchase_journals = purchase_journals.concat(
                (refJournalResponse?.data || []).filter(
                    (j) =>
                        j.reference_type === "purchase_return" ||
                        j.reference_type === "purchase_payment",
                ),
            );
        }
        loading = false;
    }
    async function doDeletePurchase() {
        saving = true;
        try {
            /*
             * ONE authoritative request. The backend reverses the whole
             * document inside a single transaction — returns, payments
             * (with their journals and the purchase remaining balance),
             * product / warehouse quantities, stock movements, FIFO/LIFO
             * batch layers and the posted purchase journal — and then
             * soft-deletes the purchase header and its items.
             *
             * The frontend must never delete stock transactions or
             * recalculate product stock itself: inventory history is kept
             * as explicit compensating movements, and a failure rolls the
             * whole reversal back.
             */
            await purchaseApi.remove(purchase.id);

            toast.success(t("Deleted!"), t("Purchase deleted successfully."));

            dispatch("close");

            push(`/dashboard/purchases`);
        } catch (e) {
            console.error("Error deleting purchase:", e);

            if (e?.code === "PURCHASE_STOCK_ALREADY_CONSUMED") {
                toast.error(
                    t("Cannot Delete"),
                    e?.message ||
                        t("This purchase's stock has already been used by a later sale, transfer or waste."),
                );
            } else {
                toast.error(
                    t("Error"),
                    e?.message || t("An error occurred while deleting the purchase."),
                );
            }
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Delete Purchase")}
    icon="bi-trash"
    variant="danger"
    dangerAlert
    {loading}
    {saving}
    savingLabel={t("Deleting...")}
    warningMessage={t("Are you sure you want to delete this purchase? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Items"), value: loading ? "…" : purchase_items.length },
        { label: t("Associated Payments"), value: loading ? "…" : purchase_payments.length },
        { label: t("Associated Returns"), value: loading ? "…" : purchase_returns.length },
        { label: t("Associated Return Items"), value: loading ? "…" : purchase_return_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : purchase_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : purchase_stock_transactions.length },
    ]}
    actionLabel={t("Delete")}
    actionIcon="bi-trash"
    actionVariant="danger"
    inputId="delete-purchase-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to delete this purchase? This action cannot be undone."),
        confirmText: t("Yes, delete it!"),
        cancelText: t("No, keep it"),
        variant: "danger",
        icon: "bi-trash",
    }}
    on:confirm={doDeletePurchase}
    on:close={() => dispatch("close")} />
