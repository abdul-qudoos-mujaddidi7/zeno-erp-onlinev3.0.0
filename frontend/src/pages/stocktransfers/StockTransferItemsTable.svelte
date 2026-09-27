<script>
import { productUnitApi } from '../../api/productUnitApi.js';
    import { productApi } from "../../api/productApi.js";
    import { productCategoryApi } from "../../api/productCategoryApi.js";
    import { warehouseProductApi } from "../../api/warehouseProductApi.js";
    import { onMount, createEventDispatcher } from "svelte";
    import ProductModal from "../products/ProductModal.svelte";
    import Swal from "sweetalert2";

    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    export let items = [];
    export let currency = "";
    export let warehouse_id = "";

    const dispatch = createEventDispatcher();

    let products = [];
    let search = "";
    let showDropdown = false;

    let quantity = 1;
    let unit_price = 0;
    let unit = 0;
    let selectedProduct = null;

    let barcodeInput = "";

    // Reference to the modal
    let productModal;

    let categories = [];
    let units = [];
    let currencies = [];
    let warehouses = [];
    let warehouse_products = [];
    let stock = 0;

    async function loadAll() {
        categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
        units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
        currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
        warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
        warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    }

    onMount(async () => {
        loadAll();

        products = (await productApi.getAll({ status: 1 }))?.data || [];
    });

    // Build lookup map
    $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

    // Get full unit chain recursively
    function getUnitHierarchy(unitId) {
        const result = [];

        function traverse(id, multiplier = 1) {
            const unit = unitMap[id];
            if (!unit) return;

            result.push({
                ...unit,
                multiplier,
            });

            if (unit.subunit_id) {
                traverse(
                    unit.subunit_id,
                    multiplier / (unit.subunit_multiple || 1),
                );
            }
        }

        traverse(unitId);
        return result;
    }
    function changeUnit(item, unitId) {
        unitId = Number(unitId);

        const selectedUnit = item.availableUnits?.find((u) => u.id === unitId);
        if (!selectedUnit) return;

        item.product_unit_id = unitId;
        item.calculated_price =
            item.unit_price * (selectedUnit.multiplier) || item.unit_price; // adjust price if needed
        item.subtotal = item.quantity * item.calculated_price;

        recalc(items.indexOf(item));
        items = [...items];
        dispatch("update", { items });
    }

    // Show the product list on focus (browse mode) and filtered results while typing.
    $: filteredProducts = (() => {
        const query = search.trim().toLowerCase();
        const list = query
            ? products.filter(
                  (p) =>
                      p.name.toLowerCase().includes(query) ||
                      String(p.code || "").toLowerCase().includes(query),
              )
            : products;
        return list.slice(0, 15);
    })();


    function selectProduct(product) {
        selectedProduct = product;
        const unitHierarchy = getUnitHierarchy(product.product_unit_id);
        search = product.name;
        unit_price = Number(product.buy_price) || 0;
        unit = product.product_unit_id;
        showDropdown = false;
        selectedProduct.availableUnits = unitHierarchy;
        console.log(
            "Calculating stock for product",
            product.id,
            "in warehouse",
            warehouse_id,
        );
        stock =
            warehouse_products.find(
                (wp) =>
                    wp.product_id === product.id &&
                    wp.warehouse_id === warehouse_id,
            )?.quantity || 0;
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
                calculated_price: Number(unit_price),
                subtotal: Number(quantity) * Number(unit_price),
                availableUnits: selectedProduct.availableUnits,
            });
        }

        // Important: reassign so Svelte updates the table
        items = [...items];

        dispatch("update", { items });

        // Reset
        search = "";
        selectedProduct = null;
        quantity = 1;
        unit_price = 0;
    }
    function removeItem(index) {
        items.splice(index, 1);
        items = [...items];
        dispatch("update", { items });
    }

    function getCalculatedStock(item) {
        const selectedUnit = item.availableUnits?.find(
            (u) => u.id === item.product_unit_id,
        );
        const multiplier = selectedUnit?.multiplier || 1;
        return Math.floor(getProductStock(item.product_id) / multiplier);
    }

    function recalc(index) {
        const item = items[index];

        // Find the selected unit
        const selectedUnit = item.availableUnits?.find(
            (u) => u.id === item.product_unit_id,
        );
        const multiplier = selectedUnit?.multiplier || 1;

        // Get stock in the warehouse adjusted for selected unit
        let stock = Math.floor(getProductStock(item.product_id) / multiplier);

        // Adjust quantity if it exceeds available stock
        if (stock < item.quantity) {
            item.quantity = stock;
        }

        // Calculate subtotal using multiplier
        item.subtotal =
            Number(item.quantity) * (Number(item.calculated_price) || 0);

        items = [...items];
        dispatch("update", { items });
    }

    let barcodeTimer;
    function handleBarcode(e) {
        if (barcodeTimer) clearTimeout(barcodeTimer);

        if (e.key === "Enter") {
            processBarcode(barcodeInput);
            barcodeInput = "";
            return;
        }

        barcodeTimer = setTimeout(() => {
            barcodeInput = "";
        }, 100);
    }

    async function processBarcode(code) {
        const product = (await productApi.getAll({ status: 1 }))?.data
            ?.find((p) => String(p.code) === String(code)) || null;
        if (!product) return;
        selectProduct(product);
        addItem();
    }

    $: total = items.reduce((s, i) => s + i.subtotal, 0);

    function getProductStock(productId) {
        return (
            warehouse_products.find(
                (wp) =>
                    wp.product_id === productId &&
                    wp.warehouse_id === warehouse_id,
            )?.quantity || 0
        );
    }
