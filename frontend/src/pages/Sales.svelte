<script>
  import { onMount, tick, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { generatePDF } from './generatePDF.js';
  import { generateExcel } from './generateExcel.js';
  import PaymentSection from './sales/PaymentSection.svelte';
  import { showDate, setDatePickers } from '../calendar.js';
  import { auth } from '../auth/authStore';
  import { t, lang, translate_org_type, shortID, settings_all } from '../i18n/i18n.js';
  import { calculateRemainingAndBenefitOfAllSales } from './sales/SalesHelper.js';
  import SaleA4ReceiptModal from './sales/SaleA4ReceiptModal.svelte';
  import SaleReceiptModal from './sales/SaleReceiptModal.svelte';
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
import { currencyApi } from '../api/currencyApi.js';
import { warehouseApi } from '../api/warehouseApi.js';
import { accountApi } from '../api/accountApi.js';
import { saleApi } from '../api/saleApi.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';

  $: permissions = $auth.permissions;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;
  $: enable_a4_default_print_mode =
    $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;
  $: showBenefit = permissions?.some((p) => p.code === 'Benefit' && p.view);

  export let embedded = false;

  let sales = [];
  let currencies = [];
  let accounts = [];
  let warehouses = [];
  let loading = true;
  let exportingReport = false;
  let showSummaryCards = false;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let lookupsLoaded = false;

  let shiftPressed = false;
  let ctrlPressed = false;

  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }

  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  let showA4Receipt = false;
  let showReceipt = false;
  let selectedA4Sale = null;

  export let account_id = null;
  
  let searchTerm = '';
  let filterStatus = 'all';
  let filterPaymentStatus = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  let showCustomerDropdown = false;
  let filtersOpen = false;
  let searchInputEl;

  let addPaymentModal;
  let addPaymentModalInstance;
  let selectedSale = null;
  let calculatingAll = false;

  function getAccountName(acc) {
    if (!acc) return 'Unknown';
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    return out || 'Unknown';
  }

  function formatValueObj(obj) {
    if (!obj || Object.keys(obj).length === 0) return '0';
    return Object.keys(obj)
      .map(
        (k) =>
          `${Number(obj[k]).toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(k)}`,
      )
      .join('<br />');
  }

  function getStatusTone(status) {
    if (status === 'confirmed') return 'positive';
    if (status === 'cancelled') return 'negative';
    return 'warning';
  }

  function saleMatchesTerm(sale, term) {
    return (
      (sale.invoice_number && String(sale.invoice_number).toLowerCase().includes(term)) ||
      (sale.description && sale.description.toLowerCase().includes(term)) ||
      (sale.id && String(sale.id).includes(term))
    );
  }

  function getMatchingAccountIds(term) {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return accounts.filter((acc) => getAccountName(acc).toLowerCase().includes(q)).map((acc) => acc.id);
  }

  function handleUnifiedSearchInput() {
    if (!account_id) showCustomerDropdown = true;
  }

  function selectCustomer(acc) {
    account_id = acc.id;
    searchTerm = '';
    showCustomerDropdown = false;
  }

  function clearCustomerFilter() {
    account_id = null;
    searchTerm = '';
    showCustomerDropdown = false;
    searchInputEl?.focus();
  }

  function openNewSale() {
    if (account_id) {
      push(`/dashboard/account-sale-form/${account_id}`);
    } else {
      push(`/dashboard/sale-form/0`);
    }
  }

  async function exportSales(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel' ? generateExcel : generatePDF;

      await exporter(
        'sales',
        filteredSales,
        fromDate,
        toDate,
        filteredSales.length,
        totalSalesAmount,
        totalBenefitAmount,
      );
    } catch (error) {
      console.error('Failed to generate sales report:', error);
    } finally {
      exportingReport = false;
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  async function loadLookups() {
    if (lookupsLoaded) return;
    if (account_id) {
      const [currencyResponse, accountResponse, warehouseResponse] =
        await Promise.all([
          currencyApi.getAll({ status: 1 }),
          accountApi.getById(account_id),
          warehouseApi.getAll({ status: 1 }),
        ]);
      currencies = currencyResponse?.data || [];
      accounts = accountResponse?.data ? [accountResponse.data] : [];
      warehouses = warehouseResponse?.data || [];
      lookupsLoaded = true;
      return;
    }

    const [currencyResponse, accountsResponse, warehouseResponse] =
      await Promise.all([
        currencyApi.getAll({ status: 1 }),
        accountApi.getAll({ status: 1, account_type_id: 4 }),
        warehouseApi.getAll({ status: 1 }),
      ]);
    currencies = currencyResponse?.data || [];
    accounts = (accountsResponse?.data || []).filter(
      (a) => a.status === 1,
    );
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
          const salesResponse = await saleApi.getAll({
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
          sales = salesResponse?.data || [];
          const meta = readListMeta(salesResponse, sales.length);
          const hasMore = Boolean(salesResponse?.meta?.hasMore);
          totalItems = hasMore
            ? Math.max(meta.total, currentPage * itemsPerPage + 1)
            : Math.max(meta.total, (currentPage - 1) * itemsPerPage + sales.length);
          totalPages = hasMore
            ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
            : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);
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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await load();
    tick().then(() => setDatePickers(handleDateChange));
    if (addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }
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
      sortDirection = ['created_at', 'invoice_date', 'due_date', 'id', 'invoice_number'].includes(column)
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

  function showAllFilters() {
    fromDate = '';
    toDate = '';
    clearCustomerFilter();
    filterStatus = 'all';
    filterPaymentStatus = 'all';
  }

  function toggleFilters() {
    filtersOpen = !filtersOpen;
    if (filtersOpen) {
      tick().then(() => setDatePickers(handleDateChange));
    }
  }

  function openPaymentModal(sale) {
    selectedSale = sale;
    if (!addPaymentModalInstance && addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }
    addPaymentModalInstance?.show();
  }

  async function closePaymentModal() {
    addPaymentModalInstance?.hide();
    await tick();
    await load();
    selectedSale = null;
  }
  
  $: filteredSales = (() => {
    let result = sales.filter((s) => {
      const invoiceDate = new Date(s.invoice_date || s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    });

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.invoice_status === filterStatus);
    }

    if (filterPaymentStatus !== 'all') {
      result = result.filter((s) => {
        const remaining = s.remaining;
        if (remaining === undefined) return false;
        if (filterPaymentStatus === 'paid') return remaining <= 0;
        if (filterPaymentStatus === 'unpaid') return remaining > 0;
        return true;
      });
    }

    // Search and sort are handled server-side so page 1 is the newest bills.
    return result;
  })();

  // Server already paginated
  $: paginatedSales = filteredSales;

  $: totalBenefitAmount = filteredSales.reduce((totals, s) => {
    if (!s.invoice_status || s.invoice_status !== 'confirmed') return totals;
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.benefit || 0);
    return totals;
  }, {});
  
  $: totalSalesAmount = filteredSales.reduce((totals, s) => {
    if (!s.invoice_status || s.invoice_status !== 'confirmed') return totals;
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});

  $: if (filterStatus !== 'all' || filterPaymentStatus !== 'all' || account_id) {
    // local filters on current page — no forced page reset storm
  }

  $: salesCountLabel = `${totalItems} ${totalItems < 2 ? t('Sale') : t('Sales')}`;
  $: activeFilterCount =
    (account_id ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (filterPaymentStatus !== 'all' ? 1 : 0) +
    (fromDate || toDate ? 1 : 0);
  $: customerSuggestions =
    account_id || !searchTerm.trim()
      ? []
      : accounts
          .filter((acc) => getAccountName(acc).toLowerCase().includes(searchTerm.trim().toLowerCase()))
          .slice(0, 8);

  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'cancelled', label: t('Cancelled') },
  ];

  $: paymentStatusFilterOptions = [
    { value: 'all', label: t('All Payment Statuses') },
    { value: 'paid', label: t('Paid') },
    { value: 'unpaid', label: t('Unpaid') },
  ];

  $: salesToolbarFilters = [
    {
      key: 'account', label: t('Customer'), value: account_id || 'all', icon: 'bi-person',
      options: [{ value: 'all', label: t('All') }, ...accounts.map((account) => ({ value: account.id, label: getAccountName(account) }))],
    },
    { key: 'status', label: t('Status'), value: filterStatus, icon: 'bi-activity', options: statusFilterOptions },
    { key: 'payment', label: t('Payment'), value: filterPaymentStatus, icon: 'bi-wallet2', options: paymentStatusFilterOptions },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleSalesToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'account') account_id = value === 'all' ? null : Number(value);
    if (key === 'status') filterStatus = value;
    if (key === 'payment') filterPaymentStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }
