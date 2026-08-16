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

    $: filteredProducts =
        search.length > 0
            ? products
                  .filter(
                      (p) =>
                          p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                          p.code?.includes(search.trim().toLowerCase()),
                  )
                  .slice(0, 10)
            : [];


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

<div class="card shadow-2 mt-4">
    <div class="card-body">
        <h5 class="mb-4">{t("Stock Transfer Items")}</h5>

        <input
            type="text"
            class="position-absolute opacity-0"
            bind:value={barcodeInput}
            on:keydown={handleBarcode}
        />

        <div class="row g-3 mb-4">
            <div class="col-md-6 position-relative">
                <input
                    type="text"
                    class="form-control form-control-sm"
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
                <div class="input-group input-group-sm">
                    <input
                        type="number"
                        class="form-control form-control-sm"
                        bind:value={quantity}
                        on:input={() => {
                            if (quantity < 1) quantity = 1;
                            if (quantity > stock) quantity = stock;
                        }}
                        min="1"
                    />
                    <span class="input-group-text"
                        >{units.find((u) => u.id === unit)?.name ||
                            t("Unit")}</span
                    >
                </div>
                {#if selectedProduct}
                    <div class="form-text {stock === 0 ? 'text-danger' : ''}">
                        {t("Present in Warehouse")}: {stock}
                        {units.find((u) => u.id === unit)?.name || t("Unit")}
                    </div>
                {/if}
            </div>

            <div class="col-md-2">
                <div class="input-group input-group-sm">
                    <input
                        readonly
                        type="number"
                        class="form-control form-control-sm"
                        bind:value={unit_price}
                        min="0"
                    />

                    <span class="input-group-text">{t(currency)}</span>
                </div>
            </div>

            <div class="col-md-2">
                <button
                    class="btn btn-primary btn-sm w-100"
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
                    }}>{t("Add Item")}</button
                >
            </div>
        </div>

        <div class="table-responsive">
            <table class="table table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>{t("Product")}</th>
                        <th width="200" class="text-center">{t("Quantity")}</th>
                        <th width="180" class="text-center"
                            >{t("Buy Price")}</th
                        >
                        <th width="150" class="text-center">{t("Subtotal")}</th>
                        <th width="80" class="text-center">{t("Actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {#each items as item, index}
                        <tr>
                            <td>{item.product_name}</td>
                            <td>
                                <div class="input-group input-group-sm">
                                    <input
                                        type="number"
                                        class="form-control form-control-sm"
                                        bind:value={item.quantity}
                                        on:input={() => recalc(index)}
                                    />
                                    {#if item.availableUnits?.length > 1}
                                        <select
                                            class="form-select form-select-sm"
                                            bind:value={item.product_unit_id}
                                            on:change={(e) =>
                                                changeUnit(
                                                    item,
                                                    e.target.value,
                                                )}
                                        >
                                            {#each item.availableUnits as u}
                                                <option value={u.id}
                                                    >{u.name}</option
                                                >
                                            {/each}
                                        </select>
                                    {:else}
                                        <span
                                            class="badge bg-body-tertiary text-dark border"
                                        >
                                            {item.availableUnits?.[0]?.name}
                                        </span>
                                    {/if}
                                </div>
                                <div
                                    class="form-text mt-0 {getCalculatedStock(
                                        item
                                    ) === 0
                                        ? 'text-danger'
                                        : ''}"
                                >
                                    {t("Present in Warehouse")}: {getCalculatedStock(
                                        item
                                    )}
                                    {units.find(
                                        (u) => u.id === item.product_unit_id,
                                    )?.name || t("Unit")}
                                </div>
                            </td>
                            <td>
                                <div class="input-group input-group-sm">
                                    <input
                                        type="number"
                                        readonly
                                        class="form-control form-control-sm"
                                        bind:value={item.calculated_price}
                                        on:input={() => recalc(index)}
                                    />
                                    <span class="input-group-text"
                                        >{t(currency)}</span
                                    >
                                </div>
                            </td>

                            <td class="fw-bold text-center"
                                >{item.subtotal.toFixed(2)} {t(currency)}</td
                            >
                            <td class="text-center"
                                ><button
                                    class="btn btn-sm btn-outline-danger"
                                    on:click={() => removeItem(index)}>✕</button
                                ></td
                            >
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="text-end mt-3">
            <h5>
                {t("Total")}:
                <span class="text-primary"
                    >{total.toFixed(2)} {t(currency)}</span
                >
            </h5>
        </div>
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