</script>

<div class="card shadow-2 mt-4 transfer-items-card">
    <div class="card-body">
        <div class="transfer-items-heading">
            <h5 class="transfer-items-title">
                <span class="transfer-items-title__icon" aria-hidden="true">
                    <i class="bi bi-box-seam"></i>
                </span>
                {t("Stock Transfer Items")}
            </h5>
        </div>

        <input
            type="text"
            class="transfer-barcode-input"
            bind:value={barcodeInput}
            on:keydown={handleBarcode}
        />

        <div class="transfer-items-toolbar">
            <div class="transfer-toolbar-field transfer-toolbar-field--search">
                <span class="transfer-toolbar-label">{t("Product")}</span>

                <div class="transfer-search-wrap">
                    <i class="bi bi-search" aria-hidden="true"></i>

                    <input
                        type="text"
                        bind:value={search}
                        on:focus={() => (showDropdown = true)}
                        on:blur={() =>
                            setTimeout(() => (showDropdown = false), 150)}
                        placeholder={t("Search Product...")}
                    />

                    {#if showDropdown && filteredProducts.length > 0}
                        <div class="transfer-search-dropdown">
                            {#each filteredProducts as p}
                                <button
                                    type="button"
                                    on:mousedown={() => selectProduct(p)}>
                                    <span>{p.name}</span>
                                    <small>{p.code}</small>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                {#if selectedProduct}
                    <small class="transfer-toolbar-hint" class:is-danger={stock === 0}>
                        {t("Present in Warehouse")}: {stock}
                        {units.find((u) => u.id === unit)?.name || t("Unit")}
                    </small>
                {/if}
            </div>

            <div class="transfer-toolbar-field">
                <span class="transfer-toolbar-label">{t("Quantity")}</span>

                <div class="transfer-input-suffix">
                    <input
                        type="number"
                        bind:value={quantity}
                        on:input={() => {
                            if (quantity < 1) quantity = 1;
                            if (quantity > stock) quantity = stock;
                        }}
                        min="1"
                    />
                    <span>{units.find((u) => u.id === unit)?.name ||
                        t("Unit")}</span>
                </div>
            </div>

            <div class="transfer-toolbar-field">
                <span class="transfer-toolbar-label">{t("Buy Price")}</span>

                <div class="transfer-input-suffix">
                    <input readonly type="number" bind:value={unit_price} min="0" />
                    <span>{t(currency)}</span>
                </div>
            </div>

            <button
                type="button"
                class="transfer-add-btn"
                on:click={() => {
                    if (stock > 0) {
                        addItem();
                    } else {
                        Swal.fire({
                            icon: "error",
                            title: t("Out of Stock"),
                            text: t(
                                "Product is out of stock in the selected warehouse.",
                            ),
                        });
                    }
                }}>
                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                {t("Add Item")}
            </button>
        </div>

        <div class="table-responsive transfer-items-scroll">
            <table class="table table-hover align-middle transfer-items-table">
                <thead>
                    <tr>
                        <th class="transfer-item-col-product">{t("Product")}</th>
                        <th class="text-center transfer-item-col-quantity">{t("Quantity")}</th>
                        <th class="text-center transfer-item-col-price">{t("Buy Price")}</th>
                        <th class="text-center transfer-item-col-subtotal">{t("Subtotal")}</th>
                        <th class="text-center transfer-item-col-actions">{t("Actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each items as item, index}
                        <tr>
                            <td class="transfer-item-product-cell">
                                <span class="transfer-item-product-copy">
                                    <strong class="transfer-item-product-name">{item.product_name}</strong>
                                    <small
                                        class="transfer-cell-hint"
                                        class:is-danger={getCalculatedStock(item) === 0}
                                    >
                                        {t("Present in Warehouse")}: {getCalculatedStock(item)}
                                        {units.find((u) => u.id === item.product_unit_id)?.name ||
                                            t("Unit")}
                                    </small>
                                </span>
                            </td>

                            <td>
                                <div class="transfer-cell-control">
                                    <input
                                        type="number"
                                        bind:value={item.quantity}
                                        on:input={() => recalc(index)}
                                    />
                                    {#if item.availableUnits?.length > 1}
                                        <select
                                            bind:value={item.product_unit_id}
                                            on:change={(e) =>
                                                changeUnit(item, e.target.value)}
                                        >
                                            {#each item.availableUnits as u}
                                                <option value={u.id}>{u.name}</option>
                                            {/each}
                                        </select>
                                    {:else}
                                        <span class="transfer-cell-suffix">
                                            {item.availableUnits?.[0]?.name}
                                        </span>
                                    {/if}
                                </div>
                            </td>

                            <td>
                                <div class="transfer-cell-control">
                                    <input
                                        type="number"
                                        readonly
                                        bind:value={item.calculated_price}
                                        on:input={() => recalc(index)}
                                    />
                                    <span class="transfer-cell-suffix">{t(currency)}</span>
                                </div>
                            </td>

                            <td class="text-center">
                                <span class="transfer-item-money">
                                    <strong>{item.subtotal.toFixed(2)}</strong>
                                    <small>{t(currency)}</small>
                                </span>
                            </td>

                            <td class="text-center">
                                <button
                                    type="button"
                                    class="transfer-item-remove"
                                    title={t("Remove")}
                                    aria-label={t("Remove")}
                                    on:click={() => removeItem(index)}
                                >
                                    <i class="bi bi-trash" aria-hidden="true"></i>
                                </button>
                            </td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="5" class="transfer-items-empty">
                                <i class="bi bi-inbox" aria-hidden="true"></i>
                                {t("No items yet. Search for a product above to add it.")}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <footer class="transfer-items-total-row">
            <div class="transfer-items-grand-total">
                <span>{t("Total")}</span>
                <strong>{total.toFixed(2)}</strong>
                <small>{t(currency)}</small>
            </div>
        </footer>
    </div>
</div>

<ProductModal
    bind:this={productModal}
    {categories}
    {units}
    {warehouses}
    defaultCurrency="AFN"
    {warehouse_products}
    on:saved={async () => {
        products = (await productApi.getAll({ status: 1 }))?.data || [];

        const newProduct = products[products.length - 1];
        if (newProduct) {
            items.push({
                product_id: newProduct.id,
                product_name: newProduct.name,
                product_unit_id: newProduct.product_unit_id,
                quantity: 1,
                unit_price: Number(newProduct.buy_price) || 0,
                calculated_price: Number(newProduct.buy_price) || 0,
                subtotal: Number(newProduct.buy_price) || 0,
            });
            items = [...items];
            dispatch("update", { items });
        }
    }}
/>

<style>
    .transfer-items-card {
        --transfer-primary: var(--bs-primary, #2f6fed);
        --transfer-border: #dfe6ef;
        --transfer-border-soft: #edf1f6;
        --transfer-text: #172033;

        position: relative;
        z-index: 35;
        width: 100%;
        margin-top: 1rem !important;
        overflow: visible;
        border: 1px solid var(--transfer-border);
        border-radius: 0.875rem;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
    }

    .transfer-items-card :global(.card-body) {
        padding: 0;
        overflow: visible;
    }

    /* Heading */

    .transfer-items-heading {
        display: flex;
        align-items: center;
        min-height: 4.75rem;
        padding: 0.875rem 1rem;
        border-bottom: 1px solid var(--transfer-border-soft);
        background: #ffffff;
    }

    .transfer-items-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: 0;
        color: var(--transfer-text);
        font-size: 1rem;
        font-weight: 850;
        line-height: 1.3;
        letter-spacing: -0.015em;
    }

    .transfer-items-title__icon {
        display: inline-grid;
        flex: 0 0 2.5rem;
        width: 2.5rem;
        height: 2.5rem;
        place-items: center;
        border-radius: 0.625rem;
        background: #edf4ff;
        color: var(--transfer-primary);
        font-size: 1rem;
        font-weight: 400;
    }

    /* Hidden barcode field */

    .transfer-barcode-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
    }

    /* Toolbar */

    .transfer-items-toolbar {
        display: grid;
        grid-template-columns:
            minmax(14rem, 2fr)
            minmax(9rem, 0.85fr)
            minmax(9rem, 0.85fr)
            auto;
        align-items: start;
        gap: 0.6rem;
        padding: 0.875rem 1rem 0.6rem;
        border-bottom: 1px solid var(--transfer-border-soft);
        background: #fbfcfe;
        border-radius: 0 0.875rem 0 0;
    }

    .transfer-toolbar-field {
        display: grid;
        grid-template-rows: 1rem auto;
        align-content: start;
        gap: 0.2rem;
        min-width: 0;
        position: relative;
    }

    .transfer-toolbar-label {
        display: inline-flex;
        align-items: center;
        min-height: 1rem;
        color: #59687c;
        font-size: 0.66rem;
        font-weight: 800;
    }

    .transfer-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        height: 2.375rem;
        border: 1px solid #d6dfeb;
        border-radius: 0.625rem;
        background: #ffffff;
    }

    .transfer-search-wrap:focus-within {
        border-color: #78a4f5;
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
    }

    .transfer-search-wrap > i {
        flex: 0 0 1.8rem;
        color: #8c9aad;
        text-align: center;
        font-size: 0.74rem;
    }

    .transfer-search-wrap input {
        flex: 1 1 auto;
        min-width: 0;
        height: 100%;
        padding: 0 0.55rem 0 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: #26364b;
        font-size: 0.78rem;
        font-weight: 650;
    }

    .transfer-search-wrap input::placeholder {
        color: #a2adbd;
    }

    .transfer-search-dropdown {
        position: absolute;
        top: calc(100% + 5px);
        inset-inline-start: 0;
        z-index: 1055;
        width: 100%;
        max-height: 250px;
        overflow: auto;
        padding: 0.25rem;
        border: 1px solid #dfe6ef;
        border-radius: 0.625rem;
        background: #ffffff;
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
    }

    .transfer-search-dropdown button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        width: 100%;
        padding: 0.5rem 0.6rem;
        border: 0;
        border-radius: 0.45rem;
        background: transparent;
        color: #26364b;
        font-size: 0.75rem;
        font-weight: 650;
        text-align: start;
        cursor: pointer;
    }

    .transfer-search-dropdown button:hover {
        background: #f4f8ff;
        color: var(--transfer-primary);
    }

    .transfer-search-dropdown small {
        color: #8c9aad;
        font-size: 0.62rem;
        font-weight: 700;
    }

    .transfer-input-suffix {
        display: flex;
        align-items: stretch;
        height: 2.375rem;
        overflow: hidden;
        border: 1px solid #d6dfeb;
        border-radius: 0.625rem;
        background: #ffffff;
    }

    .transfer-input-suffix:focus-within {
        border-color: #78a4f5;
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
    }

    .transfer-input-suffix input {
        flex: 1 1 auto;
        min-width: 0;
        width: 100%;
        height: 100%;
        padding: 0 0.55rem;
        border: 0;
        outline: 0;
        background: transparent;
        color: #26364b;
        font-size: 0.78rem;
        font-weight: 750;
    }

    .transfer-input-suffix span {
        display: inline-flex;
        align-items: center;
        padding-inline: 0.5rem;
        border-inline-start: 1px solid #e2e8f0;
        background: #f7f9fc;
        color: #64748b;
        font-size: 0.6rem;
        font-weight: 800;
        white-space: nowrap;
    }

    .transfer-toolbar-hint {
        min-width: 0;
        overflow: hidden;
        color: #718096;
        font-size: 0.58rem;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .transfer-toolbar-hint.is-danger {
        color: #dc2626;
    }

    .transfer-add-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        align-self: start;
        margin-top: 1.2rem;
        min-height: 2.375rem;
        padding-inline: 1rem;
        border: 1px solid var(--transfer-primary);
        border-radius: 0.625rem;
        background: var(--transfer-primary);
        color: #ffffff;
        font-size: 0.74rem;
        font-weight: 850;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
        transition:
            background 0.15s ease,
            transform 0.15s ease,
            box-shadow 0.15s ease;
    }

    .transfer-add-btn:hover {
        background: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: 0 7px 18px rgba(47, 111, 237, 0.27);
    }

    /* Table */

    .transfer-items-scroll {
        width: 100%;
        max-width: 100%;
        min-height: 0;
        height: auto;
        max-height: none;
        overflow-x: auto !important;
        overflow-y: visible !important;
        border: 0;
        background: #ffffff;
        scrollbar-width: thin;
        scrollbar-color: #b9c5d5 transparent;
    }

    .transfer-items-table {
        width: 100%;
        min-width: 44rem;
        margin: 0 !important;
        border: 0;
        border-collapse: separate;
        border-spacing: 0;
        color: #42516a;
    }

    .transfer-items-table :global(thead) {
        border-bottom: 1px solid #dfe5ed;
        background: #f7f9fc;
    }

    .transfer-items-table :global(thead th) {
        height: 2.875rem;
        padding: 0.55rem 0.625rem;
        border: 0;
        border-bottom: 1px solid #dfe5ed;
        background: #f7f9fc !important;
        color: #67768a;
        font-size: 0.68rem;
        font-weight: 850;
        line-height: 1.2;
        text-align: center;
        text-transform: none;
        vertical-align: middle;
        white-space: nowrap;
        box-shadow: none !important;
    }

    .transfer-items-table :global(thead th:first-child) {
        text-align: start;
    }

    .transfer-items-table :global(tbody tr) {
        background: #ffffff;
        transition: background 0.12s ease;
    }

    .transfer-items-table :global(tbody tr:nth-child(even)) {
        background: #fbfcfe;
    }

    .transfer-items-table :global(tbody tr:hover) {
        background: #f4f8ff !important;
    }

    .transfer-items-table :global(tbody td) {
        height: 3.75rem;
        padding: 0.45rem 0.625rem;
        border: 0;
        border-bottom: 1px solid #e9eef5;
        background: transparent;
        color: #46566d;
        font-size: 0.74rem;
        text-align: center;
        vertical-align: middle;
    }

    .transfer-item-col-product {
        width: 32%;
        min-width: 12rem;
        text-align: start;
    }

    .transfer-item-col-quantity {
        width: 24%;
        min-width: 11rem;
    }

    .transfer-item-col-price {
        width: 18%;
        min-width: 9rem;
    }

    .transfer-item-col-subtotal {
        width: 16%;
        min-width: 8rem;
    }

    .transfer-item-col-actions {
        width: 10%;
        min-width: 4.5rem;
    }

    .transfer-item-product-cell {
        text-align: start;
    }

    .transfer-item-product-copy {
        display: grid;
        gap: 0.12rem;
        min-width: 0;
        text-align: start;
    }

    .transfer-item-product-name {
        display: block;
        overflow: hidden;
        color: #26364b;
        font-size: 0.78rem;
        font-weight: 800;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .transfer-cell-control {
        display: flex;
        align-items: stretch;
        height: 2.1rem;
        overflow: hidden;
        border: 1px solid #d6dfeb;
        border-radius: 0.55rem;
        background: #ffffff;
    }

    .transfer-cell-control:focus-within {
        border-color: #78a4f5;
        box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
    }

    .transfer-cell-control input {
        flex: 1 1 auto;
        min-width: 0;
        width: 100%;
        height: 100%;
        padding: 0 0.45rem;
        border: 0;
        outline: 0;
        background: transparent;
        color: #26364b;
        font-size: 0.74rem;
        font-weight: 750;
        text-align: center;
    }

    .transfer-cell-control input[readonly] {
        background: #f7f9fc;
        color: #526176;
        cursor: default;
    }

    .transfer-cell-control select {
        flex: 0 0 auto;
        max-width: 5.5rem;
        height: 100%;
        padding-inline: 0.3rem;
        border: 0;
        border-inline-start: 1px solid #e2e8f0;
        outline: 0;
        background: #f7f9fc;
        color: #526176;
        font-size: 0.62rem;
        font-weight: 800;
        cursor: pointer;
    }

    .transfer-cell-suffix {
        display: inline-flex;
        align-items: center;
        padding-inline: 0.45rem;
        border-inline-start: 1px solid #e2e8f0;
        background: #f7f9fc;
        color: #64748b;
        font-size: 0.6rem;
        font-weight: 800;
        white-space: nowrap;
    }

    .transfer-cell-hint {
        display: block;
        color: #718096;
        font-size: 0.56rem;
        font-weight: 650;
        white-space: nowrap;
    }

    .transfer-cell-hint.is-danger {
        color: #dc2626;
    }

    .transfer-item-money {
        display: inline-flex;
        align-items: baseline;
        gap: 0.25rem;
        white-space: nowrap;
    }

    .transfer-item-money strong {
        color: #26364b;
        font-size: 0.8rem;
        font-weight: 850;
    }

    .transfer-item-money small {
        color: #718096;
        font-size: 0.6rem;
        font-weight: 750;
    }

    .transfer-item-remove {
        display: inline-grid;
        width: 1.9rem;
        height: 1.9rem;
        padding: 0;
        place-items: center;
        border: 1px solid #f3cccc;
        border-radius: 0.5rem;
        background: #ffffff;
        color: #dc2626;
        font-size: 0.72rem;
        cursor: pointer;
        transition:
            border-color 0.15s ease,
            background 0.15s ease,
            transform 0.15s ease;
    }

    .transfer-item-remove:hover {
        transform: translateY(-1px);
        border-color: #efaaaa;
        background: #fff5f5;
    }

    .transfer-items-empty {
        height: 6rem !important;
        color: #8c9aad;
        font-size: 0.74rem;
        font-weight: 650;
        text-align: center;
    }

    .transfer-items-empty i {
        display: block;
        margin-bottom: 0.35rem;
        color: #b4c0d0;
        font-size: 1.4rem;
    }

    /* Total footer */

    .transfer-items-total-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 1rem;
        min-height: 4rem;
        margin: 0 !important;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--transfer-border-soft);
        border-radius: 0 0 0.875rem 0.875rem;
        background: #fbfcfe;
    }

    .transfer-items-grand-total {
        display: inline-flex;
        align-items: baseline;
        justify-content: flex-end;
        gap: 0.35rem;
        min-width: 0;
        white-space: nowrap;
    }

    .transfer-items-grand-total > span {
        color: #526176;
        font-size: 0.72rem;
        font-weight: 800;
    }

    .transfer-items-grand-total > strong {
        color: var(--transfer-primary);
        font-size: 1.05rem;
        font-weight: 900;
        line-height: 1;
    }

    .transfer-items-grand-total > small {
        color: #718096;
        font-size: 0.64rem;
        font-weight: 800;
    }

    /* Responsive */

    @media (max-width: 767.98px) {
        .transfer-items-card {
            border-radius: 0.75rem;
        }

        .transfer-items-toolbar {
            grid-template-columns: minmax(0, 1fr);
        }

        .transfer-add-btn {
            width: 100%;
            margin-top: 0.25rem;
        }
    }

    /* Dark theme */

    :global(html.dark) .transfer-items-card {
        border-color: var(--erp-border, #2b3a4f);
        background: var(--erp-surface, #111827);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
    }

    :global(html.dark) .transfer-items-heading,
    :global(html.dark) .transfer-items-toolbar,
    :global(html.dark) .transfer-items-total-row {
        background: var(--erp-surface, #111827);
        border-color: var(--erp-border, #2b3a4f);
    }

    :global(html.dark) .transfer-items-title {
        color: var(--erp-text, #e5edf8);
    }

    :global(html.dark) .transfer-search-wrap,
    :global(html.dark) .transfer-input-suffix,
    :global(html.dark) .transfer-cell-control {
        background: var(--erp-surface-soft, #172033);
        border-color: var(--erp-border, #2b3a4f);
    }

    :global(html.dark) .transfer-search-wrap input,
    :global(html.dark) .transfer-input-suffix input,
    :global(html.dark) .transfer-cell-control input {
        color: var(--erp-text, #e5edf8);
    }
</style>
