<script>
import { productUnitApi } from '../../api/productUnitApi.js';
    import { productApi } from "../../api/productApi.js";
    import { wasteApi } from "../../api/wasteApi.js";
    import { warehouseApi } from "../../api/warehouseApi.js";
    import { onMount, createEventDispatcher, tick } from "svelte";
    import { showDate } from "../../calendar.js";
    import { t } from "../../i18n/i18n";
    import WasteDeleteModal from "./WasteDeleteModal.svelte";
    export let wasteId;
    const dispatch = createEventDispatcher();

    let showDelete = false;

    let waste;
    let items = [];
    let units = [];
    let warehouseName = '';
    let error = null;

    onMount(async () => {
        try {
            const response = await wasteApi.getById(Number(wasteId));
            const rawWaste = response?.data;
            waste = rawWaste ? JSON.parse(JSON.stringify(rawWaste)) : null;
            console.log('loaded waste', waste);

            const wItems = (rawWaste?.items || []).filter((i) => Number(i.status) === 1);
            console.log('raw wItems', wItems);

            const productIds = wItems.map(i => i.product_id);
            const products = (await productApi.getAll({ status: 1 }))?.data || [];
            let tempItems = wItems.map(i => ({
                ...i,
                product_name: products.find(p => Number(p.id) === Number(i.product_id))?.name || 'Unknown'
            }));
            items = tempItems.map(it => JSON.parse(JSON.stringify(it)));
            await tick();
            console.log('waste items loaded', items);

            units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
            const wh = waste
              ? (await warehouseApi.getAll({ status: 1 }))?.data?.find(
                  (w) => Number(w.id) === Number(waste.warehouse_id),
                ) || null
              : null;
            warehouseName = wh?.name || '';
        } catch (err) {
            console.error('WasteView load error', err);
            error = err?.message || String(err);
        }
    });
</script>

<div class="card shadow-2 mb-3">
    <div class="card-body">
        <div class="float-end">
            <button class="btn btn-outline-secondary me-2" on:click={() => dispatch('back')}><i class="bi bi-arrow-{t('dir') === 'rtl' ? 'right' : 'left'} me-2"></i> {t('Back')}</button>
            <button class="btn btn-danger me-2" on:click={() => (showDelete = true)}><i class="bi bi-trash me-2"></i> {t('Delete Waste')}</button>
        </div>

            <div class="mb-3">
                <h5 class="mb-3">{t('Waste #')} {waste?.reference_number}</h5>
                <strong>{t('Date')}:</strong> {waste?.date}<br />
                <strong>{t('Warehouse')}:</strong> {warehouseName}<br />
                {#if waste?.description}<strong>{t('Description')}:</strong> {waste?.description}<br />{/if}
                <strong>{t('Total')}:</strong> {waste?.total_amount || 0} {t(waste?.currency || 'USD')}<br />
            </div>

            {#if error}
                <div class="alert alert-danger">Error: {error}</div>
            {/if}


        <div class="table-responsive">
            <table class="table table-striped">
                <thead class="table-light">
                    <tr>
                        <th>{t('Product')}</th>
                        <th class="text-end">{t('Unit Price')}</th>
                        <th class="text-end">{t('Quantity')}</th>
                        <th class="text-end">{t('Total Price')}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each items as i}
                        <tr>
                            <td>{i.product_name}</td>
                            <td class="text-end">{Number(i.unit_price).toFixed(2)} {t(waste?.currency)}</td>
                            <td class="text-end">{i.quantity} {units.find(u=>u.id===i.product_unit_id)?.name || '-'}</td>
                            <td class="text-end">{Number(i.subtotal).toFixed(2)} {t(waste?.currency)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>

{#if showDelete}
    <WasteDeleteModal {waste} on:close={() => (showDelete = false)} />
{/if}
