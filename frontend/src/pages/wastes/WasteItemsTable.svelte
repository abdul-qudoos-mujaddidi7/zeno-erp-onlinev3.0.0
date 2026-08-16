<script>
import { productUnitApi } from '../../api/productUnitApi.js';
    import { productApi } from "../../api/productApi.js";
    import { warehouseProductApi } from "../../api/warehouseProductApi.js";
    import { onMount, createEventDispatcher } from "svelte";

    import { t } from "../../i18n/i18n";
    export let items = [];
    export let currency = "";
    export let warehouse_id = null;

    import Swal from "sweetalert2";

    const dispatch = createEventDispatcher();

    let products = [];
    let search = "";
    let showDropdown = false;
    let stock = 0;
    let units = [];

    let quantity = 1;
    let unit_price = 0;
    let selectedProduct = null;
    let warehouse_products = [];

    $: if (selectedProduct && warehouse_id) {
        stock =
            warehouse_products.find(
                (wp) =>
                    wp.product_id === selectedProduct.id &&
                    wp.warehouse_id === warehouse_id,
            )?.quantity || 0;
    } else {
        stock = 0;
    }

    onMount(async () => {
        products = (await productApi.getAll({ status: 1 }))?.data || [];
        warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
        units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    });

    $: filteredProducts =
        search.length > 0
            ? products
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                    p.code?.includes(search.trim().toLowerCase()),
                  )
                  .slice(0, 10)
            : [];

    function selectProduct(p) {
        selectedProduct = p;
        search = p.name;
        unit_price = Number(p.buy_price) || 0;
        showDropdown = false;
    }

    function addItem() {
        if (!selectedProduct) return;
        const existingIndex = items.findIndex(
            (i) => i.product_id === selectedProduct.id,
        );
        if (existingIndex !== -1) {
            items[existingIndex].quantity += Number(quantity);
            items[existingIndex].subtotal =
                items[existingIndex].quantity * items[existingIndex].unit_price;
        } else {
            items.push({
                product_id: selectedProduct.id,
                product_name: selectedProduct.name,
                product_unit_id: selectedProduct.product_unit_id,
                quantity: Number(quantity),
                unit_price: Number(unit_price),
                subtotal: Number(quantity) * Number(unit_price),
            });
        }
        items = [...items];
        dispatch("update", { items });
        search = "";
        selectedProduct = null;
        quantity = 1;
        unit_price = 0;
    }

    function removeItem(i) {
        items.splice(i, 1);
        items = [...items];
        dispatch("update", { items });
    }

    function recalc(i) {
        let stock = getProductStock(items[i].product_id);
        if (stock < items[i].quantity) {
            items[i].quantity = stock;
        }
        items[i].subtotal =
            Number(items[i].quantity) * Number(items[i].unit_price);
        items = [...items];
        dispatch("update", { items });
    }

    $: total = items.reduce((s, it) => s + it.subtotal, 0);


    function getProductStock(productId) {
        return (
            warehouse_products.find(
                (wp) =>
                    wp.product_id === productId && wp.warehouse_id === warehouse_id,
            )?.quantity || 0
        );
    }
</script>

<div class="card shadow-2 mt-4">
    <div class="card-body">
        <h5 class="mb-4">{t("Waste Items")}</h5>

        <div class="row g-3 mb-4">
            <div class="col-md-6 position-relative">
                <input
                    class="form-control"
                    bind:value={search}
                    on:focus={() => (showDropdown = true)}
                    placeholder={t("Search Product...")}
                />
                {#if showDropdown && filteredProducts.length > 0}
                    <div
                        class="list-group position-absolute w-100 shadow bg-body-tertiary"
                        style="top:100%; left:0; z-index:1055; max-height:250px; overflow:auto;"
                    >
                        {#each filteredProducts as p}
                            <button
                                type="button"
                                class="list-group-item list-group-item-action"
                                on:click={() => selectProduct(p)}
                            >
                                <div class="d-flex justify-content-between">
                                    <span>{p.name}</span>
                                    <small>{p.code}</small>
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>

            <div class="col-md-2">
                <div class="input-group">
                    <input
                        type="number"
                        class="form-control"
                        bind:value={quantity}
                        on:input={() => {
                            if (quantity < 1) quantity = 1;
                            if (quantity > stock) quantity = stock;
                        }}
                        min="1"
                    />
                    <span class="input-group-text"
                        >{units.find(
                            (u) => u.id === selectedProduct?.product_unit_id,
                        )?.name || t("Unit")}</span
                    >
                </div>
                {#if selectedProduct}
                    <div class="form-text {stock === 0 ? 'text-danger' : ''}">
                        {t("Present in Warehouse")}: {stock}
                        {units.find(
                            (u) => u.id === selectedProduct?.product_unit_id,
                        )?.name || t("Unit")}
                    </div>
                {/if}
            </div>

            <div class="col-md-2">
                <div class="input-group">
                    <input
                        type="number"
                        class="form-control"
                        bind:value={unit_price}
                        min="0"
                    />
                    <span class="input-group-text">{t(currency)}</span>
                </div>
            </div>

            <div class="col-md-2">
                <button class="btn btn-primary w-100" on:click={()=>{
                    if (stock>0) { 
                        addItem();
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: t('Error'),
                            text: t("Product is out of stock in the selected warehouse."),
                            confirmButtonText: t("OK"),
                        });
                    }
                }}
                    >{t("Add Item")}</button
                >
            </div>
        </div>

        <div class="table-responsive">
            <table class="table table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>{t("Product")}</th>
                        <th width="180" class="text-center">{t("Quantity")}</th>
                        <th width="180" class="text-center">{t("Buy Price")}</th
                        >
                        <th width="150" class="text-center">{t("Subtotal")}</th>
                        <th width="80" class="text-center">{t("Actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each items as item, idx}
                        <tr>
                            <td>{item.product_name}</td>
                            <td>
                                <div class="input-group input-group-sm">
                                    <input
                                        type="number"
                                        class="form-control form-control-sm"
                                        bind:value={item.quantity}
                                        on:input={() => recalc(idx)}
                                    />
                                    <span class="input-group-text"
                                        >{units.find(
                                            (u) =>
                                                u.id === item.product_unit_id,
                                        )?.name || t("Unit")}</span
                                    >
                                </div>
                                <div
                                    class="form-text mt-0 {getProductStock(
                                        item.product_id,
                                    ) === 0
                                        ? 'text-danger'
                                        : ''}"
                                >
                                    {t("Present in Warehouse")}: {getProductStock(
                                        item.product_id,
                                    )}
                                    {units.find(
                                        (u) => u.id === item.product_unit_id,
                                    )?.name || t("Unit")}
                                </div>
                            </td>
                            <td class="fw-bold text-center"
                                >{item.unit_price.toFixed(2)} {t(currency)}</td
                            >
                            <td class="fw-bold text-center"
                                >{item.subtotal.toFixed(2)} {t(currency)}</td
                            >
                            <td class="text-center"
                                ><button
                                    class="btn btn-sm btn-outline-danger"
                                    on:click={() => removeItem(idx)}>✕</button
                                ></td
                            >
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="text-end mt-3">
            <h5>
                {t("Total")} :
                <span class="text-primary"
                    >{total.toFixed(2)} {t(currency)}</span
                >
            </h5>
        </div>
    </div>
</div>
