<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { t, lang, translate_org_type } from "../../../i18n/i18n.js";
    import Swal from "sweetalert2";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { push } from "svelte-spa-router";

import { journalApi } from '../../../api/journalApi.js';
import { stockTransactionApi } from '../../../api/stockTransactionApi.js';
import { prescriptionApi } from '../../../api/prescriptionApi.js';
    export let prescription;

    const dispatch = createEventDispatcher();

    let saving = false;
    let confirmationText = "";
    let randomNumber = Math.floor(Math.random() * 900) + 100;
    let loading = true;

    let prescription_items = [];
    let prescription_payments = [];
    let prescription_returns = [];
    let prescription_return_items = [];

    let prescription_journals = [];

    let prescription_stock_transactions = [];

    onMount(() => {
        loadPrescriptionDetails();
    });

    async function loadPrescriptionDetails() {
        if (!prescription) return;

        const response = await prescriptionApi.getById(Number(prescription.id));
        prescription = response?.data;
        prescription_items = (prescription.items || []).filter((item) => Number(item.status) === 1);
        prescription_payments = (prescription.payments || []).filter((p) => Number(p.status) === 1);
        prescription_returns = (prescription.returns || []).filter((r) => Number(r.status) === 1);
        prescription_return_items = prescription_returns.flatMap((r) => r.items || []);

        prescription_journals = (await journalApi.getAll({ status: 1, reference_type: "prescription", reference_id: prescription.id }))?.data || [];
        prescription_stock_transactions = (await stockTransactionApi.getAll({ status: 1, reference_type: "prescription", reference_id: prescription.id }))?.data || [];

        for (const ret of prescription_returns) {
            const retTrans = (await stockTransactionApi.getAll({ status: 1, reference_type: "prescription_return", reference_id: ret.id }))?.data || [];
            prescription_stock_transactions = prescription_stock_transactions.concat(retTrans);
        }

        for (const ret of prescription_returns) {
            const retJournals = (await journalApi.getAll({ status: 1, reference_type: "prescription_return", reference_id: ret.id }))?.data || [];
            prescription_journals = prescription_journals.concat(retJournals);
        }

        for (const p of prescription_payments) {
            const paymentJournals = (await journalApi.getAll({ status: 1, reference_type: "prescription_payment", reference_id: p.id }))?.data || [];
            prescription_journals = prescription_journals.concat(paymentJournals);
        }

        loading = false;
    }
    async function doDeletePrescription() {
        saving = true;
        try {
            await prescriptionApi.remove(prescription.id);

            Swal.fire({
                icon: "success",
                title: t("Deleted!"),
                text: t("Prescription deleted successfully."),
            });

            dispatch("close");

            push(`/dashboard/prescriptions`);
        } catch (e) {
            console.error("Error deleting prescription:", e);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("An error occurred while deleting the prescription."),
                confirmButtonText: t("OK"),
            });
        } finally {
            saving = false;
        }
    }

    async function deletePrescription() {
        if (confirmationText !== String(randomNumber)) {
            Swal.fire({
                icon: "error",
                title: t("Confirmation Failed"),
                text: t(
                    "Confirmation text does not match. Please type the correct number to confirm deletion.",
                ),
                confirmButtonText: t("OK"),
            });
            // alert(t("Confirmation text does not match. Please type the correct number to confirm deletion."));
            return;
        }
        Swal.fire({
            title: t("Are you sure?"),
            text: t(
                "Are you sure you want to delete this prescription? This action cannot be undone.",
            ),
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: t("Yes, delete it!"),
            cancelButtonText: t("No, keep it"),
        }).then((result) => {
            if (result.isConfirmed) {
                doDeletePrescription();
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
                    {t("Delete Prescription")}
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
                            "Are you sure you want to delete this prescription? This action cannot be undone.",
                        )}<br />
                        {t(
                            "All associated journals, items and payments will also be deleted.",
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
                                        : prescription_items.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Payments")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : prescription_payments.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Returns")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : prescription_returns.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong
                                        >{t("Associated Return Items")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : prescription_return_items.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong>{t("Associated Journals")}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : prescription_journals.length}</td
                                >
                            </tr>
                            <tr>
                                <td
                                    ><strong
                                        >{t(
                                            "Associated Stock Transactions",
                                        )}:</strong
                                    ></td
                                >
                                <td class="fw-bold ps-3"
                                    >{@html loading
                                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t("Loading...")}</span>
</div>`
                                        : prescription_stock_transactions.length}</td
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
                    on:click={deletePrescription}
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
