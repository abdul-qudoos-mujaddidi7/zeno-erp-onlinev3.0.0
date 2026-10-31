<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { warehouseProductApi } from '../../api/warehouseProductApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import WarehouseModal from './WarehouseModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  import { toast } from '../../ToastUI/toast.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let warehouseModalRef;
  let warehouses = [];
  let warehouseProducts = [];
  let loading = true;

  let searchTerm = '';
  let filterStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'name';
  let sortDirection = 'asc';
  let showSummaryCards = false;

  async function loadWarehouses() {
    loading = true;
    try {
      const [activeWarehouses, archivedWarehouses, products] = await Promise.all([
        warehouseApi.getAll({ status: 1 }).then((response) => response?.data || []),
        warehouseApi.getAll({ status: 0 }).then((response) => response?.data || []),
        warehouseProductApi.getAll({ status: 1 }).then((response) => response?.data || []),
      ]);
      warehouses = [...activeWarehouses, ...archivedWarehouses];
      warehouseProducts = products.filter((item) => item.status !== 0);
    } catch (error) {
      console.error('Failed to load warehouses:', error);
    } finally {
      loading = false;
    }
  }

  onMount(loadWarehouses);

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getProductCount(warehouseId) {
    return warehouseProducts.filter((item) => item.warehouse_id == warehouseId).length;
  }

  function getWarehouseQuantity(warehouseId) {
    return warehouseProducts
      .filter((item) => item.warehouse_id == warehouseId)
      .reduce((total, item) => total + Math.abs(Number(item.quantity || 0)), 0);
  }

  async function changeWarehouseStatus(warehouse) {
    const deactivating = Number(warehouse.status) === 1;

    if (deactivating && getWarehouseQuantity(warehouse.id) > 1e-9) {
      toast.error(
        t('Cannot deactivate warehouse'),
        t('Warehouse cannot be deactivated while it contains product quantity.'),
      );
      return;
    }

    const action = deactivating ? t('Deactivate') : t('Activate');
    const confirmed = await toast.confirm(
      t('Are you sure?'),
      `${action} ${warehouse.name}?`,
    );
    if (!confirmed) return;

    try {
      await warehouseApi.update(warehouse.id, {
        name: warehouse.name,
        location: warehouse.location || null,
        manager_name: warehouse.manager_name || null,
        description: warehouse.description || null,
        isDefault: Number(warehouse.isDefault || 0),
        status: deactivating ? 0 : 1,
      });
      await loadWarehouses();
      toast.success(
        t('Success'),
        deactivating
          ? t('Warehouse deactivated successfully.')
          : t('Warehouse activated successfully.'),
      );
    } catch (error) {
      console.error('Failed to change warehouse status:', error);
      toast.error(t('Error'), error.message || t('Error'));
    }
  }

  function getPageNumbers(current, total) {
    const range = [];
    const compact = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) range.push(page);
    }
    for (const page of range) {
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  $: filteredWarehouses = warehouses
    .filter((warehouse) => {
      if (filterStatus === 'active' && warehouse.status !== 1) return false;
      if (filterStatus === 'inactive' && warehouse.status === 1) return false;

      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return [
        warehouse.id,
        warehouse.name,
        warehouse.location,
        warehouse.manager_name,
        warehouse.description,
      ].some((value) => String(value ?? '').toLowerCase().includes(term));
    })
    .sort((a, b) => {
      let left = sortColumn === 'products' ? getProductCount(a.id) : a[sortColumn];
      let right = sortColumn === 'products' ? getProductCount(b.id) : b[sortColumn];

      if (['id', 'products'].includes(sortColumn)) {
        left = Number(left) || 0;
        right = Number(right) || 0;
      } else {
        left = String(left ?? '').toLowerCase();
        right = String(right ?? '').toLowerCase();
      }
      if (left === right) return 0;
      const result = left < right ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });

  $: totalPages = Math.ceil(filteredWarehouses.length / itemsPerPage);
  $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
  $: paginatedWarehouses = filteredWarehouses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );
  $: activeCount = warehouses.filter((warehouse) => warehouse.status === 1).length;
  $: inactiveCount = warehouses.filter((warehouse) => warehouse.status !== 1).length;

  $: warehouseToolbarFilters = [
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All Statuses') },
        { value: 'active', label: t('Active') },
        { value: 'inactive', label: t('Inactive') },
      ],
    },
  ];

  function handleToolbarFilter(event) {
    if (event.detail.key === 'status') filterStatus = event.detail.value;
    currentPage = 1;
  }

  function resetFilters() {
    filterStatus = 'active';
    currentPage = 1;
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Warehouses')}
  showStats={showSummaryCards}
  showFooter={!loading && filteredWarehouses.length > 0}
  dense={true}
  contentClass="warehouses-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('New Warehouse')}`}
      on:click={() => warehouseModalRef?.openWarehouseModal()} />

    <button
      type="button"
      class="index-settings-button"
      class:is-active={showSummaryCards}
      aria-label={t('Summary')}
      aria-expanded={showSummaryCards}
      title={t('Summary')}
      on:click={() => (showSummaryCards = !showSummaryCards)}>
      <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-building'}" aria-hidden="true"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search warehouses...')}
      filters={warehouseToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        currentPage = 1;
      }}
      on:filterChange={handleToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid">
      <SummaryCard label={t('Warehouses')} icon="bi-building" tone="cyan">
        {warehouses.length}
      </SummaryCard>
      <SummaryCard label={t('Active')} icon="bi-check2-circle" tone="green">
        {activeCount}
      </SummaryCard>
      <SummaryCard label={t('Inactive')} icon="bi-pause-circle" tone="amber">
        {inactiveCount}
      </SummaryCard>
      <SummaryCard label={t('Products')} icon="bi-box-seam" tone="purple">
        {warehouseProducts.length}
      </SummaryCard>
    </div>
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredWarehouses.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-building" message={t('No warehouses found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Warehouses')}
       minWidth="900px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('name')}>
            {t('Name')}{t('-of-')}{t('Warehouse')}
            {#if sortColumn === 'name'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('location')}>
            {t('Location')}
            {#if sortColumn === 'location'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Manager Name')}</th>
          <th class="cursor-pointer" on:click={() => setSort('products')}>
            {t('Products')}
            {#if sortColumn === 'products'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Description')}</th>
          <th>{t('Status')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedWarehouses as warehouse, index (warehouse.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td class="col-start">
            <button
              type="button"
              class="warehouse-link"
              on:click={() => push(`/dashboard/warehouse/${warehouse.id}`)}>
              {warehouse.name}
            </button>
          </td>
          <td>
            <span class="location-cell">
              <i class="bi bi-geo-alt" aria-hidden="true"></i>
              {warehouse.location || '—'}
            </span>
          </td>
          <td>{warehouse.manager_name || '—'}</td>
          <td>
            <StatusBadge tone="neutral" ltr={true}>
              {getProductCount(warehouse.id)}
            </StatusBadge>
          </td>
          <td>
            <span class="description-cell" title={warehouse.description || ''}>
              {warehouse.description || '—'}
            </span>
          </td>
          <td>
            <StatusBadge tone={warehouse.status === 1 ? 'positive' : 'neutral'}>
              {warehouse.status === 1 ? t('Active') : t('Inactive')}
            </StatusBadge>
          </td>
          <td>
            <div class="visible-table-actions">
              <ActionButton
                variant="icon"
                tone="view"
                icon="bi-box-seam"
                title={t('View')}
                on:click={() => push(`/dashboard/warehouse/${warehouse.id}`)} />
              <ActionButton
                variant="icon"
                tone="edit"
                icon="bi-pencil"
                title={t('Edit')}
                on:click={() => warehouseModalRef?.editWarehouse(warehouse)} />
              <ActionButton
                variant="icon"
                tone={warehouse.status === 1 ? 'danger' : 'edit'}
                icon={warehouse.status === 1 ? 'bi-pause-circle' : 'bi-play-circle'}
                title={warehouse.status === 1 ? t('Deactivate') : t('Activate')}
                on:click={() => changeWarehouseStatus(warehouse)} />
            </div>
          </td>
        </tr>
      {/each}
    </DataTable>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredWarehouses.length}
      ariaLabel={t('Warehouses pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<WarehouseModal bind:this={warehouseModalRef} on:saved={loadWarehouses} />

<style>

:global(.warehouses-index-content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

:global(.warehouses-index-content .data-table-wrap) {
  flex: 1 1 auto;
  min-height: 0;
}

:global(.warehouses-index-content .pagination-shell) {
  margin-top: auto;
}

  .cursor-pointer {
    cursor: pointer;
  }

  .cell-muted {
    color: #7b8ba1;
    font-weight: 650;
  }

  .warehouse-link {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 800;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .warehouse-link:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }

  .location-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #526176;
  }

  .location-cell i {
    color: #94a3b8;
  }

  .description-cell {
    display: block;
    overflow: hidden;
    color: #64748b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visible-table-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
