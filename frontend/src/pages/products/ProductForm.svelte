<script>
  import { onMount, tick } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { push } from 'svelte-spa-router';
  import { productApi } from '../../api/productApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { warehouseProductApi } from '../../api/warehouseProductApi.js';
  import { productCategoryApi } from '../../api/productCategoryApi.js';
  import { t } from '../../i18n/i18n';
  import ProductModal from './ProductModal.svelte';

  export let productFormId = null;

  let categories = [];
  let units = [];
  let warehouses = [];
  let warehouse_products = [];
  let products = [];
  let productModalRef;
  let dataReady = false;
  let previousProductId = null;
  let nextProductId = null;
  let productSearch = '';
  let showProductSearchResults = false;
  let activeProductSearchIndex = 0;

  $: isNew = !productFormId || productFormId === 'new';
  $: formKey = productFormId || 'new';
  $: formKey, (productModalRef = null);
  $: normalizedProductSearch = productSearch.trim().toLocaleLowerCase();
  $: matchingProducts = products
    .filter((product) => {
      if (!normalizedProductSearch) return true;

      return [
        product.name,
        product.code,
        product.barcode,
        product.sku,
        product.product_code,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLocaleLowerCase()
            .includes(normalizedProductSearch),
        );
    })
    .slice(0, 12);

  function getCreatedAtValue(product) {
    const createdAt = product?.created_at || product?.createdAt || '';
    const createdAtTime = createdAt ? new Date(createdAt).getTime() : 0;

    return Number.isFinite(createdAtTime) ? createdAtTime : 0;
  }

  function compareProductsByCreatedAt(first, second) {
    const firstCreatedAt = getCreatedAtValue(first);
    const secondCreatedAt = getCreatedAtValue(second);

    if (firstCreatedAt !== secondCreatedAt) {
      return firstCreatedAt - secondCreatedAt;
    }

    return Number(first?.id || 0) - Number(second?.id || 0);
  }

  async function loadProductNeighbors(id) {
    previousProductId = null;
    nextProductId = null;

    if (!id || id === 'new') return;

    const routeKey = String(id).trim();
    const products = ((await productApi.getAll({ status: 1 }))?.data || []).sort(compareProductsByCreatedAt);
    const currentIndex = products.findIndex((product) => String(product.id).trim() === routeKey);

    if (currentIndex < 0) return;

    previousProductId = currentIndex > 0 ? products[currentIndex - 1].id : null;
    nextProductId = currentIndex < products.length - 1 ? products[currentIndex + 1].id : null;
  }

  function navigateToProduct(id) {
    if (!id) return;

    productSearch = '';
    showProductSearchResults = false;
    activeProductSearchIndex = 0;
    push(`/dashboard/product-form/${id}`);
  }

  function selectProductToEdit(product) {
    if (!product?.id) return;
    navigateToProduct(product.id);
  }

  function handleProductSearchKeydown(event) {
    if (event.key === 'Escape') {
      showProductSearchResults = false;
      return;
    }

    if (!showProductSearchResults && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      showProductSearchResults = true;
    }

    if (!matchingProducts.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeProductSearchIndex = (activeProductSearchIndex + 1) % matchingProducts.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeProductSearchIndex =
        (activeProductSearchIndex - 1 + matchingProducts.length) % matchingProducts.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectProductToEdit(matchingProducts[activeProductSearchIndex] || matchingProducts[0]);
    }
  }

  function closeProductSearchOnOutsideClick(node) {
    function handleClick(event) {
      if (!node.contains(event.target)) {
        showProductSearchResults = false;
      }
    }

    document.addEventListener('click', handleClick);

    return {
      destroy() {
        document.removeEventListener('click', handleClick);
      },
    };
  }

  onMount(async () => {
    const categoryResponse = await productCategoryApi.getAll({
      status: 1,
    });

    categories = categoryResponse?.data || [];

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];

    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];

    warehouse_products =
      (await warehouseProductApi.getAll({ status: 1 }))?.data || [];

    products = (await productApi.getAll({ status: 1 }))?.data || [];

    dataReady = true;
  });

  async function getProductByRouteId(id) {
    if (id == null || id === '') return null;

    const routeKey = String(id).trim();
    const products = (await productApi.getAll({ status: 1 }))?.data || [];

    return (
      products.find(
        (product) => String(product.id).trim() === routeKey,
      ) || null
    );
  }

  async function loadFormForRoute(id) {
    if (!productModalRef) return;

    await tick();

    if (!id || id === 'new') {
      productModalRef.openModal();
      return;
    }

    const product = await getProductByRouteId(id);

    if (product) {
      await productModalRef.editProduct(product);
    } else {
      productModalRef.openModal();
    }
  }

  $: if (dataReady && productModalRef) {
    loadFormForRoute(productFormId);
  }

  $: if (dataReady) {
    loadProductNeighbors(productFormId);
  }
