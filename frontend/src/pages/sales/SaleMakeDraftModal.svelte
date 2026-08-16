<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";
    import { toast } from "../../ToastUI/toast.js";
    import ConfirmActionModal from "../../components/common/ConfirmActionModal.svelte";
    import { saleApi } from "../../api/saleApi.js";
    import { journalApi } from "../../api/journalApi.js";

    export let sale;

    const dispatch = createEventDispatcher();

    let saving = false;
    let loading = true;

    let sale_items = [];
    let sale_payments = [];
    let sale_returns = [];
    let sale_return_items = [];
    

    let sale_journals = [];

    let sale_stock_transactions = [];

    onMount(() => {
        loadSaleDetails();
    });

    async function loadSaleDetails() {
        if (!sale) return;

        const saleResponse = await saleApi.getById(Number(sale.id));
        sale = saleResponse?.data || sale;
        // Load sale items
        sale_items = (sale.items || []).filter((item) => Number(item.status) === 1);

        // Load payments
        sale_payments = (sale.payments || []).filter((p) => Number(p.status) === 1);

        // Load returns
        sale_returns = (sale.returns || []).filter((r) => Number(r.status) === 1);

        const returnIds = sale_returns.map((r) => r.id);
        if (returnIds.length > 0) {
            sale_return_items = sale_returns.flatMap(
                (r) => (r.items || []).filter((ri) => Number(ri.status) === 1),
            );
        }

        // Load associated journals
        sale_journals =
            (await journalApi.getAll({
                status: 1,
                reference_type: 'sale',
                reference_id: sale.id,
            }))?.data || [];

        // Load associated stock transactions
        sale_stock_transactions = [];

        // append sale_return journals to sale journals for unified display
        for (const ret of sale_returns) {
            const retJournals =
                (await journalApi.getAll({
                    status: 1,
                    reference_type: 'sale_return',
                    reference_id: ret.id,
                }))?.data || [];
            sale_journals = sale_journals.concat(retJournals);
        }

        for (const p of sale_payments) {
            const paymentJournals =
                (await journalApi.getAll({
                    status: 1,
                    reference_type: 'sale_payment',
                    reference_id: p.id,
                }))?.data || [];
            sale_journals = sale_journals.concat(paymentJournals);
        }

        loading = false;
        console.log("Sale details loaded:", {
            sale,
            sale_items,
            sale_payments,
            sale_returns,
            sale_return_items,
            sale_journals,
            sale_stock_transactions,
        });
    }
    async function doDraftSale() {
        saving = true;
        try {
            /*
             * The backend restores the deducted stock and soft-deletes
             * the sale journal, payments and returns atomically when a
             * confirmed sale is reverted to draft.
             */
            await saleApi.update(sale.id, { invoice_status: "draft" });

            toast.success(t("Drafted!"), t("Sale drafted successfully."));

            dispatch("close");

            push(`/dashboard/sale-form/${sale.id}`);
        } catch (e) {
            console.error("Error drafting sale:", e);
            toast.error(t("Error"), t("An error occurred while drafting the sale."));
            // alert(t("An error occurred while drafting the sale."));
        } finally {
            saving = false;
        }
    }
</script>

<ConfirmActionModal
    title={t("Make Draft")}
    icon="bi-file-earmark"
    variant="warning"
    {loading}
    {saving}
    savingLabel={t("Making Draft...")}
    warningMessage={t("Are you sure you want to make this sale a draft? This action cannot be undone.")}
    warningDetail={t("All associated journals, items and payments will also be deleted.")}
    stats={[
        { label: t("Associated Payments"), value: loading ? "…" : sale_payments.length },
        { label: t("Associated Returns"), value: loading ? "…" : sale_returns.length },
        { label: t("Associated Return Items"), value: loading ? "…" : sale_return_items.length },
        { label: t("Associated Journals"), value: loading ? "…" : sale_journals.length },
        { label: t("Associated Stock Transactions"), value: loading ? "…" : sale_stock_transactions.length },
    ]}
    actionLabel={t("Make Draft")}
    actionIcon="bi-file-earmark"
    actionVariant="warning"
    inputId="draft-sale-confirm-input"
    confirmPrompt={{
        title: t("Are you sure?"),
        message: t("Are you sure you want to make this sale a draft? This action cannot be undone."),
        confirmText: t("Yes, draft it!"),
        cancelText: t("No, keep it"),
        variant: "warning",
        icon: "bi-file-earmark",
    }}
    on:confirm={doDraftSale}
    on:close={() => dispatch("close")} />

