<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { productionApi } from '../../api/productionApi.js';
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { getMultiple } from '../stocktransactions/calculateStock.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';
  import { showDate } from '../../calendar.js';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { productApi } from '../../api/productApi.js';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let productions = [];
  let currencies = [];

  /* Production edit/delete actions are hidden for now. */
  const showProductionEditAction = false;
  let accounts = [];
  let warehouses = [];
  let loading = true;
  let products = [];
  let units = [];

  let searchTerm = '';
  let filterStatus = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  let fromDate = '';
  let toDate = '';

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  async function load() {
    loading = true;
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    productions = (await productionApi.getAll({ status: 1 }))?.data || [];

    loading = false;
  }

  onMount(async () => {
    await load();
  });

  function handleToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    if (currentPage !== 1) currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterStatus = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'cancelled', label: t('Cancelled') },
  ];

  $: toolbarFilters = [
    { key: 'status', label: t('Status'), value: filterStatus, icon: 'bi-activity', options: statusFilterOptions },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function statusTone(status) {
    if (status === 'confirmed') return 'positive';
    if (status === 'cancelled') return 'negative';
    return 'neutral';
  }

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }

  $: filteredProductions = (() => {
    let result = productions.filter((s) => {
      const productionDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      if (from && to && from.getTime() === to.getTime()) {
        return productionDate.toDateString() === from.toDateString();
      }
      if (from && productionDate < from) return false;
      if (to && productionDate > to) return false;
      return true;
    });

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.production_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.production_number && String(s.production_number).toLowerCase().includes(term)) ||
          (s.description && s.description.toLowerCase().includes(term)) ||
          (s.id && String(s.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      if (sortColumn == 'total_amount') {
        const valA = Number(a[sortColumn]) || 0;
        const valB = Number(b[sortColumn]) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedProductions = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredProductions.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredProductions.length / itemsPerPage);

  $: if (searchTerm || filterStatus) currentPage = 1;

  $: totalProductionsAmount = filteredProductions.reduce((totals, s) => {
    if (!s.production_status || s.production_status !== 'confirmed') return totals;
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});

  async function getProductionItems(id) {
    const full = (await productionApi.getById(id))?.data || null;
    return (full?.items || []).filter((item) => Number(item.status) === 1);
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }

  let totalBenefitAmount = {};
  let benefitRun = 0;

  async function calculateBenefit() {
    const runId = ++benefitRun;

    const updatedProductions = await Promise.all(
      filteredProductions.map(async (s) => {
        if (!s.production_status || s.production_status !== 'confirmed') {
          return { ...s, benefits: null };
        }

        const productionItems = await getProductionItems(s.id);

        let totalCost = 0;
        let benefits = {};
        benefits[s.currency] = 0;

        for (const item of productionItems) {
          let product = products.find((p) => p.id === item.product_id);
          if (!product) continue;

          let costPrice = Number(product.buy_price) || 0;

          if (product.buy_currency != s.currency) {
            costPrice = exchangeRate(costPrice, product.buy_currency, s.currency) || 0;
          }

          if (item.product_unit_id != product.product_unit_id) {
            const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
            costPrice = multiple * costPrice;
          }

          const profit = (Number(item.unit_price) - costPrice) * Number(item.quantity);

          benefits[s.currency] += profit;
          totalCost += costPrice * Number(item.quantity);
        }

        return {
          ...s,
          benefits,
        };
      }),
    );

    totalBenefitAmount = filteredProductions.reduce((totals, s) => {
      if (!s.production_status || s.production_status !== 'confirmed') return totals;
      if (!s.benefits) return totals;

      for (const [currency, amount] of Object.entries(s.benefits)) {
        if (!totals[currency]) totals[currency] = 0;
        totals[currency] += Number(amount) || 0;
      }

      return totals;
    }, {});

    if (runId !== benefitRun) return;

    productions = productions.map((s) => {
      const updated = updatedProductions.find((u) => u.id === s.id);
      return updated ? updated : s;
    });
  }

  $: if (filteredProductions.length && products.length) {
    calculateBenefit();
  }

</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Productions')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredProductions.length > 0}
  dense={true}
  contentClass="productions-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-plus-lg" label={t('New Production')} on:click={() => push(`/dashboard/production-form/0`)} />

    <ExportMenu
      extraClass="pdf-btn"
      loading={generatingPDF}
      disabled={generatingPDF || filteredProductions.length === 0}
      on:export={() => {
        generatePDF(
          'productions',
          filteredProductions,
          fromDate,
          toDate,
          filteredProductions.length,
          totalProductionsAmount,
          totalBenefitAmount,
        );
      }} />

  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search productions...')}
      filters={toolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => (searchTerm = event.detail)}
      on:filterChange={handleToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredProductions.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-inbox" message={t('No productions found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Productions')}
      minWidth="980px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="cursor-pointer" on:click={() => setSort('created_at')}>
            {t('Date')}
            {#if sortColumn === 'created_at'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('production_number')}>
            {t('Production #')}
            {#if sortColumn === 'production_number'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('product_id')}>
            {t('Product')}
            {#if sortColumn === 'product_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('quantity')}>
            {t('Quantity')}
            {#if sortColumn === 'quantity'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('total_amount')}>
            {t('Total Cost')}
            {#if sortColumn === 'total_amount'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('warehouse_id')}>
            {t('Warehouse')}
            {#if sortColumn === 'warehouse_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Status')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedProductions as s, index (s.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td>
            <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(s.created_at)}</StatusBadge>
          </td>
          <td>
            <button type="button" class="invoice-link" on:click={() => push(`/dashboard/productions/${s.id}`)}>
              {s.production_number}
            </button>
          </td>
          <td>
            {#if products.find((a) => a.id == s.product_id)}
              <button type="button" class="account-badge" on:click={() => push(`/dashboard/product/${s.product_id}`)}>
                {products.find((a) => a.id == s.product_id)?.name}
              </button>
            {:else}
              <span class="cell-muted">—</span>
            {/if}
          </td>
          <td>
            <span class="amount-pill">
              <span dir="ltr">{Number(s.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              {units.find((u) => u.id == s.product_unit_id)?.name || ''}
            </span>
          </td>
          <td>
            <span class="amount-pill">
              <span dir="ltr">{Number(s.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              {t(s.currency)}
            </span>
          </td>
          <td>
            {#if warehouses.find((w) => w.id == s.warehouse_id)}
              <button
                type="button"
                class="warehouse-link"
                title={t('Warehouse')}
                on:click={() => push(`/dashboard/warehouse/${s.warehouse_id}`)}>
                <i class="bi bi-building" aria-hidden="true"></i>
                <span>{warehouses.find((w) => w.id == s.warehouse_id)?.name}</span>
              </button>
            {:else}
              <span class="cell-muted">—</span>
            {/if}
          </td>
          <td>
            <button type="button" class="invoice-link" on:click={() => push(`/dashboard/productions/${s.id}`)}>
              <StatusBadge tone={statusTone(s.production_status)}>{t(s.production_status)}</StatusBadge>
            </button>
          </td>
          <td>
            <TableActions
              actions={[
                {
                  icon: 'bi-eye',
                  label: t('View'),
                  tone: 'view',
                  onClick: () => push(`/dashboard/productions/${s.id}`),
                },
                ...(showProductionEditAction && s.production_status === 'draft'
                  ? [
                      {
                        icon: 'bi-pencil',
                        label: t('Edit'),
                        tone: 'edit',
                        onClick: () => push(`/dashboard/production-form/` + s.id),
                      },
                    ]
                  : []),
              ]} />
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
      totalItems={filteredProductions.length}
      ariaLabel={t('Productions pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(e) => {
        itemsPerPage = Number(e.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<style>:global(.productions-index-content .data-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: var(--table-font-size, 0.78rem);
  }

:global(.productions-index-content .data-table thead th) {
    height: 3rem;
    padding: 0.625rem 0.875rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #ffffff;
    color: #66758a;
    font-size: var(--table-header-font-size, 0.78125rem);
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

:global(.productions-index-content .data-table tbody tr) {
    height: auto;
    background: #ffffff;
  }

:global(.productions-index-content .data-table tbody td) {
    height: auto;
    padding: 0.4rem 0.875rem;
    border: 0;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: var(--table-font-size, 0.75rem);
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

:global(.productions-index-content .data-table tbody tr:nth-child(even)) {
    background: #f5f7fa;
  }

:global(.productions-index-content .data-table tbody tr:nth-child(odd):hover) {
    background: #ffffff;
  }

:global(.productions-index-content .data-table tbody tr:nth-child(even):hover) {
    background: #f5f7fa;
  }

:global(.data-table tbody tr.row-overdue) {
    background: #fef2f2 !important;
  }

:global(.data-table tbody tr.row-due-soon) {
    background: #fffbeb !important;
  }

.cell-muted {
    color: #94a3b8;
    font-size: 0.78rem;
  }

.invoice-link {
    padding: 0;
    border: 0;
    color: #0f6efd;
    background: transparent;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 700;
    cursor: pointer;
  }

.account-badge {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: inherit;
    white-space: nowrap;
    cursor: pointer;
  }

.warehouse-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

.warehouse-link i {
    flex: 0 0 auto;
    font-size: 0.78rem;
    opacity: 0.75;
  }

.warehouse-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

.warehouse-link:hover span {
    text-decoration: underline;
    text-underline-offset: 0.15rem;
  }

.warehouse-link:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

:global(html.dark) .warehouse-link {
    color: #60a5fa;
  }

:global(html.dark) .warehouse-link:hover {
    color: #93c5fd;
  }

.amount-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 28px;
    padding: 0.28rem 0.62rem;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    color: #334155;
    background: #ffffff;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }

.productions-summary-grid {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }</style>