</script>

{#if !permissions?.some((p) => p.code === 'Sales' && p.view)}
  <h3 class="permission-denied"><i class="bi bi-exclamation-triangle"></i>{t('No access allowed')}</h3>
{:else}
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Sales')}
    toolbarWidth="25rem"
    showStats={showSummaryCards}
    showExtra={(shiftPressed && ctrlPressed) || calculatingAll}
    showFooter={!loading && totalItems > 0}
    dense={true}
    contained={!embedded}
    contentClass="sales-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
      {#if permissions?.some((p) => p.code === 'Sales' && p.create)}
        <ActionButton icon="bi-plus-lg" label={t('New Sale')} on:click={openNewSale} />
      {/if}

      <ActionButton
        variant="secondary"
        icon="bi-file-earmark"
        label={t('Empty Bill')}
        extraClass="empty-bill-btn"
        on:click={() => {
          selectedA4Sale = null;
          if (enable_a4_default_print_mode) {
            showA4Receipt = true;
          } else {
            showReceipt = true;
          }
        }} />

      <ExportMenu
        extraClass="pdf-btn"
        loading={exportingReport}
        disabled={exportingReport || filteredSales.length === 0}
        on:export={(event) => exportSales(event.detail)}
      />
      <button
        type="button"
        class="index-settings-button"
        class:is-active={showSummaryCards}
        aria-label={t('Summary')}
        aria-expanded={showSummaryCards}
        title={t('Summary')}
        on:click={() => (showSummaryCards = !showSummaryCards)}>
        <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-cart-check'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid sales-summary-grid">
        <SummaryCard label={t('Sales Count')} icon="bi-cart-check" tone="green">
          {salesCountLabel}
        </SummaryCard>
        <SummaryCard label={t('Total Sales Amount')} icon="bi-cash-stack" tone="cyan">
          {@html formatValueObj(totalSalesAmount)}
        </SummaryCard>
      </div>
    </svelte:fragment>

    

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search sales...')}
        filters={salesToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => { searchTerm = event.detail; scheduleSearchReload(); }}
        on:filterChange={handleSalesToolbarFilter}
        on:reset={showAllFilters} />
      {#if false}
      <div class="filters-wrap" class:filters-open={showCustomerDropdown || filtersOpen}>
        <div class="filter-toolbar">
          <div class="filter-toolbar-row">
            <div class="unified-search">
              <i class="bi bi-search" aria-hidden="true"></i>
              {#if account_id}
                <span class="customer-chip">
                  <i class="bi bi-person-fill" aria-hidden="true"></i>
                  <span>{getAccountName(accounts.find((a) => a.id === Number(account_id)))}</span>
                  <button type="button" class="chip-clear" aria-label={t('Show All')} on:click={clearCustomerFilter}>
                    <i class="bi bi-x-lg"></i>
            </button>
                </span>
              {/if}
              <input
                type="search"
                class="unified-search-input"
                bind:this={searchInputEl}
                bind:value={searchTerm}
                placeholder={account_id ? t('Search sales...') : `${t('Search sales...')} · ${t('Select Customer')}`}
                on:input={handleUnifiedSearchInput}
                on:focus={() => {
                  if (!account_id && searchTerm.trim()) showCustomerDropdown = true;
                }}
                on:blur={() => setTimeout(() => (showCustomerDropdown = false), 150)}
                autocomplete="off" />
              {#if showCustomerDropdown && customerSuggestions.length > 0}
                <ul class="customer-dropdown">
                  {#each customerSuggestions as acc}
                    <li>
                      <button type="button" on:mousedown={() => selectCustomer(acc)}>
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
                  class="sales-search-clear"
                  aria-label={t('Clear Filters')}
                  title={t('Clear Filters')}
                  on:click={() => {
                    searchTerm = '';
                    showCustomerDropdown = false;
                    searchInputEl?.focus();
                  }}>
                  <i class="bi bi-x-lg" aria-hidden="true"></i>
                </button>
              {/if}

              <button
                type="button"
                class="sales-filter-toggle {filtersOpen || activeFilterCount > 0 ? 'sales-filter-toggle--active' : ''}"
                aria-label={t('Filter')}
                title={t('Filter')}
                aria-expanded={filtersOpen}
                aria-controls="sales-filter-panel"
                on:click={toggleFilters}>
                <i class="bi bi-sliders2" aria-hidden="true"></i>
              </button>
            </div>

          </div>

          {#if filtersOpen}
            <div class="filter-panel" id="sales-filter-panel">
            <FilterSelect
              label={t('Status')}
              icon="bi-activity"
              value={filterStatus}
              options={statusFilterOptions}
              on:change={(e) => (filterStatus = e.detail)} />

            <FilterSelect
              label={t('Payment')}
              icon="bi-wallet2"
              value={filterPaymentStatus}
              options={paymentStatusFilterOptions}
              on:change={(e) => (filterPaymentStatus = e.detail)} />

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

    <svelte:fragment slot="extra">
      <ActionButton
        variant="secondary"
        icon="bi-calculator"
        label={t('Calculate All Sales')}
        loading={calculatingAll}
        disabled={calculatingAll}
        extraClass="dev-btn"
        on:click={async () => {
          if (
            confirm(t('Are you sure you want to recalculate benefit and remaining for all sales? This may take a while.'))
          ) {
            calculatingAll = true;
            await calculateRemainingAndBenefitOfAllSales();
            calculatingAll = false;
            load();
          }
        }} />
    </svelte:fragment>

          {#if loading}
            <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
            </div>
          {:else if filteredSales.length === 0}
            <div class="index-table-state">
            <EmptyState icon="bi-inbox" message={t('No sales found.')} />
            </div>
          {:else}
            <DataTable
              ariaLabel={t('Sales')}
              minWidth="780px"
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
              <th class="cursor-pointer" on:click={() => setSort('invoice_date')}>
                {t('Invoice Date')}
                {#if sortColumn === 'invoice_date'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </th>
                  <th class="cursor-pointer" on:click={() => setSort('invoice_number')}>
                    {t('Invoice #')}
                    {#if sortColumn === 'invoice_number'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
                  <th class="cursor-pointer {account_id ? 'd-none' : ''}" on:click={() => setSort('account_id')}>
                    {t('Customer')}
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
                  <th class="cursor-pointer" on:click={() => setSort('remaining')}>
                    {t('Remaining')}
                    {#if sortColumn === 'remaining'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </th>
                  {#if showBenefit}
                    <th class="cursor-pointer" on:click={() => setSort('benefit')}>
                      {t('Benefit')}
                      {#if sortColumn === 'benefit'}
                        <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                      {/if}
                    </th>
              {/if}
              {#if shiftPressed && ctrlPressed}
                    <th class="cursor-pointer" on:click={() => setSort('items_count')}>
                      {t('Items')}
                      {#if sortColumn === 'items_count'}
                        <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
                    </th>
                  {/if}
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

              {#each paginatedSales as s, index (s.id)}
              <tr
                class={enable_due_date && s.due_date
                  ? new Date(s.due_date) < new Date()
                      ? 'row-overdue'
                    : new Date(s.due_date) - new Date() < 3 * 24 * 60 * 60 * 1000
                        ? 'row-due-soon'
                      : ''
                  : ''}>
                  <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>
                    <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(s.created_at)}</StatusBadge>
                  </td>
                <td>
                  <StatusBadge tone="neutral" ghost ltr={true} stacked>
                    {@html showDate(s.invoice_date || s.created_at)}
                  </StatusBadge>
                </td>
                  <td>
                    <button type="button" class="invoice-link" on:click={() => push(`/dashboard/sales/${s.id}`)}>
                      {s.invoice_number}
                    </button>
                </td>
                  <td class={account_id ? 'd-none' : ''}>
                    <button type="button" class="account-badge" on:click={() => push(`/dashboard/account/${s.account_id}`)}>
                    {getAccountName(accounts.find((a) => a.id == s.account_id))}
                    </button>
                  </td>
                  <td>
                    <span class="amount-pill">
                      <span dir="ltr">{Number(s.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      {t(s.currency)}
                    </span>
                  </td>
                  <td>
                    <div class="remaining-cell">
                      <button
                        type="button"
                        class="payment-add-btn"
                        title={t('Add Payment')}
                        aria-label={t('Add Payment')}
                        on:click={() => openPaymentModal(s)}>
                        {#if s.remaining !== undefined}
                          <span dir="ltr">
                            {(s.remaining == 0 ? 0 : Number(s.remaining)).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 3,
                            })}
                          </span>
                          {t(s.currency)}
                        {:else}
                          <span class="cell-muted">—</span>
                        {/if}
                      </button>
                    </div>
                  </td>
                  {#if showBenefit}
                    <td>
                      {#if s.benefit !== undefined}
                        <StatusBadge tone={Number(s.benefit) > 0 ? 'positive' : 'negative'}>
                          <span dir="ltr"
                            >{Number(s.benefit || 0).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 3,
                            })}</span>
                          {t(s.currency)}
                        </StatusBadge>
                      {:else}
                        <span class="cell-muted">—</span>
                      {/if}
                  </td>
                {/if}
                {#if shiftPressed && ctrlPressed}
                    <td>{s.items_count ?? '—'}</td>
                {/if}
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
                    
                   <button type="button" class="invoice-link" on:click={() => push(`/dashboard/sales/${s.id}`)}>
                     <StatusBadge tone={getStatusTone(s.invoice_status)}>{t(s.invoice_status)}</StatusBadge>
                    </button>
                    </td>
                  <td>
                    <TableActions
                      actions={[
                        {
                          icon: 'bi-eye',
                          label: t('View'),
                          tone: 'view',
                          onClick: () => push(`/dashboard/sales/${s.id}`),
                        },
                        {
                          icon: 'bi-pencil',
                          label: t('Edit'),
                          tone: 'edit',
                          onClick: () => push(`/dashboard/sale-form/` + s.id),
                        },
                           {
                          icon: 'bi-printer',
                          label: t('Print'),
                          tone: 'view',
                          onClick: () => {
                      selectedA4Sale = s;
                      if (enable_a4_default_print_mode) {
                        showA4Receipt = true;
                        showReceipt = false;
                      } else {
                        showReceipt = true;
                        showA4Receipt = false;
                      }
                          },
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
        ariaLabel={t('Sales pagination')}
        rowLabel={t('rows')}
        on:perPageChange={(e) => {
          itemsPerPage = Number(e.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
{/if}

{#if showA4Receipt}
  <SaleA4ReceiptModal
    sale={selectedA4Sale}
    on:close={() => (showA4Receipt = false)}
    on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
{/if}

{#if showReceipt}
  <SaleReceiptModal
    sale={selectedA4Sale}
    on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
    on:close={() => (showReceipt = false)} />
{/if}

<div class="modal fade" bind:this={addPaymentModal} tabindex="-1" aria-labelledby="addPaymentModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="addPaymentModalLabel">
          <i class="bi bi-plus-circle"></i>
          {t('Add Payment')} {selectedSale?.invoice_number}
        </h5>
        <button type="button" class="btn-close" on:click={closePaymentModal}></button>
      </div>
      <div class="modal-body">
        {#if selectedSale}
          <PaymentSection saleId={selectedSale.id} />
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  :global(.sales-index-content .data-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: var(--table-font-size, 0.78rem);
  }

  :global(.sales-index-content .data-table thead th) {
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

  :global(.sales-index-content .data-table tbody tr) {
    height: auto;
    background: #ffffff;
  }

  :global(.sales-index-content .data-table tbody td) {
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

  :global(.sales-index-content .data-table tbody tr:nth-child(even)) {
    background: #f5f7fa;
  }

  :global(.sales-index-content .data-table tbody tr:nth-child(odd):hover) {
    background: #ffffff;
  }

  :global(.sales-index-content .data-table tbody tr:nth-child(even):hover) {
    background: #f5f7fa;
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

  .sales-summary-grid {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .filters-wrap {
    position: relative;
    z-index: 50;
    width: 100%;
    min-width: 0;
    overflow: visible;
    background: transparent;
  }

  .filters-wrap.filters-open {
    z-index: 100;
  }

  .filter-toolbar {
    width: 100%;
    padding: 0;
  }

  .filter-toolbar-row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
  }

  .sales-filter-toggle {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: 0 0 1.75rem;
    width: 1.75rem;
    min-width: 1.75rem;
    max-width: 1.75rem;
    height: 1.75rem;
    min-height: 1.75rem;
    max-height: 1.75rem;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0.4rem;
    background: #0f6efd;
    color: #ffffff;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
    transition:
      background 0.16s ease,
      color 0.16s ease,
      transform 0.16s ease;
  }

  .sales-filter-toggle:hover {
    background: #0f6efd;
    color: #ffffff;
  }

  .sales-filter-toggle:active {
    transform: scale(0.95);
  }

  .sales-filter-toggle--active {
    background: #0f6efd;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
  }

  .sales-filter-toggle i {
    color: inherit !important;
  }

  .sales-filter-toggle:not(.sales-filter-toggle--active) i {
    color: #ffffff !important;
  }

  .sales-filter-toggle--active i {
    color: #ffffff !important;
  }

  .filter-panel {
    position: absolute;
    top: calc(100% + 0.75rem);
    right: 0;
    z-index: 1000;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr));
    gap: 0.75rem;
    width: min(52rem, calc(100vw - 3rem));
    margin: 0;
    padding: 1rem;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 1rem;
    background: #ffffff;
    box-shadow:
      0 24px 60px rgba(15, 23, 42, 0.17),
      0 8px 20px rgba(15, 23, 42, 0.07);
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
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: var(--index-toolbar-control-height, 2.625rem);
    min-height: var(--index-toolbar-control-height, 2.625rem);
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

  .customer-chip {
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

  .customer-chip > span {
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

  .customer-dropdown {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 4px);
    z-index: 110;
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

  .customer-dropdown button {
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

  .customer-dropdown button:hover {
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

  .filter-panel :global(.show-all-btn) {
    min-height: var(--control-height-sm, 2.125rem);
    padding-inline: 0.85rem;
    border-radius: 8px;
    border-color: #dbe7f3;
    background: #ffffff;
    color: #64748b;
    box-shadow: none;
    white-space: nowrap;
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

  :global(html.dark) .amount-pill,
  :global(html.dark) .payment-add-btn,
  :global([data-mdb-theme='dark']) .amount-pill,
  :global([data-mdb-theme='dark']) .payment-add-btn {
    border-color: #334762;
    background: #172033;
    color: #dbe7f7;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  :global(html.dark) .payment-add-btn,
  :global([data-mdb-theme='dark']) .payment-add-btn {
    border-color: rgba(96, 165, 250, 0.34);
    color: #93c5fd;
  }

  :global(html.dark) .amount-pill:hover,
  :global(html.dark) .payment-add-btn:hover,
  :global([data-mdb-theme='dark']) .amount-pill:hover,
  :global([data-mdb-theme='dark']) .payment-add-btn:hover {
    border-color: #4a5f7d;
    background: #202b3d;
    color: #bfdbfe;
  }

  @media (max-width: 991.98px) {
    .sales-summary-grid,
    .sales-summary-grid--benefit {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 767.98px) {
    .filter-toolbar-row {
      flex-direction: column;
      align-items: stretch;
    }

    .unified-search,
    .sales-filter-toggle,
    :global(.filter-select),
    .date-field,
    :global(.show-all-btn) {
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
</style>
