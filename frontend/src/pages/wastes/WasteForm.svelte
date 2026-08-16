<script>
    import { onMount, createEventDispatcher } from "svelte";
    import WasteItemsTable from "./WasteItemsTable.svelte";
    import Swal from "sweetalert2";

    import { t } from "../../i18n/i18n";

    export let wasteId = null;
    const dispatch = createEventDispatcher();

import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { productApi } from '../../api/productApi.js';
import { wasteApi } from '../../api/wasteApi.js';

    let warehouses = [];
    let currencies = [];
    let items = [];

    let form = {
        warehouse_id: "",
        reference_number: "",
        date: new Date().toISOString().slice(0, 10),
        description: "",
        currency: "",
        waste_status: "draft",
        status: 1,
    };

    let loading = false;

    onMount(async () => {
        warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
        currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
        const defaultCurrency = currencies.find((c) => c.isDefault == 1);
        if (defaultCurrency && !form.currency)
            form.currency = defaultCurrency.code;

        if (wasteId) await loadWaste(wasteId);
    });

    async function loadWaste(id) {
        const response = await wasteApi.getById(Number(id));
        const w = response?.data;
        if (!w || Number(w.status) !== 1) return;
        form = {
            warehouse_id: w.warehouse_id,
            reference_number: w.reference_number,
            date: w.date,
            description: w.description,
            currency: w.currency,
            waste_status: w.waste_status,
            status: w.status,
        };

        const wItems = (w.items || []).filter((i) => Number(i.status) === 1);
        const productIds = wItems.map((i) => i.product_id);
        const products = (await productApi.getAll({ status: 1 }))?.data || [];
        items = wItems.map((i) => ({
            product_id: i.product_id,
            product_name:
                products.find((p) => p.id === i.product_id)?.name || "Unknown",
            product_unit_id: i.product_unit_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal,
        }));
    }

    $: total_amount = items.reduce((s, i) => s + i.subtotal, 0);

    async function saveWaste(confirm = false) {
        if (!form.warehouse_id || items.length === 0) {
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("Warehouse and items are required."),
                confirmButtonText: t("OK"),
            });
            return;
        }
        loading = true;
        try {
            const payload = {
                warehouse_id: form.warehouse_id,
                reference_number: form.reference_number,
                date: form.date,
                description: form.description,
                currency: form.currency,
                waste_status: confirm ? "confirmed" : "draft",
                status: form.status,
                total_amount: total_amount,
                items: items.map((it) => ({
                    product_id: it.product_id,
                    product_unit_id: it.product_unit_id,
                    quantity: it.quantity,
                    unit_price: it.unit_price,
                    currency: form.currency,
                    subtotal: it.subtotal,
                    status: 1,
                })),
            };

            if (wasteId) {
                await wasteApi.update(Number(wasteId), payload);
            } else {
                await wasteApi.create(payload);
            }

            form.waste_status = confirm ? "confirmed" : "draft";
            Swal.fire({
                icon: "success",
                title: t("Success"),
                text: confirm ? t("Waste recorded.") : t("Draft saved."),
                confirmButtonText: t("OK"),
            });
            resetForm();
            dispatch("back");
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: t("Error"),
                text: t("Error saving waste: ") + err.message,
                confirmButtonText: t("OK"),
            });
        }
        loading = false;
    }

    function resetForm() {
        form = {
            ...form,
            warehouse_id: "",
            reference_number: "",
            date: new Date().toISOString().slice(0, 10),
            description: "",
        };
        items = [];
    }
</script>

<div class="container-fluid mt-4">
    <div class="card shadow-2">
        <div class="card-body">
            <h4 class="mb-4">{wasteId ? t("Edit Waste") : t("New Waste")}</h4>

            <div class="row g-3">
                <div class="col-md-3">
                    <input
                        readonly
                        type="text"
                        class="form-control"
                        value="{t('Ref #')}: {form.reference_number}"
                    />
                </div>
                <div class="col-md-3">
                    <input
                        type="date"
                        class="form-control"
                        bind:value={form.date}
                    />
                </div>
                <div class="col-md-3">
                    <select class="form-select" bind:value={form.warehouse_id}>
                        <option value="">{t("Select Warehouse")}</option>
                        {#each warehouses as w}
                            <option value={w.id}>{w.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <select class="form-select" bind:value={form.currency}>
                        {#each currencies as c}
                            <option value={c.code}>{t(c.code)}</option>
                        {/each}
                    </select>
                </div>

                <div class="col-md-12 mt-3">
                    <textarea
                        class="form-control"
                        rows="2"
                        bind:value={form.description}
                        placeholder={t("Description")}
                    ></textarea>
                </div>
            </div>
        </div>
    </div>

    <WasteItemsTable
        bind:items
        currency={form.currency}
        warehouse_id={form.warehouse_id}
    />

    <div class="card shadow-2 mt-4">
        <div
            class="card-body d-flex justify-content-between align-items-center"
        >
            <h5 class="mb-0">
                Total: <span class="text-primary"
                    >{total_amount.toFixed(2)} {form.currency}</span
                >
            </h5>
            <div>
                <button
                    class="btn btn-secondary me-2"
                    on:click={() => saveWaste(false)}
                    disabled={loading}>{t("Save Draft")}</button
                >
                <button
                    class="btn btn-success"
                    on:click={() => saveWaste(true)}
                    disabled={loading}>{t("Confirm Waste")}</button
                >
            </div>
        </div>
    </div>
</div>
