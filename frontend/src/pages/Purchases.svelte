<script>
  import { warehouseApi } from '../api/warehouseApi.js';
  import { purchaseApi } from '../api/purchaseApi.js';
  import { onMount, tick, onDestroy } from 'svelte';
  import { showDate, setDatePickers } from '../calendar.js';
  import { push } from 'svelte-spa-router';
  import { generatePDF } from './generatePDF.js';
  import { generateExcel } from './generateExcel.js';
  import { t, lang, translate_org_type, shortID, settings_all } from '../i18n/i18n';
  import { auth } from '../auth/authStore';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import FilterSelect from '../components/common/FilterSelect.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import ExportMenu from '../components/common/ExportMenu.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
import { accountApi } from '../api/accountApi.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';

  $: bill_index_prefix = $settings_all.find((s) => s.key === 'bill_index_prefix')?.value || 'B-';
  $: enable_purchase_bill_due_date = $settings_all.find((s) => s.key === 'enable_purchase_bill_due_date')?.value == 1;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: permissions = $auth.permissions;

  export let account_id = null;

  let purchases = [];
  let loading = true;
  let exportingReport = false;
  let showSummaryCards = false;
  let accounts = [];
  let warehouses = [];
  let purchase_payments = [];
  let purchase_returns = [];
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let lookupsLoaded = false;

  let searchTerm = '';
  let filterStatus = 'all';
  let paymentStatus = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  let showSupplierDropdown = false;
  let filtersOpen = false;
  let searchInputEl;

  function formatValueObj(obj) {
    if (!obj || Object.keys(obj).length === 0) return '0';
    return Object.keys(obj)
      .map(
        (k) =>
          `${Number(obj[k]).toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(k)}`,
      )
      .join('<br />');
  }

  function openNewPurchase() {
    if (account_id) {
      push(`/dashboard/account-purchase-form/${account_id}`);
    } else {
      push(`/dashboard/purchase-form/0`);
    }
  }

  async function exportPurchases(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel' ? generateExcel : generatePDF;

      await exporter(
        'purchases',
        filteredPurchases,
        fromDate,
        toDate,
        filteredPurchases.length,
        totalPurchasesAmount,
        {},
      );
    } catch (error) {
      console.error('Failed to generate purchases report:', error);
    } finally {
      exportingReport = false;
    }
  }

  function getAccountName(acc) {
    if (!acc) return 'Unknown';
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    return out || 'Unknown';
  }

  function getStatusTone(status) {
    if (status === 'confirmed') return 'positive';
    if (status === 'return') return 'negative';
    return 'warning';
  }

  function purchaseMatchesTerm(purchase, term) {
    return (
      (purchase.bill_number && String(purchase.bill_number).toLowerCase().includes(term)) ||
      (purchase.description && purchase.description.toLowerCase().includes(term)) ||
      (purchase.id && String(purchase.id).includes(term))
    );
  }

  function getMatchingAccountIds(term) {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return accounts.filter((acc) => getAccountName(acc).toLowerCase().includes(q)).map((acc) => acc.id);
  }

  function handleUnifiedSearchInput() {
    if (!account_id) showSupplierDropdown = true;
  }

  function selectSupplier(acc) {
    account_id = acc.id;
    searchTerm = '';
    showSupplierDropdown = false;
  }

  function clearSupplierFilter() {
    account_id = null;
    searchTerm = '';
    showSupplierDropdown = false;
    searchInputEl?.focus();
  }

  let addPaymentModal = null;
  let addPaymentModalInstance = null;
  let selectedPurchase = null;

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  function openPaymentModal(purchase) {
    selectedPurchase = purchase;
    if (!addPaymentModalInstance && addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }
    addPaymentModalInstance?.show();
  }

  async function loadLookups() {
    if (lookupsLoaded) return;
    if (account_id) {
      const [accountsResponse, warehouseResponse] = await Promise.all([
        accountApi.getById(account_id),
        warehouseApi.getAll({ status: 1 }),
      ]);
      accounts = accountsResponse?.data ? [accountsResponse.data] : [];
      warehouses = warehouseResponse?.data || [];
      lookupsLoaded = true;
      return;
    }

    const [accountsResponse, warehouseResponse] = await Promise.all([
      accountApi.getAll({ status: 1, account_type_id: 3 }),
      warehouseApi.getAll({ status: 1 }),
    ]);
    accounts = accountsResponse?.data || [];
    warehouses = warehouseResponse?.data || [];
    lookupsLoaded = true;
  }

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;
    try {
      await Promise.all([
        loadLookups(),
        (async () => {
          const response = await purchaseApi.getAllWithRelations({
            status: 1,
            search: searchTerm.trim(),
            account_id: account_id || undefined,
            page: currentPage,
            limit: itemsPerPage,
            skip_count: 1,
            date_from: fromDate || undefined,
            date_to: toDate || undefined,
            sort_by: sortColumn,
            sort_dir: sortDirection,
          });
          if (requestId !== loadRequestId) return;
          purchases = response?.data || [];
          const meta = readListMeta(response, purchases.length);
          const hasMore = Boolean(response?.meta?.hasMore);
          totalItems = hasMore
            ? Math.max(meta.total, currentPage * itemsPerPage + 1)
            : Math.max(meta.total, (currentPage - 1) * itemsPerPage + purchases.length);
          totalPages = hasMore
            ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
            : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);
          purchase_payments = purchases.flatMap((p) => p.payments || []);
          purchase_returns = purchases.flatMap((p) => p.returns || []);
        })(),
      ]);
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else load();
    }, 300);
  }

  onMount(async () => {
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    const key = `${currentPage}|${itemsPerPage}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      load();
    }
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

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = ['created_at', 'bill_date', 'due_date', 'id', 'bill_number'].includes(column)
        ? 'desc'
        : 'asc';
    }
    if (currentPage !== 1) currentPage = 1;
    else load();
  }

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let fromDate = '';
  let toDate = '';

  function handleToolbarFilterChange(value) {
    filterStatus = value;
  }

  function showAllFilters() {
    fromDate = '';
    toDate = '';
    clearSupplierFilter();
    filterStatus = 'all';
    paymentStatus = 'all';
  }

  function toggleFilters() {
    filtersOpen = !filtersOpen;
    if (filtersOpen) {
      tick().then(() => setDatePickers(handleDateChange));
    }
  }

  $: totalPurchasesAmount = filteredPurchases.reduce((totals, p) => {
    if (!p.bill_status || p.bill_status !== 'confirmed') return totals;
    if (!totals[p.currency]) totals[p.currency] = 0;
    totals[p.currency] += Number(p.total_amount);
    return totals;
  }, {});

  // Sum payments for purchases currently in the filtered list (grouped by currency)
  $: totalPaymentsAmount = (() => {
    const totals = {};
    if (!purchase_payments || purchase_payments.length === 0) return totals;
    const purchaseIds = new Set(filteredPurchases.filter(p => p.bill_status === 'confirmed').map(p => p.id));
    for (const pp of purchase_payments) {
      if (!purchaseIds.has(pp.purchase_id)) continue;
      if (!totals[pp.currency]) totals[pp.currency] = 0;
      totals[pp.currency] += Number(pp.amount || 0);
    }
    return totals;
  })();

  // Sum returns for purchases currently in the filtered list (grouped by currency)
  $: totalReturnsAmount = (() => {
    const totals = {};
    if (!purchase_returns || purchase_returns.length === 0) return totals;
    const purchaseIds = new Set(filteredPurchases.filter(p => p.bill_status === 'confirmed').map(p => p.id));
    for (const r of purchase_returns) {
      if (!purchaseIds.has(r.purchase_id)) continue;
      if (!totals[r.currency]) totals[r.currency] = 0;
      totals[r.currency] += Number(r.total_amount || 0);
    }
    return totals;
  })();

  // Aggregate payments by purchase id
  $: paymentsByPurchase = (() => {
    const map = {};
    if (!purchase_payments || purchase_payments.length === 0) return map;
    for (const pp of purchase_payments) {
      if (!map[pp.purchase_id]) map[pp.purchase_id] = 0;
      map[pp.purchase_id] += Number(pp.amount || 0);
    }
    return map;
  })();

  // Aggregate returns by purchase id
  $: returnsByPurchase = (() => {
    const map = {};
    if (!purchase_returns || purchase_returns.length === 0) return map;
    for (const r of purchase_returns) {
      if (!map[r.purchase_id]) map[r.purchase_id] = 0;
      map[r.purchase_id] += Number(r.total_amount || 0);
    }
    return map;
  })();

  // Remaining amount per purchase (in purchase currency)
  $: purchaseRemainingMap = (() => {
    const map = {};
    for (const p of purchases || []) {
      if (p.remaining !== undefined && p.remaining !== null) {
        map[p.id] = Number(p.remaining) || 0;
        continue;
      }
      const paid = Number(paymentsByPurchase?.[p.id] || 0);
      const ret = Number(returnsByPurchase?.[p.id] || 0);
      map[p.id] = Number(p.total_amount || 0) - paid - ret;
    }
    return map;
  })();

  // Remaining balance per currency = purchases - payments - returns
  $: remainingBalance = (() => {
    const rem = {};
    const currencies = new Set([
      ...Object.keys(totalPurchasesAmount || {}),
      ...Object.keys(totalPaymentsAmount || {}),
      ...Object.keys(totalReturnsAmount || {}),
    ]);
    for (const cur of currencies) {
      const p = Number(totalPurchasesAmount?.[cur] || 0);
      const paid = Number(totalPaymentsAmount?.[cur] || 0);
      const ret = Number(totalReturnsAmount?.[cur] || 0);
      rem[cur] = p - paid - ret;
    }
    return rem;
  })();

  $: filteredPurchases = (() => {
    let result = purchases.filter((p) => {
      const invoiceDate = new Date(p.bill_date || p.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    });
    /*
     * Purchase status filter:
     *
     * confirmed / draft:
     *   Filter using purchases.bill_status.
     *
     * return:
     *   A return is stored in purchase_returns, not in bill_status.
     *   Show purchases that have at least one active return amount.
     */
    if (filterStatus === 'return') {
      result = result.filter(
        (p) => Number(returnsByPurchase?.[p.id] || 0) > 0,
      );
    } else if (filterStatus !== 'all') {
      result = result.filter(
        (p) => p.bill_status === filterStatus,
      );
    }

    /*
     * Payment status is calculated from the remaining amount:
     * paid   => remaining balance is zero or below
     * unpaid => remaining balance is greater than zero
     */
    if (paymentStatus !== 'all') {
      result = result.filter((p) => {
        const remaining = Number(
          purchaseRemainingMap?.[p.id] ??
            p.total_amount ??
            0,
        );

        if (paymentStatus === 'paid') {
          return remaining <= 0.000001;
        }

        if (paymentStatus === 'unpaid') {
          return remaining > 0.000001;
        }

        return true;
      });
    }

    // Search and sort are handled server-side so page 1 is the newest bills.
    return result;
  })();

  $: paginatedPurchases = filteredPurchases;
  $: purchasesCountLabel = `${totalItems} ${totalItems < 2 ? t('Purchase') : t('Purchases')}`;
  $: activeFilterCount =
    (account_id ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (paymentStatus !== 'all' ? 1 : 0) +
    (fromDate || toDate ? 1 : 0);
  $: supplierSuggestions =
    account_id || !searchTerm.trim()
      ? []
      : accounts
          .filter((acc) => getAccountName(acc).toLowerCase().includes(searchTerm.trim().toLowerCase()))
          .slice(0, 8);
  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'return', label: t('Return') },
  ];

  $: paymentStatusFilterOptions = [
    { value: 'all', label: t('All Payment Statuses') },
    { value: 'paid', label: t('Paid') },
    { value: 'unpaid', label: t('Unpaid') },
  ];

  $: purchaseToolbarFilters = [
    {
      key: 'account', label: t('Supplier'), value: account_id || 'all', icon: 'bi-person',
      options: [{ value: 'all', label: t('All') }, ...accounts.map((account) => ({ value: account.id, label: getAccountName(account) }))],
    },
    { key: 'status', label: t('Status'), value: filterStatus, icon: 'bi-activity', options: statusFilterOptions },
    {
      key: 'paymentStatus',
      label: t('Payment Status'),
      value: paymentStatus,
      icon: 'bi-credit-card',
      options: paymentStatusFilterOptions,
    },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handlePurchaseToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'account') account_id = value === 'all' ? null : Number(value);
    if (key === 'status') filterStatus = value;
    if (key === 'paymentStatus') paymentStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }
</script>

{#if !permissions?.some((p) => p.code === 'Purchases' && p.view)}
  <h3 class="permission-denied"><i class="bi bi-exclamation-triangle"></i>{t('No access allowed')}</h3>
{:else}
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Purchases')}
    toolbarWidth="25rem"
    showStats={showSummaryCards}
    showFooter={!loading && totalItems > 0}
    dense={true}
    contentClass="purchases-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
      {#if permissions?.some((p) => p.code === 'Purchases' && p.create)}
        <ActionButton icon="bi-plus-lg" label={t('New Purchase')} on:click={openNewPurchase} />
      {/if}
      <ExportMenu
        extraClass="pdf-btn"
        loading={exportingReport}
        disabled={exportingReport || filteredPurchases.length === 0}
        on:export={(event) => exportPurchases(event.detail)}
      />
      <button
        type="button"
        class="index-settings-button"
        class:is-active={showSummaryCards}
        aria-label={t('Summary')}
        aria-expanded={showSummaryCards}
        title={t('Summary')}
        on:click={() => (showSummaryCards = !showSummaryCards)}>
        <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-bag-plus '}" aria-hidden="true"></i>
        
      </button>
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid purchases-summary-grid">
        <SummaryCard label={t('Purchases Count')} icon="bi-box-seam" tone="green">
          {purchasesCountLabel}
        </SummaryCard>
        <SummaryCard label={t('Total Purchases Amount')} icon="bi-cash-stack" tone="cyan">
          {@html formatValueObj(totalPurchasesAmount)}
        </SummaryCard>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search purchases...')}
        filters={purchaseToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => { searchTerm = event.detail; scheduleSearchReload(); }}
        on:filterChange={handlePurchaseToolbarFilter}
        on:reset={showAllFilters} />
      {#if false}
      <div class="filters-wrap" class:filters-open={filtersOpen || showSupplierDropdown}>
        <div class="filter-toolbar">
          <div class="filter-toolbar-row">
            <div class="unified-search">
              <i class="bi bi-search" aria-hidden="true"></i>
              {#if account_id}
                <span class="supplier-chip">
                  <i class="bi bi-person-fill" aria-hidden="true"></i>
                  <span>{getAccountName(accounts.find((a) => a.id === Number(account_id)))}</span>
                  <button type="button" class="chip-clear" aria-label={t('Show All')} on:click={clearSupplierFilter}>
                    <i class="bi bi-x-lg"></i>
  </button>
            </span>
              {/if}
              <input
                type="search"
                class="unified-search-input"
                bind:this={searchInputEl}
                bind:value={searchTerm}
                placeholder={account_id ? t('Search purchases...') : `${t('Search purchases...')} · ${t('Select Supplier')}`}
                on:input={handleUnifiedSearchInput}
                on:focus={() => {
                  if (!account_id && searchTerm.trim()) showSupplierDropdown = true;
                }}
                on:blur={() => setTimeout(() => (showSupplierDropdown = false), 150)}
                autocomplete="off" />
              {#if showSupplierDropdown && supplierSuggestions.length > 0}
                <ul class="supplier-dropdown">
                  {#each supplierSuggestions as acc}
                    <li>
                      <button type="button" on:mousedown={() => selectSupplier(acc)}>
                        <i class="bi bi-person" aria-hidden="true"></i>
                        {getAccountName(acc)}
                      </button>
              </li>
            {/each}
          </ul>
        {/if}

              {#if searchTerm}
                <button
                  type="button"
                  class="purchase-search-clear"
                  aria-label={t('Clear Filters')}
                  title={t('Clear Filters')}
                  on:click={() => {
                    searchTerm = '';
                    showSupplierDropdown = false;
                    searchInputEl?.focus();
                  }}>
                  <i class="bi bi-x-lg" aria-hidden="true"></i>
                </button>
              {/if}

              <button
                type="button"
                class="purchase-filter-toggle {filtersOpen || activeFilterCount > 0 ? 'purchase-filter-toggle--active' : ''}"
                aria-label={t('Filter')}
                title={t('Filter')}
                aria-expanded={filtersOpen}
                aria-controls="purchase-filter-panel"
                on:click={toggleFilters}>
                <i class="bi bi-sliders2" aria-hidden="true"></i>
              </button>
            </div>

          </div>

          {#if filtersOpen}
            <div class="filter-panel" id="purchase-filter-panel">
            <FilterSelect
              label={t('Status')}
              icon="bi-activity"
              value={filterStatus}
              options={statusFilterOptions}
              on:change={(e) => handleToolbarFilterChange(e.detail)} />

            <div class="date-field">
              <span class="date-field__label">
                <i class="bi bi-calendar3"></i>
                {t('From Date')}
              </span>
              <div class="input-group input-group-sm persianDatePicker">
                <input type="date" class="form-control" data-bind="fromDate" bind:value={fromDate} aria-label={t('From Date')} />
                <span class="input-group-text persian-date-text"></span>
              </div>
            </div>

            <div class="date-field">
              <span class="date-field__label">
                <i class="bi bi-calendar3"></i>
                {t('To Date')}
              </span>
              <div class="input-group input-group-sm persianDatePicker">
                <input type="date" class="form-control" data-bind="toDate" bind:value={toDate} aria-label={t('To Date')} />
                <span class="input-group-text persian-date-text"></span>
              </div>
            </div>

            <div class="filter-panel__action">
              <ActionButton
                variant="secondary"
                icon="bi-arrow-counterclockwise"
                label={t('Show All')}
                compact={true}
                extraClass="show-all-btn"
                on:click={showAllFilters} />
            </div>
        </div>
          {/if}
        </div>
      </div>
      {/if}
    </svelte:fragment>

          {#if loading}
            <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
            </div>
          {:else if filteredPurchases.length === 0}
            <div class="index-table-state">
            <EmptyState icon="bi-inbox" message={t('No purchases found.')} />
            </div>
          {:else}
            <DataTable
              ariaLabel={t('Purchases')}
              minWidth="760px"
              dense={true}
              striped={false}
              hover={false}
              stickyHeader={true}
              layout="fixed"
              scrollbar="thin">
              <svelte:fragment slot="head">
                <tr>
                  <th class="col-start cursor-pointer" on:click={() => setSort('id')}>
                    {t('#')}
                    {#if sortColumn === 'id'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
                  <th class="cursor-pointer" on:click={() => setSort('created_at')}>
                    {t('Date')}
                    {#if sortColumn === 'created_at'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
              {#if enable_purchase_bill_due_date}
                    <th class="cursor-pointer" on:click={() => setSort('due_date')}>
                  {t('Due Date')}
                  {#if sortColumn === 'due_date'}
                        <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                      {/if}
                    </th>
                  {/if}
                  <th class="cursor-pointer" on:click={() => setSort('bill_number')}>
                    {t('Bill #')}
                    {#if sortColumn === 'bill_number'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
                  <th class="cursor-pointer {account_id ? 'd-none' : ''}" on:click={() => setSort('account_id')}>
                    {t('Account')}
                    {#if sortColumn === 'account_id'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
                  <th class="cursor-pointer" on:click={() => setSort('total_amount')}>
                    {t('Total')}
                    {#if sortColumn === 'total_amount'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                  {/if}
                </th>
                  <th>
                    {t('Remaining')}
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

              {#each paginatedPurchases as p, index (p.id)}
              <tr
                class={enable_purchase_bill_due_date && p.due_date
                  ? new Date(p.due_date) < new Date()
                      ? 'row-overdue'
                    : new Date(p.due_date) - new Date() < 3 * 24 * 60 * 60 * 1000
                        ? 'row-due-soon'
                      : ''
                  : ''}>
                <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>
                    <StatusBadge tone="neutral" ghost ltr={true} stacked>
                      {@html showDate(p.created_at)}
                    </StatusBadge>
                  </td>
                {#if enable_purchase_bill_due_date}
                    <td>
                      <StatusBadge tone="neutral" ghost ltr={true} stacked>
                        {@html p.due_date ? showDate(p.due_date) : '—'}
                      </StatusBadge>
                    </td>
                  {/if}
                  <td>
                    <button type="button" class="bill-link" on:click={() => push(`/dashboard/purchases/${p.id}`)}>
                      {bill_index_prefix}{p.bill_number}
                    </button>
                  </td>
                  <td class={account_id ? 'd-none' : ''}>
                    <button type="button" class="account-badge" on:click={() => push(`/dashboard/account/${p.account_id}`)}>
                      {getAccountName(accounts.find((a) => a.id == p.account_id))}
                    </button>
                  </td>
                  <td>
                    <span class="amount-pill">
                      <span dir="ltr">{Number(p.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      {t(p.currency)}
                    </span>
                  </td>
                  <td>
                    <div class="remaining-cell">
                      <button
                        type="button"
                        class="payment-add-btn"
                        title={t('Add Payment')}
                        aria-label={t('Add Payment')}
                        on:click={() => openPaymentModal(p)}>
                        {#if purchaseRemainingMap && purchaseRemainingMap[p.id] !== undefined}
                          <span dir="ltr">
                            {Number(purchaseRemainingMap[p.id] || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 3,
                            })}
                          </span>
                          {t(p.currency)}
                        {:else}
                          <span class="cell-muted">—</span>
                        {/if}
                      </button>
                    </div>
                  </td>
                  <td>
                    {#if warehouses.find((w) => w.id == p.warehouse_id)}
                      <button
                        type="button"
                        class="warehouse-link"
                        title={t('Warehouse')}
                        on:click={() => push(`/dashboard/warehouse/${p.warehouse_id}`)}>
                        <i class="bi bi-building" aria-hidden="true"></i>
                        <span>{warehouses.find((w) => w.id == p.warehouse_id)?.name}</span>
                      </button>
                    {:else}
                      <span class="cell-muted">—</span>
                    {/if}
                  </td>
                 
                <td>
                    <button type="button" class="bill-link" on:click={() => push(`/dashboard/purchases/${p.id}`)}>
                       <StatusBadge tone={getStatusTone(p.bill_status)}>{t(p.bill_status)}</StatusBadge>
                    </button>
                  </td>
                  <td>
                    <TableActions
                      actions={[
                        {
                          icon: 'bi-eye',
                          label: t('View'),
                          tone: 'view',
                          onClick: () => push(`/dashboard/purchases/${p.id}`),
                        },
                        {
                          icon: 'bi-pencil',
                          label: t('Edit'),
                          tone: 'edit',
                          onClick: () => push(`/dashboard/purchase-form/` + p.id),
                        },
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
        {totalItems}
        ariaLabel={t('Purchases pagination')}
        rowLabel={t('rows')}
        on:perPageChange={(e) => {
          itemsPerPage = Number(e.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
{/if}
<style>
  :global(.purchases-index-content .data-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: var(--table-font-size, 0.78rem);
  }

  :global(.purchases-index-content .data-table thead th) {
    height: 3rem;
    padding: 0.625rem 0.875rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: var(--erp-surface, #ffffff);
    color: #66758a;
    font-size: var(--table-header-font-size, 0.78125rem);
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  :global(.purchases-index-content .data-table tbody tr) {
    height: auto;
    background: var(--data-table-row-bg, var(--erp-surface, #ffffff));
  }

  :global(.purchases-index-content .data-table tbody td) {
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

  :global(.purchases-index-content .data-table tbody tr),
  :global(.purchases-index-content .data-table tbody tr:hover),
  :global(.purchases-index-content .data-table tbody td) {
    background: var(--data-table-row-bg, var(--erp-surface, #ffffff));
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .permission-denied {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem;
    color: #dc2626;
    font-size: 1rem;
  }

  .purchases-page {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 0;
    background: transparent;
    color: #0f172a;
    overflow: hidden;
  }

  .page-shell {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap, 0.85rem);
    width: 100%;
    max-width: none;
    margin: 0;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .purchases-page :global(.page-header) {
    padding: var(--card-padding, 0.85rem) clamp(0.85rem, 1.1vw, 1.1rem);
    border: 1px solid #e2e8f0;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
  }

  .purchases-page :global(.header-icon) {
    width: clamp(2.1rem, 2.5vw, 2.5rem);
    height: clamp(2.1rem, 2.5vw, 2.5rem);
    border-radius: 12px;
    background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
    color: #0f6efd;
    font-size: 1rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .purchases-page :global(.page-header h1) {
    font-size: var(--app-heading-sm, 1.1rem);
    font-weight: 850;
    letter-spacing: -0.02em;
  }

  .purchases-page :global(.page-header p) {
    margin-top: 0.2rem;
    color: #64748b;
    font-size: var(--app-font-sm, 0.84rem);
  }

  .purchases-page :global(.header-actions .action-btn.primary) {
    min-height: var(--control-height, 2.35rem);
    padding: 0.45rem 0.95rem;
    border-radius: var(--control-radius, 0.625rem);
    background: linear-gradient(180deg, #3b82f6 0%, #0f6efd 100%);
    border-color: #0f6efd;
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.24);
    font-size: var(--control-font, 0.84rem);
    font-weight: 800;
  }

  .purchases-page :global(.header-actions .action-btn.primary:hover:not(:disabled)) {
    background: linear-gradient(180deg, #0f6efd 0%, #1d4ed8 100%);
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
  }

  .purchases-page :global(.header-actions .action-btn.pdf-btn) {
    min-height: var(--control-height, 2.35rem);
    padding: 0.45rem 0.85rem;
    border-radius: var(--control-radius, 0.625rem);
    border-color: #e2e8f0;
    color: #64748b;
    background: #ffffff;
    box-shadow: none;
    font-weight: 600;
  }

  .purchases-page :global(.header-actions .action-btn.pdf-btn:hover:not(:disabled)) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    transform: none;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
    gap: var(--section-gap, 0.85rem);
  }

  .purchases-summary-grid {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .purchases-page :global(.summary-card) {
    align-items: flex-start;
    min-height: clamp(4rem, 6vw, 5.25rem);
    padding: var(--card-padding, 0.85rem);
    border: 1px solid #e2e8f0;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .purchases-page :global(.summary-card:hover) {
    transform: translateY(-2px);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
  }

  .purchases-page :global(.summary-icon) {
    width: clamp(1.85rem, 2.3vw, 2.25rem);
    height: clamp(1.85rem, 2.3vw, 2.25rem);
    flex-basis: auto;
    border-radius: 12px;
    font-size: 1rem;
  }

  .purchases-page :global(.summary-label) {
    margin-bottom: 0.25rem;
    color: #64748b;
    font-size: var(--app-font-xs, 0.76rem);
    font-weight: 700;
    line-height: 1.35;
  }

  .purchases-page :global(.summary-value) {
    color: #0f172a;
    font-size: var(--app-heading-sm, 1.1rem);
    font-weight: 850;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .filters-wrap {
    overflow: visible;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  }

  .filter-toolbar {
    padding: 0.9rem 1rem;
  }

  .filter-toolbar-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .filter-toggle {
    min-height: var(--control-height);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid #dbe7f3;
    border-radius: 12px;
    background: #ffffff;
    color: #334155;
    font-size: 0.82rem;
    font-weight: 800;
    line-height: 1;
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }

  .filter-toggle:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    background: #f8fbff;
    color: #0f6efd;
  }

  .filter-toggle--active {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #0f6efd;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
  }

  .filter-toggle em {
    min-width: 18px;
    height: 18px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: #0f6efd;
    color: #ffffff;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 900;
  }

  .filter-toggle__chevron {
    font-size: 0.72rem;
    transition: transform 0.16s ease;
  }

  .filter-toggle__chevron--open {
    transform: rotate(180deg);
  }

  .toolbar-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .toolbar-actions :global(.action-btn) {
    min-height: var(--control-height);
  }

  .toolbar-actions :global(.pdf-btn) {
    border-color: #e2e8f0;
    background: #ffffff;
    color: #64748b;
    box-shadow: none;
  }

  .toolbar-actions :global(.pdf-btn:hover:not(:disabled)) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    transform: none;
  }

  .filter-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr));
    gap: 0.75rem;
    margin-top: 0.85rem;
    padding-top: 0.85rem;
    border-top: 1px solid #eef2f7;
    align-items: end;
  }

  .filter-panel :global(.filter-select),
  .filter-panel .date-field,
  .filter-panel__action {
    width: 100%;
    min-width: 0;
  }

  .filter-panel :global(.filter-select) {
    width: 100%;
    max-width: none;
  }

  .filter-panel__action {
    display: flex;
    align-items: end;
  }

  .filter-panel__action :global(.action-btn) {
    width: 100%;
  }

  .unified-search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 260px;
    min-width: 220px;
    min-height: var(--control-height);
    padding-inline: 0.85rem;
    gap: 0.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
  }

  .unified-search:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .unified-search > i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .unified-search-input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #334155;
    font-size: 0.84rem;
    font-weight: 600;
  }

  .unified-search-input:focus {
    outline: none;
  }

  .supplier-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
    max-width: 180px;
    height: 28px;
    padding-inline: 0.55rem;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .supplier-chip > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    color: #0f6efd;
    background: transparent;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .chip-clear:hover {
    background: rgba(37, 99, 235, 0.12);
  }

  .supplier-dropdown {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 4px);
    z-index: 20;
    max-height: 220px;
    margin: 0;
    padding: 4px;
    overflow: auto;
    list-style: none;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  }

  .supplier-dropdown button {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-radius: 8px;
    color: #334155;
    background: transparent;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .supplier-dropdown button i {
    color: #64748b;
    font-size: 0.82rem;
  }

  .supplier-dropdown button:hover {
    background: #eff6ff;
    color: #0f6efd;
  }

  .date-field {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .date-field__label {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    color: #64748b;
    font-size: var(--app-font-xs, 0.68rem);
    font-weight: 800;
    white-space: nowrap;
  }

  .date-field :global(.date-picker-control) {
    width: 100%;
  }

  .purchases-page :global(.show-all-btn) {
    min-height: var(--control-height-sm, 2.125rem);
    padding-inline: 0.85rem;
    border-radius: 8px;
    border-color: #dbe7f3;
    background: #ffffff;
    color: #64748b;
    box-shadow: none;
    white-space: nowrap;
  }

  .purchases-page :global(.show-all-btn:hover:not(:disabled)) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
    transform: none;
  }

  .purchases-table-card {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 6px 22px rgba(15, 23, 42, 0.05);
  }

  .table-card-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: 0.15rem 0.25rem 0;
  }

  .purchases-page :global(.data-table-wrap) {
    padding: 0 0.35rem;
  }

  .purchases-page :global(.data-table thead th) {
    padding: var(--table-cell-padding-y, 0.8125rem) var(--table-cell-padding-x, 0.875rem);
    border-bottom: 1px solid #dfe5ed;
    background: #fbfcfe;
    color: #64748b;
    font-size: var(--table-header-font-size, 0.72rem);
    font-weight: 900;
    letter-spacing: 0;
  }

  .purchases-page :global(.data-table tbody td) {
    padding: var(--table-cell-padding-y, 0.8125rem) var(--table-cell-padding-x, 0.875rem);
    border-bottom: 1px solid #edf1f6;
    font-size: var(--table-font-size, 0.78rem);
    color: #46536a;
    vertical-align: middle;
  }

  .purchases-page :global(.data-table tbody tr:nth-child(even)) {
    background: #fbfdff;
  }

  .purchases-page :global(.data-table tbody tr:hover) {
    background: #f0f7ff !important;
  }

  .purchases-page :global(.data-table tbody tr.row-overdue) {
    background: #fef2f2 !important;
  }

  .purchases-page :global(.data-table tbody tr.row-due-soon) {
    background: #fffbeb !important;
  }

  .cell-muted {
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .bill-link {
    padding: 0;
    border: 0;
    color: #0f6efd;
    font-weight: 700;
    background: transparent;
    font-size: var(--table-font-size, 0.78rem);
    text-decoration: underline;
  }

  .account-badge {
    display: inline-flex;
    align-items: center;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: #1d4ed8;
    background: transparent;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }

  .account-badge:hover {
    background: transparent;
    color: #1e40af;
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

  .remaining-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .payment-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: 28px;
    padding: 0.28rem 0.62rem;
    border: 1px solid #dbeafe;
    border-radius: 999px;
    color: #1d4ed8;
    background: #f8fbff;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.16s ease;
  }

  .payment-add-btn:hover {
    border-color: #93c5fd;
    color: #0f6efd;
    background: #eff6ff;
    transform: translateY(-1px);
  }

  .purchases-page :global(.erp-badge.positive),
  .purchases-page :global(.erp-badge.warning),
  .purchases-page :global(.erp-badge.negative) {
    min-height: 26px;
    padding: 0.28rem 0.62rem;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .purchases-page :global(.table-actions .action-btn.tone-view),
  .purchases-page :global(.table-actions .action-btn.tone-edit) {
    color: #0f6efd;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .purchases-page :global(.table-actions .action-btn) {
    width: 36px;
    min-height: 36px;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
  }

  .purchases-page :global(.pagination-shell) {
    padding: 0.65rem 0.85rem;
    border-top: 1px solid #eef2f7;
    background: #ffffff;
  }

  /* Shared index-toolbar adaptation for the purchase-specific filters. */
  .filters-wrap {
    position: relative;
    z-index: 50;
    width: 100%;
    min-width: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .filters-wrap.filters-open {
    z-index: 100;
  }

  .filter-toolbar {
    width: 100%;
    padding: 0;
  }

  .filter-toolbar-row {
    width: 100%;
    min-width: 0;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .unified-search {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: var(--index-toolbar-control-height, 2.625rem);
    min-height: var(--index-toolbar-control-height, 2.625rem);
    padding-inline: 0.75rem 0.375rem;
    border-color: #d6e0ed;
    border-radius: 0.625rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.025);
  }

  .unified-search:hover {
    border-color: #bfd0e4;
  }

  .unified-search:focus-within,
  .filters-open .unified-search {
    border-color: #79a8f8;
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.08),
      0 4px 12px rgba(15, 23, 42, 0.04);
  }

  .unified-search-input {
    height: 2.5rem;
    min-height: 2.5rem;
    color: #26364b;
    font-size: 0.875rem;
    font-weight: 550;
  }

  .purchase-search-clear,
  .purchase-filter-toggle {
    display: inline-grid;
    place-items: center;
    flex: 0 0 1.75rem;
    width: 1.75rem;
    min-width: 1.75rem;
    height: 1.75rem;
    min-height: 1.75rem;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0.4375rem;
    cursor: pointer;
  }

  .purchase-search-clear {
    background: transparent;
    color: #94a3b8;
    font-size: 0.6875rem;
  }

  .purchase-search-clear:hover {
    background: #f1f5f9;
    color: #475569;
  }

  .purchase-filter-toggle {
    background: #0f6efd;
    color: #ffffff;
    font-size: 0.85rem;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
  }

  .purchase-filter-toggle:hover {
    background: #0f6efd;
    color: #ffffff;
  }

  .purchase-filter-toggle--active {
    background: #0f6efd;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
  }

  .purchase-filter-toggle i {
    color: inherit !important;
  }

  .purchase-filter-toggle:not(.purchase-filter-toggle--active) i {
    color: #ffffff !important;
  }

  .purchase-filter-toggle--active i {
    color: #ffffff !important;
  }

  .filter-panel {
    position: absolute;
    top: calc(100% + 0.75rem);
    right: 0;
    z-index: 1000;
    width: min(44rem, calc(100vw - 3rem));
    margin: 0;
    padding: 1rem;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 1rem;
    background: #ffffff;
    box-shadow:
      0 24px 60px rgba(15, 23, 42, 0.17),
      0 8px 20px rgba(15, 23, 42, 0.07);
  }

  @media (max-width: 767.98px) {
    .purchases-summary-grid {
      grid-template-columns: 1fr !important;
    }

    .filter-toolbar-row {
      flex-direction: column;
      align-items: stretch;
    }

    .unified-search,
    .filter-panel :global(.filter-select),
    .date-field,
    .filter-panel :global(.show-all-btn) {
      width: 100%;
      min-width: 0;
      flex: 1 1 auto;
    }

    .filter-panel {
      right: auto;
      left: 0;
      grid-template-columns: 1fr;
      width: 100%;
      max-height: min(70vh, 32rem);
      overflow-y: auto;
    }
  }

  :global(html.dark .purchases-index-content .data-table) {
    --data-table-row-bg: var(--erp-surface, #111827);
    --data-table-alt-row-bg: var(--erp-surface-soft, #172033);
    color: var(--erp-text);
  }

  :global(html.dark .purchases-index-content .data-table tbody) {
    background: var(--data-table-row-bg) !important;
  }

  :global(html.dark .purchases-index-content .data-table thead th) {
    border-bottom-color: var(--erp-border);
    background: var(--erp-surface-soft) !important;
    color: var(--erp-text-soft);
  }

  :global(html.dark .purchases-index-content .data-table tbody tr),
  :global(html.dark .purchases-index-content .data-table tbody tr:hover),
  :global(html.dark .purchases-index-content .data-table tbody td) {
    background: var(--data-table-row-bg) !important;
    color: var(--erp-text);
  }

  :global(html.dark .purchases-index-content .data-table tbody td) {
    border-bottom-color: var(--erp-border);
  }

  :global(html.dark .purchases-page .page-header),
  :global(html.dark .purchases-page .summary-card) {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    color: var(--erp-text);
    box-shadow: var(--erp-shadow-sm);
  }

  :global(html.dark) .filters-wrap,
  :global(html.dark) .purchases-table-card {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    color: var(--erp-text);
    box-shadow: var(--erp-shadow-sm);
  }

  :global(html.dark .purchases-page .page-header p),
  :global(html.dark .purchases-page .summary-label) {
    color: var(--erp-muted);
  }

  :global(html.dark) .cell-muted,
  :global(html.dark) .date-field__label {
    color: var(--erp-muted);
  }

  :global(html.dark .purchases-page .summary-value),
  :global(html.dark) .purchases-page {
    color: var(--erp-text);
  }

  :global(html.dark .purchases-page .header-icon) {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    box-shadow: none;
  }

  :global(html.dark .purchases-page .header-actions .action-btn.pdf-btn),
  :global(html.dark) .toolbar-actions :global(.pdf-btn),
  :global(html.dark) .filter-toggle,
  :global(html.dark .purchases-page .show-all-btn) {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text-soft);
  }

  :global(html.dark .purchases-page .header-actions .action-btn.pdf-btn:hover:not(:disabled)),
  :global(html.dark) .toolbar-actions :global(.pdf-btn:hover:not(:disabled)),
  :global(html.dark) .filter-toggle:hover,
  :global(html.dark .purchases-page .show-all-btn:hover:not(:disabled)) {
    border-color: rgba(96, 165, 250, 0.45);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .filter-toggle--active {
    border-color: rgba(96, 165, 250, 0.38);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .supplier-chip {
    border-color: rgba(96, 165, 250, 0.38);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .unified-search {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text);
    box-shadow: none;
  }

  :global(html.dark) .unified-search:hover,
  :global(html.dark) .unified-search:focus-within,
  :global(html.dark) .filters-open .unified-search {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.14);
  }

  :global(html.dark) .unified-search > i,
  :global(html.dark) .purchase-search-clear {
    color: var(--erp-muted);
  }

  :global(html.dark) .unified-search-input {
    color: var(--erp-text);
  }

  :global(html.dark) .purchase-search-clear:hover,
  :global(html.dark) .chip-clear:hover {
    background: rgba(148, 163, 184, 0.12);
    color: var(--erp-text);
  }

  :global(html.dark) .supplier-dropdown,
  :global(html.dark) .filter-panel {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.36);
  }

  :global(html.dark) .supplier-dropdown button {
    color: var(--erp-text);
  }

  :global(html.dark) .supplier-dropdown button i {
    color: var(--erp-muted);
  }

  :global(html.dark) .supplier-dropdown button:hover {
    background: rgba(96, 165, 250, 0.12);
    color: #93c5fd;
  }

  :global(html.dark) .bill-link,
  :global(html.dark) .account-badge,
  :global(html.dark) .warehouse-link {
    color: #60a5fa;
  }

  :global(html.dark) .bill-link:hover,
  :global(html.dark) .account-badge:hover,
  :global(html.dark) .warehouse-link:hover {
    color: #93c5fd;
  }

  :global(html.dark) .amount-pill {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text);
  }

  :global(html.dark) .payment-add-btn {
    border-color: rgba(96, 165, 250, 0.38);
    background: rgba(96, 165, 250, 0.12);
    color: #93c5fd;
  }

  :global(html.dark) .payment-add-btn:hover {
    border-color: rgba(147, 197, 253, 0.65);
    background: rgba(96, 165, 250, 0.2);
  }

  :global(html.dark) .purchases-page :global(.table-actions .action-btn) {
    box-shadow: none;
  }

  :global(html.dark) .purchases-page :global(.table-actions .action-btn.tone-view),
  :global(html.dark) .purchases-page :global(.table-actions .action-btn.tone-edit) {
    border-color: rgba(96, 165, 250, 0.38);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .purchases-page :global(.pagination-shell) {
    border-top-color: var(--erp-border);
    background: var(--erp-surface);
  }
</style>
