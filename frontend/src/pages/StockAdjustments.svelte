<script>
  import { onMount } from 'svelte';
  import { productApi } from '../api/productApi.js';
  import { warehouseApi } from '../api/warehouseApi.js';
  import { warehouseProductApi } from '../api/warehouseProductApi.js';
  import { stockAdjustmentApi } from '../api/stockAdjustmentApi.js';
  import { toast } from '../ToastUI/toast.js';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import { t, lang } from '../i18n/i18n';
  import { showDate } from '../calendar.js';

  let reasons = [];
  $: $lang, reasons = [
    t('Physical stock count'),
    t('Data entry error'),
    t('Damaged'),
    t('Theft/Loss'),
    t('Other'),
  ];
  const number = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  let view = 'history';
  let products = [], warehouses = [], adjustments = [], report = [];
  let loading = true, saving = false, error = '', productSearch = '', warehouseSearch = '', historySearch = '', warehouseQty = 0;
  let showProductDropdown = false, showWarehouseDropdown = false, activeProductIndex = 0, activeWarehouseIndex = 0;
  let form = { product_id: '', warehouse_id: '', adjustment_type: 'increase', qty: '', reason: t('Physical stock count'), note: '' };
  let filters = { product_id: '', warehouse_id: '', adjustment_type: '', date_from: '', date_to: '' };

  $: selectedProduct = products.find((item) => String(item.id) === String(form.product_id)) || null;
  $: matchingProducts = products.filter((item) => {
    const needle = productSearch.trim().toLowerCase();
    return !needle || [item.name, item.code, item.barcode, item.sku, item.product_code].some((value) => String(value || '').toLowerCase().includes(needle));
  }).slice(0, 10);
  $: matchingWarehouses = warehouses.filter((item) => String(item.name || '').toLowerCase().includes(warehouseSearch.trim().toLowerCase())).slice(0, 10);
  $: quantity = Number(form.qty || 0);
  $: resultingQty = Number(selectedProduct?.quantity || 0) + (form.adjustment_type === 'increase' ? quantity : -quantity);
  $: resultingWarehouseQty = warehouseQty + (form.adjustment_type === 'increase' ? quantity : -quantity);
  $: filteredAdjustments = adjustments.filter((adjustment) => {
    const needle = historySearch.trim().toLowerCase();
    return !needle || [adjustment.product_name, adjustment.product_code, adjustment.warehouse_name, adjustment.reason, adjustment.created_by_name]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });
  $: totalIncrease = report.reduce((sum, row) => sum + Number(row.total_increase || 0), 0);
  $: totalDecrease = report.reduce((sum, row) => sum + Number(row.total_decrease || 0), 0);
  $: adjustmentFilters = [
    { key: 'product_id', label: t('Product'), icon: 'bi-box-seam', value: filters.product_id, options: [{ value: '', label: t('All products') }, ...products.map((p) => ({ value: p.id, label: p.name }))] },
    { key: 'warehouse_id', label: t('Warehouse'), icon: 'bi-building', value: filters.warehouse_id, options: [{ value: '', label: t('All warehouses') }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))] },
    { key: 'adjustment_type', label: t('Direction'), icon: 'bi-arrow-left-right', value: filters.adjustment_type, options: [{ value: '', label: t('All directions') }, { value: 'increase', label: t('Increase') }, { value: 'decrease', label: t('Decrease') }] },
    { key: 'date_from', label: t('From date'), type: 'date', value: filters.date_from },
    { key: 'date_to', label: t('To date'), type: 'date', value: filters.date_to },
  ];

  async function loadReferences() {
    const [productsResult, warehousesResult] = await Promise.all([productApi.getAll({ status: 1, limit: 200 }), warehouseApi.getAll({ status: 1 })]);
    products = productsResult?.data || [];
    warehouses = warehousesResult?.data || [];
  }
  async function loadList() {
    loading = true; error = '';
    try {
      const [listResult, reportResult] = await Promise.all([stockAdjustmentApi.getAll(filters), stockAdjustmentApi.getReport(filters)]);
      adjustments = listResult?.data || [];
      report = reportResult?.data || [];
    } catch (cause) { error = cause.message; } finally { loading = false; }
  }
  async function loadWarehouseQty() {
    warehouseQty = 0;
    if (!form.product_id || !form.warehouse_id) return;
    try {
      const result = await warehouseProductApi.getAll({ product_id: form.product_id, warehouse_id: form.warehouse_id, status: 1 });
      warehouseQty = Number(result?.data?.[0]?.quantity || 0);
    } catch (_) { warehouseQty = 0; }
  }
  function handleProductSearch(event) {
    productSearch = event.currentTarget.value;
    form = { ...form, product_id: '' };
    showProductDropdown = true;
    activeProductIndex = 0;
  }
  function handleWarehouseSearch(event) {
    warehouseSearch = event.currentTarget.value;
    form = { ...form, warehouse_id: '' };
    showWarehouseDropdown = true;
    activeWarehouseIndex = 0;
  }
  function selectProduct(product) {
    productSearch = product.name;
    form = { ...form, product_id: product.id };
    showProductDropdown = false;
    loadWarehouseQty();
  }
  function selectWarehouse(warehouse) {
    warehouseSearch = warehouse.name;
    form = { ...form, warehouse_id: warehouse.id };
    showWarehouseDropdown = false;
    loadWarehouseQty();
  }
  function handleLookupKeydown(event, type) {
    const options = type === 'product' ? matchingProducts : matchingWarehouses;
    const isOpen = type === 'product' ? showProductDropdown : showWarehouseDropdown;
    let activeIndex = type === 'product' ? activeProductIndex : activeWarehouseIndex;
    if (event.key === 'Escape') {
      if (type === 'product') showProductDropdown = false;
      else showWarehouseDropdown = false;
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        if (type === 'product') showProductDropdown = true;
        else showWarehouseDropdown = true;
      }
      if (options.length) activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    } else if (event.key === 'Enter' && isOpen && options.length) {
      event.preventDefault();
      if (type === 'product') selectProduct(options[activeIndex] || options[0]);
      else selectWarehouse(options[activeIndex] || options[0]);
    }
    if (type === 'product') activeProductIndex = activeIndex;
    else activeWarehouseIndex = activeIndex;
  }
  function closeLookupOnOutsideClick(node) {
    const handleClick = (event) => {
      if (!node.contains(event.target)) {
        showProductDropdown = false;
        showWarehouseDropdown = false;
      }
    };
    document.addEventListener('click', handleClick);
    return { destroy: () => document.removeEventListener('click', handleClick) };
  }
  async function openNewAdjustment() { error = ''; await loadReferences(); view = 'new'; }
  function showHistory() { error = ''; view = 'history'; loadList(); }
  function handleFilterChange(event) { filters = { ...filters, [event.detail.key]: event.detail.value }; loadList(); }
  function resetFilters() { historySearch = ''; filters = { product_id: '', warehouse_id: '', adjustment_type: '', date_from: '', date_to: '' }; loadList(); }
  async function save(mode = 'history') {
    error = '';
    if (!form.product_id || !form.warehouse_id || quantity <= 0 || !form.reason.trim()) {
      error = t('Select a product and warehouse, enter a positive quantity, and provide a reason.');
      return;
    }
    if (form.adjustment_type === 'decrease' && (resultingQty < 0 || resultingWarehouseQty < 0)) {
      error = t('The decrease exceeds available stock') + ' (' + number(warehouseQty) + ' ' + t('in this warehouse') + ').';
      return;
    }
    saving = true;
    try {
      const result = await stockAdjustmentApi.create({ ...form, qty: quantity });
      const saved = result.data;
      toast.success(t('Stock adjusted'), (saved.product_name || t('Product')) + ': ' + number(saved.after_qty) + ' ' + t('system units remaining'));
      await loadReferences();
      form = { product_id: '', warehouse_id: '', adjustment_type: 'increase', qty: '', reason: t('Physical stock count'), note: '' };
      productSearch = ''; warehouseSearch = ''; showProductDropdown = false; showWarehouseDropdown = false; warehouseQty = 0;
      if (mode === 'again') { view = 'new'; } else { view = 'history'; await loadList(); }
    } catch (cause) { error = cause.message; } finally { saving = false; }
  }
  onMount(async () => { try { await loadReferences(); await loadList(); } catch (cause) { error = cause.message; loading = false; } });
