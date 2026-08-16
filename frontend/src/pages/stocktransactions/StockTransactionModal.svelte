<script>
    import { createEventDispatcher, onMount } from "svelte";
    import { stockTransactionApi } from "../../api/stockTransactionApi.js";
    import { t, lang, translate_org_type } from '../../i18n/i18n';
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    export let warehouses = [];
    export let products = [];
    export let productUnits = [];
    const dispatch = createEventDispatcher();
    export let transaction = null;
    let id = null;
    let warehouse_id = "";
    let product_id = "";
    let product_unit_id = "";
    let reference_id = "";
    let reference_type = "";
    let transaction_type = "";
    let quantity = 0;
    let unit_cost = 0;
    let total_cost = 0;
    let date = "";
    let expiry_date = "";
    let heaviness = "";
    let description = "";
    let status = 1;
    const mdb = window.mdb;
    let transactionTypes = [
        "purchase", "sale", "purchase_return", "sale_return", "waste", "adjustment_in", "adjustment_out","transfer_in", "transfer_out"
    ];
    let referenceTypes = [
        "purchase", "sale", "purchase_return", "sale_return", "waste", "manual_adjustment", "stock_transfer"
    ];
    function resetForm() {
        id = null;
        warehouse_id = "";
        product_id = "";
        product_unit_id = "";
        reference_id = "";
        reference_type = "";
        transaction_type = "";
        quantity = 0;
        unit_cost = 0;
        total_cost = 0;
        date = "";
        expiry_date = "";
        heaviness = "";
        description = "";
        status = 1;
    }
    export function open(tx = null) {
        resetForm();
        if (tx) {
            id = tx.id;
            warehouse_id = tx.warehouse_id;
            product_id = tx.product_id;
            product_unit_id = tx.product_unit_id;
            reference_id = tx.reference_id;
            reference_type = tx.reference_type;
            transaction_type = tx.transaction_type;
            quantity = tx.quantity;
            unit_cost = tx.unit_cost;
            total_cost = tx.total_cost;
            date = tx.date;
            expiry_date = tx.expiry_date;
            heaviness = tx.heaviness;
            description = tx.description;
            status = Number(tx.status);
        }
        const modalEl = document.getElementById("stockTransactionModal");
        if (mdb) {
            new mdb.Modal(modalEl).show();
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => new mdb.Input(el));
            document.querySelectorAll(".dropdown-toggle").forEach((el) => new mdb.Dropdown(el));
        }
    }
    async function saveTransaction() {
        const tx = {
            warehouse_id: Number(warehouse_id),
            product_id: Number(product_id),
            product_unit_id: Number(product_unit_id),
            reference_id: reference_id,
            reference_type,
            transaction_type,
            quantity: Number(quantity),
            unit_cost: Number(unit_cost),
            total_cost: Number(total_cost),
            date,
            expiry_date,
            heaviness,
            description,
            status: Number(status),
        };
        if (id) {
            await stockTransactionApi.update(id, tx);
        } else {
            await stockTransactionApi.create(tx);
        }
        dispatch('saved');
        document.getElementById("stockTransactionModal").classList.remove("show");
        document.body.classList.remove("modal-open");
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    }
    onMount(() => {
        if (transaction) open(transaction);
    });
    $: if (transaction) open(transaction);
</script>
<div class="modal fade" id="stockTransactionModal" tabindex="-1" aria-labelledby="stockTransactionModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="stockTransactionModalLabel">{id ? t('stock_transactions.edit') : t('stock_transactions.add')}</h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <form on:submit|preventDefault={saveTransaction}>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label" for="warehouse_id">{t('stock_transactions.warehouse')}</label>
                            <select id="warehouse_id" class="form-select" bind:value={warehouse_id} required>
                                <option value="">{t('stock_transactions.select_warehouse')}</option>
                                {#each warehouses as w}
                                    <option value={w.id}>{w.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="product_id">{t('stock_transactions.product')}</label>
                            <select id="product_id" class="form-select" bind:value={product_id} required>
                                <option value="">{t('stock_transactions.select_product')}</option>
                                {#each products as p}
                                    <option value={p.id}>{p.name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label" for="product_unit_id">{t('stock_transactions.product_unit')}</label>
                            <select id="product_unit_id" class="form-select" bind:value={product_unit_id} required>
                                <option value="">{t('stock_transactions.select_product_unit')}</option>
                                {#each productUnits as u}
                                    <option value={u.id}>{u.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="transaction_type">{t('stock_transactions.transaction_type')}</label>
                            <select id="transaction_type" class="form-select" bind:value={transaction_type} required>
                                <option value="">{t('stock_transactions.select_transaction_type')}</option>
                                {#each transactionTypes as type}
                                    <option value={type}>{type}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label" for="reference_type">{t('stock_transactions.reference_type')}</label>
                            <select id="reference_type" class="form-select" bind:value={reference_type} required>
                                <option value="">{t('stock_transactions.select_reference_type')}</option>
                                {#each referenceTypes as type}
                                    <option value={type}>{type}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="reference_id">{t('stock_transactions.reference_id')}</label>
                            <input id="reference_id" class="form-control" type="text" bind:value={reference_id} />
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-4">
                            <label class="form-label" for="quantity">{t('stock_transactions.quantity')}</label>
                            <input id="quantity" class="form-control" type="number" min="0" step="any" bind:value={quantity} required />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label" for="unit_cost">{t('stock_transactions.unit_cost')}</label>
                            <input id="unit_cost" class="form-control" type="number" min="0" step="any" bind:value={unit_cost} required />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label" for="total_cost">{t('stock_transactions.total_cost')}</label>
                            <input id="total_cost" class="form-control" type="number" min="0" step="any" bind:value={total_cost} required />
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label" for="date">{t('stock_transactions.date')}</label>
                            <input id="date" class="form-control" type="date" bind:value={date} required />
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="expiry_date">{t('stock_transactions.expiry_date')}</label>
                            <input id="expiry_date" class="form-control" type="date" bind:value={expiry_date} />
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label" for="heaviness">{t('stock_transactions.heaviness')}</label>
                            <input id="heaviness" class="form-control" type="text" bind:value={heaviness} />
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="status">{t('stock_transactions.status')}</label>
                            <select id="status" class="form-select" bind:value={status}>
                                <option value="1">{t('Active')}</option>
                                <option value="0">{t('Deleted')}</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="description">{t('stock_transactions.description')}</label>
                        <textarea id="description" class="form-control" rows="2" bind:value={description}></textarea>
                    </div>
                    <div class="d-flex justify-content-end">
                        <button type="submit" class="btn btn-primary">
                            <i class="bi bi-save me-1"></i> {id ? t('stock_transactions.save') : t('stock_transactions.create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