</script>

{#if dataReady}
  <div class="container-fluid product-form-page-shell">
    {#if !isNew}
      <div class="product-edit-search" use:closeProductSearchOnOutsideClick>
        <div
          class="product-edit-search__cell"
          class:product-edit-search__cell--open={showProductSearchResults}>
          <span class="product-edit-search__icon" aria-hidden="true">
            <i class="bi bi-search"></i>
          </span>

          <label class="product-edit-search__field" for="product-edit-search-input">
           
            <input
              id="product-edit-search-input"
              type="search"
              role="combobox"
              bind:value={productSearch}
              placeholder={t('Search product by name, barcode, or SKU...')}
              autocomplete="off"
              aria-autocomplete="list"
              aria-controls="product-edit-search-results"
              aria-expanded={showProductSearchResults}
              on:focus={() => {
                showProductSearchResults = true;
                activeProductSearchIndex = 0;
              }}
              on:input={() => {
                showProductSearchResults = true;
                activeProductSearchIndex = 0;
              }}
              on:keydown={handleProductSearchKeydown}
            />
          </label>

          {#if productSearch}
            <button
              type="button"
              class="product-edit-search__clear"
              title={t('Clear')}
              aria-label={t('Clear')}
              on:click={() => {
                productSearch = '';
                showProductSearchResults = true;
                activeProductSearchIndex = 0;
              }}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          {/if}
        </div>

        {#if showProductSearchResults}
          <div
            id="product-edit-search-results"
            class="product-edit-search__results"
            role="listbox">
            {#if matchingProducts.length}
              {#each matchingProducts as product, index (product.id)}
                <button
                  type="button"
                  role="option"
                  aria-selected={String(product.id) === String(productFormId)}
                  class:active={index === activeProductSearchIndex}
                  class:selected={String(product.id) === String(productFormId)}
                  on:mouseenter={() => (activeProductSearchIndex = index)}
                  on:mousedown|preventDefault={() => {}}
                  on:click={() => selectProductToEdit(product)}>
                  <span class="product-edit-search__option-copy">
                    <strong>{product.name || t('Product')}</strong>
                    <small>
                      {categories.find((category) => category.id === product.category_id)?.name || t('Category')}
                    </small>
                  </span>

                  <span class="product-edit-search__code" dir="ltr">
                    <i class="bi bi-upc-scan" aria-hidden="true"></i>
                    <strong>{product.code || '-'}</strong>
                  </span>
                </button>
              {/each}
            {:else}
              <div class="product-edit-search__empty">
                <span aria-hidden="true"><i class="bi bi-box-seam"></i></span>
                <strong>{t('No products found.')}</strong>
                <small>{t('Search product by name, barcode, or SKU...')}</small>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#key formKey}
      <ProductModal
        bind:this={productModalRef}
        asPage={true}
        {categories}
        {units}
        {warehouses}
        {warehouse_products}
        {previousProductId}
        {nextProductId}
        onNavigateProduct={navigateToProduct}
        type="product"
      />
    {/key}
  </div>
{:else}
  <div class="product-form-loading" role="status" aria-live="polite">
    <div class="spinner-border text-primary" aria-hidden="true"></div>
  </div>
{/if}


<style>
  /* ========================================================
     COMPACT PRODUCT FORM — DESKTOP AT 100% ZOOM
     ======================================================== */

       .product-form-page-shell {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
  }

  /* ========================================================
     PRODUCT UPDATE SEARCH — SAME STYLE AS SALE ITEM SEARCH
     ======================================================== */

  .product-edit-search {
    --product-search-primary: var(--bs-primary, #2f6fed);
    --product-search-border: #dfe6ef;
    --product-search-text: #26364b;
    --product-search-muted: #8491a4;

    position: relative;
    z-index: 40;
    /* Match the 2fr width of the Basic Information card.
       The page grid uses two columns with an 8px gap: 1fr + 2fr. */
    width: calc(66.666667% - 5.333px);
    max-width: none;
    margin: 0 0 8px auto;
  }

  .product-edit-search__cell {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 2.65rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--product-search-border);
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 7px 20px rgba(15, 23, 42, 0.045);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .product-edit-search__cell:hover {
    background: #f8fbff;
  }

  .product-edit-search__cell:focus-within,
  .product-edit-search__cell--open {
    border-color: rgba(47, 111, 237, 0.42);
    background: #f8fbff;
    box-shadow:
      0 0 0 3px rgba(47, 111, 237, 0.08),
      0 8px 22px rgba(15, 23, 42, 0.06);
  }

  .product-edit-search__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--product-search-primary);
    font-size: 0.76rem;
  }

  .product-edit-search__field {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.08rem;
    margin: 0;
    padding-inline: 0.65rem 0.35rem;
    cursor: text;
  }

  .product-edit-search__field > span {
    color: #718096;
    font-size: 0.61rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .product-edit-search__field input {
    width: 100%;
    min-width: 0;
    height: 1.55rem;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--product-search-text);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 750;
    line-height: 1.3;
    text-align: start;
    box-shadow: none;
  }

  .product-edit-search__field input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .product-edit-search__field input::-webkit-search-cancel-button {
    display: none;
  }

  .product-edit-search__clear {
    display: inline-grid;
    flex: 0 0 1.85rem;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: #718096;
    font-size: 0.66rem;
    cursor: pointer;
  }

  .product-edit-search__clear:hover {
    background: #e8f1ff;
    color: var(--product-search-primary);
  }

  .product-edit-search__clear:focus-visible {
    outline: 2px solid var(--product-search-primary);
    outline-offset: 2px;
  }

  .product-edit-search__results {
    position: absolute;
    inset-block-start: calc(100% + 0.3rem);
    inset-inline: 0;
    z-index: 1000;
    max-height: 20rem;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0.3rem;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  .product-edit-search__results::-webkit-scrollbar {
    width: 0.4rem;
  }

  .product-edit-search__results::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .product-edit-search__results button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: 3rem;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--product-search-text);
    text-align: start;
    cursor: pointer;
  }

  .product-edit-search__results button:hover,
  .product-edit-search__results button:focus,
  .product-edit-search__results button.active {
    outline: 0;
    background: #f0f6ff;
    color: var(--product-search-primary);
  }

  .product-edit-search__results button.selected {
    background: #edf4ff;
  }

  .product-edit-search__option-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  .product-edit-search__option-copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-edit-search__option-copy small {
    overflow: hidden;
    color: var(--product-search-muted);
    font-size: 0.63rem;
    font-weight: 600;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-edit-search__results button:hover .product-edit-search__option-copy strong,
  .product-edit-search__results button.active .product-edit-search__option-copy strong {
    color: var(--product-search-primary);
  }

  .product-edit-search__code {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.28rem;
    min-height: 1.75rem;
    max-width: 10rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #d8e4f8;
    border-radius: 0.45rem;
    background: #f3f7fe;
    color: #2f6fed;
    white-space: nowrap;
  }

  .product-edit-search__code i {
    font-size: 0.66rem;
  }

  .product-edit-search__code strong {
    overflow: hidden;
    font-size: 0.66rem;
    font-weight: 800;
    text-overflow: ellipsis;
  }

  .product-edit-search__empty {
    display: grid;
    min-height: 7.5rem;
    place-items: center;
    align-content: center;
    gap: 0.3rem;
    padding: 1rem;
    color: var(--product-search-muted);
    text-align: center;
  }

  .product-edit-search__empty > span {
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #f1f5f9;
    color: #94a3b8;
    font-size: 1rem;
  }

  .product-edit-search__empty strong {
    color: #526176;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .product-edit-search__empty small {
    color: var(--product-search-muted);
    font-size: 0.63rem;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .product-edit-search {
      width: 100%;
      margin-inline: 0;
    }

    .product-edit-search__cell {
      min-height: 3.5rem;
    }

    .product-edit-search__code {
      max-width: 7rem;
    }
  }

  :global(html.dark) .product-edit-search {
    --product-search-border: var(--erp-border, #2b3a4f);
    --product-search-text: var(--erp-text, #e5edf8);
    --product-search-muted: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .product-edit-search__cell {
    border-color: var(--product-search-border);
    background: var(--erp-surface, #111827);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  :global(html.dark) .product-edit-search__cell:hover,
  :global(html.dark) .product-edit-search__cell:focus-within,
  :global(html.dark) .product-edit-search__cell--open {
    background: #172338;
  }

  :global(html.dark) .product-edit-search__icon {
    background: rgba(47, 111, 237, 0.16);
    color: #93c5fd;
  }

  :global(html.dark) .product-edit-search__field > span {
    color: var(--product-search-muted);
  }

  :global(html.dark) .product-edit-search__field input {
    color: var(--product-search-text);
  }

  :global(html.dark) .product-edit-search__field input::placeholder {
    color: #718198;
  }

  :global(html.dark) .product-edit-search__clear {
    color: #a9b7ca;
  }

  :global(html.dark) .product-edit-search__clear:hover {
    background: #1d2b40;
    color: #93c5fd;
  }

  :global(html.dark) .product-edit-search__results {
    border-color: var(--product-search-border);
    background: var(--erp-surface, #111827);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.4);
    scrollbar-color: #52647d transparent;
  }

  :global(html.dark) .product-edit-search__results button {
    color: var(--product-search-text);
  }

  :global(html.dark) .product-edit-search__results button:hover,
  :global(html.dark) .product-edit-search__results button:focus,
  :global(html.dark) .product-edit-search__results button.active {
    background: #1d2b40;
  }

  :global(html.dark) .product-edit-search__results button.selected {
    background: #16243a;
  }

  :global(html.dark) .product-edit-search__option-copy strong {
    color: var(--product-search-text);
  }

  :global(html.dark) .product-edit-search__option-copy small {
    color: var(--product-search-muted);
  }

  :global(html.dark) .product-edit-search__code {
    border-color: #2d4770;
    background: #16243a;
    color: #8bb7ff;
  }

  :global(html.dark) .product-edit-search__empty > span {
    background: #202b3d;
    color: #94a3b8;
  }

  :global(html.dark) .product-edit-search__empty strong {
    color: var(--product-search-text);
  }

  .product-form-loading {
    display: grid;
    flex: 1 1 auto;
    min-height: 18rem;
    place-items: center;
  }

  .product-form-page-shell {
    --control-height: 30px;
    --compact-radius: 8px;
    --compact-card-radius: 12px;
    --compact-font: 12px;
    --compact-label: 11px;

    width: 100%;
    max-width: 1480px;
    min-height: 100%;
    margin: 0 auto;
    padding: 6px 8px 10px !important;

    color: #0f172a;
    background: transparent;
  }

  /* ========================================================
     PAGE CONTAINER
     ======================================================== */

  .product-form-page-shell
    :global(.product-form-page) {
    width: 100%;
    padding: 0 0 8px !important;
  }

  .product-form-page-shell
    :global(.product-form-page__body),
  .product-form-page-shell
    :global(.product-form-page__inner),
  .product-form-page-shell
    :global(.product-form-body) {
    width: 100%;
  }

  /* ========================================================
     PAGE HEADER
     ======================================================== */

  .product-form-page-shell
    :global(.product-page-header) {
    min-height: auto !important;
    margin-bottom: 8px !important;
    padding: 8px 10px !important;
    border-radius: 12px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__main) {
    gap: 9px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__icon) {
    width: 34px !important;
    height: 34px !important;
    border-radius: 9px !important;
    font-size: 15px !important;
  }

  .product-form-page-shell
    :global(.product-page-header__title) {
    margin: 0 !important;
    font-size: 16px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-page-header__subtitle) {
    margin-top: 2px !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  .product-form-page-shell
    :global(.product-page-header__back) {
    min-height: 30px !important;
    gap: 5px !important;
    padding: 5px 10px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
  }

  /* ========================================================
     MAIN PAGE LAYOUT
     ======================================================== */

  .product-form-page-shell
    :global(.product-page-form) {
    gap: 8px !important;
  }

  .product-form-page-shell
    :global(.product-page-form-layout) {
    gap: 8px !important;
  }

  /* ========================================================
     FORM CARDS
     ======================================================== */

  .product-form-page-shell
    :global(.form-card) {
    padding: 10px !important;
    border-radius: var(--compact-card-radius) !important;
  }

  .product-form-page-shell
    :global(.form-card__title),
  .product-form-page-shell
    :global(.section-title) {
    margin: 0 0 7px !important;
    font-size: 13px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-form-section-title) {
    gap: 6px !important;
    margin-top: 3px !important;
    font-size: 13px !important;
    line-height: 1.3 !important;
  }

  .product-form-page-shell
    :global(.product-form-section-title::before) {
    width: 6px !important;
    height: 6px !important;
  }

  /* ========================================================
     FORM GRID
     ======================================================== */

  .product-form-page-shell
    :global(.product-form-grid),
  .product-form-page-shell
    :global(.form-grid) {
    column-gap: 8px !important;
    row-gap: 6px !important;
  }

  .product-form-page-shell
    :global(.product-form-grid > .field),
  .product-form-page-shell
    :global(.product-form-grid > [class*='col-']) {
    margin-bottom: 0 !important;
  }

  .product-form-page-shell
    :global(.product-main-row) {
    margin-bottom: 0 !important;
  }

  /* ========================================================
     LABELS
     ======================================================== */

  .product-form-page-shell
    :global(.field-label),
  .product-form-page-shell
    :global(.product-static-label),
  .product-form-page-shell
    :global(.form-outline .form-label) {
    margin: 0 0 3px !important;
    padding: 0 !important;
    font-size: var(--compact-label) !important;
    font-weight: 700 !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.field-required) {
    font-size: 10px !important;
  }

  /* ========================================================
     STANDARD INPUTS
     ======================================================== */

  .product-form-page-shell
    :global(.input),
  .product-form-page-shell
    :global(.select),
  .product-form-page-shell
    :global(.textarea),
  .product-form-page-shell
    :global(.form-control),
  .product-form-page-shell
    :global(.form-select),
  .product-form-page-shell
    :global(.form-outline .form-control) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 8px !important;
    border-radius: var(--compact-radius) !important;
    font-size: var(--compact-font) !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.input-with-icon__icon) {
    inset-inline-start: 10px !important;
    font-size: 12px !important;
  }

  .product-form-page-shell
    :global(.input-with-icon .input) {
    padding-inline-start: 30px !important;
  }

  /* ========================================================
     INPUT + ACTION CONTROLS
     ======================================================== */

  .product-form-page-shell
    :global(.input-action-control),
  .product-form-page-shell
    :global(.price-control),
  .product-form-page-shell
    :global(.field-currency-group) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    border-radius: var(--compact-radius) !important;
  }

  .product-form-page-shell
    :global(.input-action-control__input) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 8px !important;
    font-size: var(--compact-font) !important;
    line-height: 1.25 !important;
  }

  .product-form-page-shell
    :global(.input-action-control__btn) {
    width: auto !important;
    min-width: 30px !important;
    height: var(--control-height) !important;
    padding: 0 7px !important;
    gap: 4px !important;
    border-radius: 0 !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.input-action-control__btn-text) {
    font-size: 10px !important;
  }

  /* Quick-create button inside fields */

  .product-form-page-shell
    :global(.field-quick-create-btn) {
    height: 22px !important;
    min-height: 22px !important;
    padding: 0 6px !important;
    border-radius: 6px !important;
    gap: 3px !important;
    font-size: 10px !important;
  }

  .product-form-page-shell
    :global(.field-quick-create-input) {
    padding-inline-end: 52px !important;
  }

  /* ========================================================
     FILTER SELECT
     ======================================================== */

  .product-form-page-shell
    :global(.filter-select) {
    width: 100%;
    max-width: none;
  }

  .product-form-page-shell
    :global(.filter-select__trigger) {
    min-height: var(--control-height) !important;
    height: var(--control-height) !important;
    padding: 4px 8px !important;
    border-radius: var(--compact-radius) !important;
    font-size: var(--compact-font) !important;
  }

  .product-form-page-shell
    :global(.filter-select__menu) {
    font-size: 12px !important;
  }

  .product-form-page-shell
    :global(.filter-select__option) {
    min-height: 28px !important;
    padding: 5px 8px !important;
  }

  /* ========================================================
     PRICE AND CURRENCY CONTROLS
     ======================================================== */

  .product-form-page-shell
    :global(.price-control-row) {
    gap: 6px !important;
  }

  .product-form-page-shell
    :global(.price-control-row__percent) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    border-radius: var(--compact-radius) !important;
  }

  .product-form-page-shell
    :global(.price-control-row__percent-input) {
    height: var(--control-height) !important;
    min-height: var(--control-height) !important;
    padding: 4px 6px !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.field-currency-btn) {
    flex-basis: 64px !important;
    width: 64px !important;
    min-width: 64px !important;
    padding-inline: 6px !important;
    font-size: 11px !important;
  }

  .product-form-page-shell
    :global(.field-currency-input),
  .product-form-page-shell
    :global(.field-currency-group .form-control) {
    padding-inline: 8px !important;
  }

  /* ========================================================
     BOOTSTRAP INPUT GROUPS
     ======================================================== */

  .product-form-page-shell
    :global(.input-group-text),
  .product-form-page-shell
    :global(.input-group .btn),
  .product-form-page-shell
    :global(.btn-outline-secondary) {
    min-height: var(--control-height) !important;
    padding: 4px 7px !important;
    font-size: 11px !important;
  }

  /* ========================================================
     DROPDOWN RESULTS
     ======================================================== */

  .product-form-page-shell
    :global(.product-picker-menu) {
    margin-top: 3px !important;
    border-radius: 9px !important;
  }

  .product-form-page-shell
    :global(.product-picker-menu .list-group-item) {
    min-height: 28px !important;
    padding: 5px 8px !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
  }

  /* ========================================================
     DESCRIPTION
     ======================================================== */

  .product-form-page-shell
    :global(.description-textarea),
  .product-form-page-shell
    :global(.product-description-field .textarea),
  .product-form-page-shell
    :global(.form-card-extra .description-textarea) {
    height: 76px !important;
    min-height: 76px !important;
    max-height: 110px !important;
    padding: 6px 8px 18px !important;
    font-size: 12px !important;
    resize: vertical;
  }

  .product-form-page-shell
    :global(.field-counter) {
    bottom: 6px !important;
    inset-inline-end: 8px !important;
    font-size: 9px !important;
  }

  /* ========================================================
     IMAGE UPLOAD
     ======================================================== */

  .product-form-page-shell
    :global(.image-upload),
  .product-form-page-shell
    :global(.form-card-extra .image-upload) {
    min-height: 96px !important;
    padding: 8px !important;
    gap: 5px !important;
    border-radius: 11px !important;
  }

  .product-form-page-shell
    :global(.image-upload__icon) {
    font-size: 20px !important;
  }

  .product-form-page-shell
    :global(.image-upload__text) {
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  .product-form-page-shell
    :global(.image-upload__hint) {
    font-size: 9px !important;
  }

  .product-form-page-shell
    :global(.image-upload__actions) {
    gap: 6px !important;
  }

  .product-form-page-shell
    :global(.image-upload__choose),
  .product-form-page-shell
    :global(.image-upload__search) {
    min-height: 30px !important;
    padding: 5px 9px !important;
    gap: 5px !important;
    border-radius: 7px !important;
    font-size: 10px !important;
  }

  .product-form-page-shell
    :global(.image-upload .preview-image) {
    width: min(100%, 140px) !important;
    height: 86px !important;
    border-radius: 9px !important;
  }

  /* ========================================================
     IMAGE SEARCH RESULTS
     ======================================================== */

  .product-form-page-shell
    :global(.product-image-search-results) {
    gap: 10px !important;
    margin-top: 10px !important;
    padding: 10px !important;
    border-radius: 12px !important;
  }

  /* ========================================================
     TOGGLES, CHECKBOXES AND RADIO INPUTS
     ======================================================== */

  .product-form-page-shell
    :global(.form-check-input) {
    width: 14px !important;
    height: 14px !important;
    margin-top: 0 !important;
  }

  .product-form-page-shell
    :global(.form-check-label) {
    font-size: 11px !important;
  }

  /* ========================================================
     ACTION BAR
     ======================================================== */

  .product-form-page-shell
    :global(.form-actions) {
    position: sticky;
    z-index: 30;
    bottom: 0;

    gap: 7px !important;
    margin-top: 10px !important;
    padding: 8px 10px !important;

    border-radius: 11px !important;

    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(7px);

    box-shadow:
      0 -5px 16px rgba(15, 23, 42, 0.06) !important;
  }

  .product-form-page-shell
    :global(.form-actions button),
  .product-form-page-shell
    :global(.form-actions .btn-primary),
  .product-form-page-shell
    :global(.form-actions .btn-secondary),
  .product-form-page-shell
    :global(.form-actions .btn-neutral) {
    min-height: 32px !important;
    padding: 5px 11px !important;
    border-radius: 8px !important;
    font-size: 11px !important;
    line-height: 1.2 !important;
  }

  /* ========================================================
     MOBILE
     ======================================================== */

  @media (max-width: 768px) {
    .product-form-page-shell {
      max-width: none;
      padding: 6px !important;
    }

    .product-form-page-shell
      :global(.product-form-page) {
      padding: 0 0 12px !important;
    }

    .product-form-page-shell
      :global(.product-page-header) {
      padding: 9px 10px !important;
    }

    .product-form-page-shell
      :global(.product-page-form-layout) {
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }

    .product-form-page-shell
      :global(.form-card) {
      padding: 10px !important;
    }

    .product-form-page-shell
      :global(.product-form-grid) {
      grid-template-columns: 1fr !important;
    }

    .product-form-page-shell
      :global(.form-actions) {
      align-items: stretch;
      flex-direction: column;
    }

    .product-form-page-shell
      :global(.form-actions button) {
      width: 100%;
    }
  }

  /* Dark theme */

  :global(html.dark) .product-form-page-shell {
    color: var(--erp-text, #e5edf8);
    color-scheme: dark;
  }

  :global(html.dark) .product-form-page-shell
    :global(.product-form-page),
  :global(html.dark) .product-form-page-shell
    :global(.product-form-page__body),
  :global(html.dark) .product-form-page-shell
    :global(.product-form-page__inner),
  :global(html.dark) .product-form-page-shell
    :global(.product-form-body) {
    color: var(--erp-text, #e5edf8);
    background: transparent;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-card),
  :global(html.dark) .product-form-page-shell
    :global(.product-page-header) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface, #111827) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-card__title),
  :global(html.dark) .product-form-page-shell
    :global(.section-title),
  :global(html.dark) .product-form-page-shell
    :global(.product-form-section-title),
  :global(html.dark) .product-form-page-shell
    :global(.product-page-header__title) {
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.field-label),
  :global(html.dark) .product-form-page-shell
    :global(.product-static-label),
  :global(html.dark) .product-form-page-shell
    :global(.form-label),
  :global(html.dark) .product-form-page-shell
    :global(.form-outline .form-label),
  :global(html.dark) .product-form-page-shell
    :global(.form-check-label) {
    color: #c8d3e2 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.product-page-header__subtitle),
  :global(html.dark) .product-form-page-shell
    :global(.field-counter),
  :global(html.dark) .product-form-page-shell
    :global(.image-upload__text),
  :global(html.dark) .product-form-page-shell
    :global(.image-upload__hint) {
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.product-page-header__icon) {
    background: rgba(47, 111, 237, 0.16) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input),
  :global(html.dark) .product-form-page-shell
    :global(.select),
  :global(html.dark) .product-form-page-shell
    :global(.textarea),
  :global(html.dark) .product-form-page-shell
    :global(.form-control),
  :global(html.dark) .product-form-page-shell
    :global(.form-select),
  :global(html.dark) .product-form-page-shell
    :global(.form-outline .form-control),
  :global(html.dark) .product-form-page-shell
    :global(.input-action-control),
  :global(html.dark) .product-form-page-shell
    :global(.field-quick-create-wrap),
  :global(html.dark) .product-form-page-shell
    :global(.price-control),
  :global(html.dark) .product-form-page-shell
    :global(.field-currency-group),
  :global(html.dark) .product-form-page-shell
    :global(.price-control-row__percent),
  :global(html.dark) .product-form-page-shell
    :global(.product-date-picker) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-action-control:hover) {
    border-color: #42546d !important;
    background: #1d293b !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__input),
  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__input--selected),
  :global(html.dark) .product-form-page-shell
    :global(.price-input),
  :global(html.dark) .product-form-page-shell
    :global(.field-currency-input),
  :global(html.dark) .product-form-page-shell
    :global(.field-currency-group .form-control) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: transparent !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input::placeholder),
  :global(html.dark) .product-form-page-shell
    :global(.textarea::placeholder),
  :global(html.dark) .product-form-page-shell
    :global(.form-control::placeholder),
  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__input::placeholder) {
    color: #718198 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-with-icon__icon) {
    color: #8fa0b8 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__btn),
  :global(html.dark) .product-form-page-shell
    :global(.price-control__currency),
  :global(html.dark) .product-form-page-shell
    :global(.field-currency-btn),
  :global(html.dark) .product-form-page-shell
    :global(.price-control__currency-select),
  :global(html.dark) .product-form-page-shell
    :global(.price-control__currency-select .filter-select__trigger),
  :global(html.dark) .product-form-page-shell
    :global(.input-group-text),
  :global(html.dark) .product-form-page-shell
    :global(.date-picker-icon) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: #202b3d !important;
    color: #a9b7ca !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__btn:hover),
  :global(html.dark) .product-form-page-shell
    :global(.price-control__currency:hover),
  :global(html.dark) .product-form-page-shell
    :global(.field-currency-btn:hover) {
    background: #27354a !important;
    color: #8bb7ff !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.input-action-control__btn--create),
  :global(html.dark) .product-form-page-shell
    :global(.field-quick-create-btn) {
    background: #1769e8 !important;
    color: #ffffff !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.filter-select__trigger) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.filter-select__menu),
  :global(html.dark) .product-form-page-shell
    :global(.product-picker-menu),
  :global(html.dark) .product-form-page-shell
    :global(.product-filter-menu),
  :global(html.dark) .product-form-page-shell
    :global(.dropdown-menu) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface, #111827) !important;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.filter-select__option),
  :global(html.dark) .product-form-page-shell
    :global(.product-picker-menu .list-group-item),
  :global(html.dark) .product-form-page-shell
    :global(.product-filter-menu .dropdown-item),
  :global(html.dark) .product-form-page-shell
    :global(.dropdown-item) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: transparent !important;
    color: #c8d3e2 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.filter-select__option:hover),
  :global(html.dark) .product-form-page-shell
    :global(.filter-select__option.is-active),
  :global(html.dark) .product-form-page-shell
    :global(.product-picker-menu .list-group-item:hover),
  :global(html.dark) .product-form-page-shell
    :global(.product-filter-menu .dropdown-item:hover),
  :global(html.dark) .product-form-page-shell
    :global(.dropdown-item:hover) {
    background: #1d2b40 !important;
    color: #8bb7ff !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.product-date-picker .gregorian-date-text) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: transparent !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.price-control-row__percent.is-active) {
    border-color: #80651e !important;
    background: #3a3017 !important;
    color: #f4c967 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.image-upload),
  :global(html.dark) .product-form-page-shell
    :global(.product-image-dropzone),
  :global(html.dark) .product-form-page-shell
    :global(.preview-empty),
  :global(html.dark) .product-form-page-shell
    :global(.product-image-search-results) {
    border-color: #36557f !important;
    background: #15233a !important;
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.preview-image),
  :global(html.dark) .product-form-page-shell
    :global(.product-image-search-results img) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface-soft, #172033) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-actions) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: rgba(17, 24, 39, 0.96) !important;
    box-shadow: 0 -8px 26px rgba(0, 0, 0, 0.24) !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-actions .btn-secondary) {
    border-color: #36557f !important;
    background: #16243a !important;
    color: #8bb7ff !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-actions .btn-neutral),
  :global(html.dark) .product-form-page-shell
    :global(.product-page-header__back),
  :global(html.dark) .product-form-page-shell
    :global(.input-with-icon__action) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: #c8d3e2 !important;
  }

  :global(html.dark) .product-form-page-shell
    :global(.form-actions .btn-neutral:hover),
  :global(html.dark) .product-form-page-shell
    :global(.product-page-header__back:hover),
  :global(html.dark) .product-form-page-shell
    :global(.input-with-icon__action:hover) {
    background: #202b3d !important;
    color: var(--erp-text, #e5edf8) !important;
  }
</style>