</script>

<IndexPageLayout ariaLabel={t('Stock adjustments')} toolbarWidth="36rem" showStats={view === 'history'} showFooter={false} dense={true} contained={view === 'history'} contentClass="stock-adjustments-content" tablePadding={true}>
  <svelte:fragment slot="actions">
    {#if view === 'history'}
      <ActionButton icon="bi-plus-lg" label={t('New adjustment')} on:click={openNewAdjustment} />
    {:else}
      <ActionButton variant="secondary" icon="bi-arrow-left" label={t('Adjustment history')} on:click={showHistory} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    {#if view === 'history'}
      <FilterToolbar searchValue={historySearch} searchPlaceholder={t('Search adjustments')} filters={adjustmentFilters} filterLabel={t('Filter adjustments')} resetLabel={t('Clear filters')} on:searchChange={(event) => (historySearch = event.detail)} on:filterChange={handleFilterChange} on:reset={resetFilters} />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="stats">
    {#if view === 'history'}
      <div class="index-summary-grid">
        <SummaryCard label={t('Matching adjustments')} value={String(adjustments.length)} icon="bi-clipboard-data" tone="cyan" />
        <SummaryCard label={t('Products affected')} value={String(report.length)} icon="bi-box-seam" tone="blue" />
        <SummaryCard label={t('Total increase')} value={'+' + number(totalIncrease)} icon="bi-arrow-up-right" tone="green" />
        <SummaryCard label={t('Total decrease')} value={'-' + number(totalDecrease)} icon="bi-arrow-down-right" tone="amber" />
      </div>
    {/if}
  </svelte:fragment>

  {#if error}<div class="adjustment-error" role="alert"><i class="bi bi-exclamation-circle"></i>{error}</div>{/if}

  {#if view === 'new'}
    <div class="adjustment-editor">
      <aside class="count-preview">
        <header><span><i class="bi bi-calculator"></i></span><div><strong>{t('Count preview')}</strong><small>{t('Updates before you save')}</small></div></header>
        {#if selectedProduct}
          <div class="preview-product"><strong>{selectedProduct.name}</strong></div>
          <dl>
            <div><dt>{t('System quantity')}</dt><dd>{number(selectedProduct.quantity)}</dd></div>
            <div><dt>{t('Warehouse quantity')}</dt><dd>{number(warehouseQty)}</dd></div>
            <div class:decrease={form.adjustment_type === 'decrease'} class="preview-change"><dt>{t('Adjustment')}</dt><dd>{form.adjustment_type === 'increase' ? '+' : '-'}{number(quantity)}</dd></div>
            <div class="preview-result"><dt>{t('New system quantity')}</dt><dd class:invalid={resultingQty < 0}>{number(resultingQty)}</dd></div>
            <div class="preview-result"><dt>{t('New warehouse quantity')}</dt><dd class:invalid={resultingWarehouseQty < 0}>{number(resultingWarehouseQty)}</dd></div>
          </dl>
        {:else}<div class="preview-empty"><i class="bi bi-box-seam"></i><p>{t('Choose a product to see the resulting stock level.')}</p></div>{/if}
      </aside>

      <section class="adjustment-form-card">
        <header class="form-card-header"><span><i class="bi bi-sliders2"></i></span><div><h1>{t('New stock adjustment')}</h1></div></header>
        <form class="adjustment-form" on:submit|preventDefault={save}>

          <div class="form-grid product-warehouse-row">
            <label class="form-field lookup-field" use:closeLookupOnOutsideClick><span>{t('Product')}</span><div class="lookup-control" on:click|stopPropagation><i class="bi bi-search" aria-hidden="true"></i><input type="search" value={productSearch} on:input={handleProductSearch} on:focus={() => (showProductDropdown = true)} on:keydown={(event) => handleLookupKeydown(event, 'product')} placeholder={t('Select product')} autocomplete="off" required /></div>{#if showProductDropdown}<div class="lookup-results" on:click|stopPropagation>{#each matchingProducts as product, index (product.id)}<button type="button" class:active={index === activeProductIndex} on:mousedown|preventDefault={() => selectProduct(product)}><strong>{product.name}</strong></button>{/each}{#if !matchingProducts.length}<div class="lookup-empty">{t('No products found.')}</div>{/if}</div>{/if}</label>
            <label class="form-field lookup-field" use:closeLookupOnOutsideClick><span>{t('Warehouse')}</span><div class="lookup-control" on:click|stopPropagation><i class="bi bi-search" aria-hidden="true"></i><input type="search" value={warehouseSearch} on:input={handleWarehouseSearch} on:focus={() => (showWarehouseDropdown = true)} on:keydown={(event) => handleLookupKeydown(event, 'warehouse')} placeholder={t('Select warehouse')} autocomplete="off" required /></div>{#if showWarehouseDropdown}<div class="lookup-results" on:click|stopPropagation>{#each matchingWarehouses as warehouse, index (warehouse.id)}<button type="button" class:active={index === activeWarehouseIndex} on:mousedown|preventDefault={() => selectWarehouse(warehouse)}><strong>{warehouse.name}</strong></button>{/each}{#if !matchingWarehouses.length}<div class="lookup-empty">{t('No warehouses found.')}</div>{/if}</div>{/if}</label>
          </div>
          <div class="form-grid adjustment-grid">
            <fieldset class="direction-field"><legend>{t('Direction')}</legend><label><input type="radio" bind:group={form.adjustment_type} value="increase" /><span class="increase"><i class="bi bi-plus-lg"></i>{t('Increase')}</span></label><label><input type="radio" bind:group={form.adjustment_type} value="decrease" /><span class="decrease"><i class="bi bi-dash-lg"></i>{t('Decrease')}</span></label></fieldset>
            <label class="form-field"><span>{t('Quantity')}</span><input type="number" min="0.001" step="0.001" bind:value={form.qty} placeholder="0.000" required /></label>
          </div>

          <div class="form-grid"><label class="form-field"><span>{t('Reason')}</span><select bind:value={form.reason}>{#each reasons as reason}<option value={reason}>{reason}</option>{/each}</select></label><label class="form-field"><span>{t('Note')} <em>{t('Optional')}</em></span><textarea bind:value={form.note} rows="2" placeholder={t('Add count sheet, shelf, or incident details')}></textarea></label></div>
          <div class="form-actions"><ActionButton type="submit" icon="bi-check2-circle" label={t('Save adjustment')} loading={saving} disabled={saving || !selectedProduct || !form.warehouse_id} /><ActionButton type="button" variant="secondary" label={t('Save adjustment and add another')} loading={saving} disabled={saving || !selectedProduct || !form.warehouse_id} on:click={() => save('again')} /><ActionButton type="button" variant="secondary" label={t('Cancel')} on:click={showHistory} /></div>
        </form>
      </section>
    </div>
  {:else if loading}
    <div class="index-table-state"><EmptyState loading={true} message={t('Loading stock adjustments')} /></div>
  {:else if !filteredAdjustments.length}
    <div class="index-table-state"><EmptyState icon="bi-clipboard2-x" message={adjustments.length ? t('No adjustments match your search.') : t('No stock adjustments have been recorded.')}><ActionButton icon="bi-plus-lg" label={t('Record adjustment')} on:click={openNewAdjustment} /></EmptyState></div>
  {:else}
    <DataTable ariaLabel={t('Stock adjustments')} minWidth="900px" dense={true} striped={true} hover={false} stickyHeader={true} layout="fixed" scrollbar="thin">
      <svelte:fragment slot="head"><tr><th>{t('After quantity')}</th><th>{t('Created by')}</th><th>{t('Reason')}</th><th>{t('Quantity')}</th><th>{t('Direction')}</th><th>{t('Warehouse')}</th><th>{t('Product')}</th><th>{t('Date')}</th></tr></svelte:fragment>
      {#each filteredAdjustments as adjustment (adjustment.id)}
        <tr><td><strong>{number(adjustment.after_qty)}</strong></td><td>{adjustment.created_by_name || 'User #' + adjustment.created_by}</td><td>{adjustment.reason}{#if adjustment.note}<small class="cell-meta">{adjustment.note}</small>{/if}</td><td><span class:down-qty={adjustment.adjustment_type === 'decrease'} class="quantity-cell">{adjustment.adjustment_type === 'increase' ? '+' : '-'}{number(adjustment.qty)}</span></td><td><StatusBadge tone={adjustment.adjustment_type === 'increase' ? 'positive' : 'negative'}>{adjustment.adjustment_type === 'increase' ? t('Increase') : t('Decrease')}</StatusBadge></td><td>{adjustment.warehouse_name}</td><td><strong class="product-cell">{adjustment.product_name}</strong></td><td><StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(adjustment.created_at)}</StatusBadge></td></tr>
      {/each}
    </DataTable>
  {/if}
</IndexPageLayout>

<style>
  /* The shared index layout clips content for table views. This route also
     contains a taller editor, so its content pane must own vertical scroll. */
  :global(.stock-adjustments-content) {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  :global(.stock-adjustments-content .data-table-wrap) { flex: 1 1 auto; }
  :global(.stock-adjustments-content .data-table th:first-child),
  :global(.stock-adjustments-content .data-table td:first-child) {
    text-align: right;
    direction: rtl;
  }
  .index-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.75rem; }
  .adjustment-error { display:flex; align-items:center; gap:.5rem; margin:.85rem 0 0; padding:.65rem .8rem; border:1px solid #fecaca; border-radius:.55rem; background:#fef2f2; color:#b91c1c; font-size:.8rem; font-weight:650; }
  .cell-meta { display:block; max-width:100%; margin-top:.12rem; overflow:hidden; color:#94a3b8; font-size:.68rem; line-height:1.3; text-overflow:ellipsis; white-space:nowrap; }
  .product-cell { display:block; overflow:hidden; color:#1e293b; font-weight:750; text-overflow:ellipsis; white-space:nowrap; }.quantity-cell { color:#047857; font-weight:800; }.quantity-cell.down-qty { color:#b91c1c; }
  .adjustment-editor { display:grid; grid-template-columns:minmax(16.5rem,.36fr) minmax(0,1fr); gap:1rem; width:100%; padding:1.25rem 0; }
  .adjustment-form-card,.count-preview { border:1px solid #dfe5ed; border-radius:.75rem; background:#fff; box-shadow:0 2px 8px rgba(15,23,42,.025); }.adjustment-form-card { overflow:hidden; }
  .form-card-header,.count-preview header { display:flex; align-items:flex-start; gap:.75rem; padding:1rem 1.1rem; border-bottom:1px solid #edf1f5; background:#fafcff; direction:rtl; }.form-card-header>span,.count-preview header>span { display:grid; place-items:center; flex:0 0 auto; width:2.15rem; height:2.15rem; border-radius:.6rem; background:#eff6ff; color:#0f6efd; }.count-preview header>span { color:#0891b2; background:#ecfeff; }.form-card-header>div,.count-preview header>div { direction:rtl; text-align:right; }
  .form-card-header h1 { margin:0; color:#172033; font-size:1rem; font-weight:800; }.form-card-header p,.count-preview header small { display:block; margin:.18rem 0 0; color:#64748b; font-size:.76rem; line-height:1.45; }.count-preview header strong { color:#334155; font-size:.82rem; }
  .adjustment-form { display:grid; gap:1rem; padding:1.1rem; direction:rtl; }.form-section h2 { margin:0; color:#334155; font-size:.82rem; font-weight:800; }.form-section p { margin:.18rem 0 0; color:#7c8da3; font-size:.72rem; }.form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; }.form-field { display:grid; min-width:0; gap:.38rem; color:#475569; font-size:.74rem; font-weight:750; text-align:right; }.form-field--full { grid-column:1 / -1; }.form-field em { margin-right:.2rem; color:#94a3b8; font-size:.67rem; font-style:normal; font-weight:500; }
  .form-field input,.form-field select,.form-field textarea { width:100%; min-height:2.45rem; padding:.48rem .65rem; border:1px solid #d6e0ed; border-radius:.55rem; outline:0; background:#fff; color:#172033; direction:rtl; text-align:right; font:inherit; font-size:.8rem; }.form-field textarea { min-height:4.6rem; resize:vertical; }.form-field input:focus,.form-field select:focus,.form-field textarea:focus { border-color:#79a8f8; box-shadow:0 0 0 3px rgba(37,99,235,.09); }
  .lookup-field { position:relative; }.lookup-control { display:flex; align-items:center; min-height:2.45rem; overflow:hidden; border:1px solid #d6e0ed; border-radius:.55rem; background:#fff; direction:rtl; }.lookup-control:focus-within { border-color:#79a8f8; box-shadow:0 0 0 3px rgba(37,99,235,.09); }.lookup-control i { flex:0 0 2.1rem; color:#94a3b8; text-align:center; }.lookup-control input { min-height:2.35rem; border:0; box-shadow:none; }.lookup-control input:focus { border:0; box-shadow:none; }.lookup-results { position:absolute; z-index:20; top:calc(100% + .35rem); right:0; left:0; max-height:14rem; overflow:auto; padding:.25rem; border:1px solid #d6e0ed; border-radius:.55rem; background:#fff; box-shadow:0 8px 22px rgba(15,23,42,.12); }.lookup-results button { display:flex; align-items:flex-start; justify-content:space-between; width:100%; gap:.75rem; padding:.55rem .65rem; border:0; border-radius:.4rem; background:transparent; color:#172033; direction:rtl; text-align:right; cursor:pointer; }.lookup-results button:hover,.lookup-results button.active { background:#eff6ff; }.lookup-results strong { overflow:hidden; font-size:.78rem; text-overflow:ellipsis; white-space:nowrap; }.lookup-results small { flex:0 0 auto; color:#94a3b8; font-size:.68rem; }.lookup-empty { padding:.8rem; color:#94a3b8; font-size:.74rem; text-align:center; }
  /* FIX: force product + warehouse onto one row and let long select text shrink */
  .product-warehouse-row { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .product-warehouse-row .form-field select { min-width:0; max-width:100%; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; }
  .adjustment-grid { grid-template-columns:minmax(0,1.65fr) minmax(9rem,.35fr); align-items:end; }.direction-field { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; margin:0; padding:0; border:0; }.direction-field legend { grid-column:1 / -1; color:#475569; font-size:.74rem; font-weight:750; }.direction-field input { position:absolute; opacity:0; }.direction-field span { display:flex; align-items:center; justify-content:center; gap:.35rem; min-height:2.45rem; border:1px solid #d6e0ed; border-radius:.55rem; color:#475569; font-size:.78rem; font-weight:750; cursor:pointer; }.direction-field input:checked + .increase { border-color:#93c5fd; background:#eff6ff; color:#0f6efd; }.direction-field input:checked + .decrease { border-color:#fca5a5; background:#fff1f2; color:#be123c; }
  .form-actions { display:flex; justify-content:flex-end; gap:.5rem; padding-top:.15rem; border-top:1px solid #edf1f5; }.form-actions :global(.action-btn) { min-height:2.45rem; padding-inline:.9rem; }
  .count-preview { align-self:start; overflow:hidden; }.preview-product { display:grid; gap:.1rem; padding:.85rem 1rem .4rem; }.preview-product strong { color:#172033; font-size:.83rem; }.preview-product small { color:#94a3b8; font-size:.68rem; }.count-preview dl { margin:0; padding:.25rem 1rem 1rem; }.count-preview dl>div { display:flex; justify-content:space-between; gap:.5rem; padding:.72rem 0; border-bottom:1px solid #edf1f5; }.count-preview dt { color:#64748b; font-size:.74rem; font-weight:650; }.count-preview dd { margin:0; color:#334155; font-size:.84rem; font-weight:800; }.preview-change dd { color:#047857; }.preview-change.decrease dd,.preview-result dd.invalid { color:#b91c1c; }.preview-result { border-bottom:0!important; }.preview-result dd { color:#0f6efd; font-size:.95rem!important; }.preview-empty { display:grid; place-items:center; min-height:19rem; padding:1rem; color:#94a3b8; text-align:center; }.preview-empty i { color:#cbd5e1; font-size:2rem; }.preview-empty p { max-width:13rem; margin:.5rem 0 0; font-size:.76rem; line-height:1.5; }
  :global(html.dark) .adjustment-form-card,:global(html.dark) .count-preview { border-color:var(--erp-border); background:var(--erp-surface); }:global(html.dark) .form-card-header,:global(html.dark) .count-preview header { border-color:var(--erp-border); background:var(--erp-surface-soft); }:global(html.dark) .form-card-header h1,:global(html.dark) .count-preview header strong,:global(html.dark) .preview-product strong,:global(html.dark) .count-preview dd,:global(html.dark) .product-cell { color:var(--erp-text); }:global(html.dark) .form-field,:global(html.dark) .form-section h2,:global(html.dark) .direction-field legend,:global(html.dark) .direction-field span { color:var(--erp-text-soft); }:global(html.dark) .form-field input,:global(html.dark) .form-field select,:global(html.dark) .form-field textarea,:global(html.dark) .direction-field span { border-color:var(--erp-border); background:var(--erp-surface-soft); color:var(--erp-text); }:global(html.dark) .count-preview dl>div,:global(html.dark) .form-actions { border-color:var(--erp-border); }
  @media(max-width:991.98px) { .adjustment-editor { grid-template-columns:1fr; }.count-preview { display:none; } } @media(max-width:767.98px) { .index-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.form-grid,.adjustment-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.form-field--full { grid-column:auto; }.form-actions :global(.action-btn) { flex:1; } } @media(max-width:420px) { .index-summary-grid { grid-template-columns:1fr; }.form-grid,.adjustment-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.direction-field { grid-template-columns:1fr; } }
</style>