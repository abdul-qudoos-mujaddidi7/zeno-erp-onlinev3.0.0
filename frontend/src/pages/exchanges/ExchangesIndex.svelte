<script>
  import { onMount, onDestroy } from 'svelte';
  import { exchangeApi } from '../../api/exchangeApi.js';
  import { toast } from '../../ToastUI/toast.js';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, readListMeta } from '../../lib/pagination.js';

  import { push } from 'svelte-spa-router';
  import ExchangeReceiptModal from './ExchangeReceiptModal.svelte';
  let showReceipt = false;
  let selectedExchange = null;

  import { t, lang, translate_org_type,shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let accounts = [];
  let currencies = [];
  let exchanges = [];

  let loading = true;
  let TREASURY_ID = null;
  let accountsLoaded = false;

  let currency = '';
  import { showDate } from '../../calendar.js';

  import AddExchange from './AddExchange.svelte';
  import QuickEntryModal from '../../components/common/QuickEntryModal.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import { auth } from '../../auth/authStore';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountApi } from '../../api/accountApi.js';
  $: permissions = $auth.permissions;

  export let account_id = null;

  async function loadAccountsForFilter() {
    if (accountsLoaded) return;
    const [accountsResponse, treasuryResponse] = await Promise.all([
      accountApi.getAll({ status: 1 }),
      accountApi.getAll({ status: 1, code: 'TREASURY' }),
    ]);
    accounts = (accountsResponse?.data || []).filter((a) =>
      a.account_status ? a.account_status == 'active' : a.status == 1,
    );
    TREASURY_ID = treasuryResponse?.data?.[0]?.id || null;
    accountsLoaded = true;
  }

  async function ensurePeerAccounts(rows) {
    const needed = new Set();
    for (const row of rows || []) {
      if (row.first_entry_account) needed.add(Number(row.first_entry_account));
      if (row.second_entry_account) needed.add(Number(row.second_entry_account));
    }
    const have = new Set(accounts.map((a) => Number(a.id)));
    const missing = [...needed].filter((id) => !have.has(id));
    if (!missing.length) return;

    if (missing.length > 40) {
      await loadAccountsForFilter();
      return;
    }

    const fetched = await Promise.all(
      missing.map((id) =>
        accountApi.getById(id).then((res) => res?.data).catch(() => null),
      ),
    );
    accounts = [...accounts, ...fetched.filter(Boolean)];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadExchanges() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;

    try {
      const response = await exchangeApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        exclude_system_accounts: 1,
        skip_count: 1,
        account_id:
          account_id || (filterAccount !== 'all' ? Number(filterAccount) : undefined),
        reference_type: reference_type || undefined,
        page: currentPage,
        limit: itemsPerPage,
      });

      if (requestId !== loadRequestId) return;

      exchanges = response?.data || [];
      await ensurePeerAccounts(exchanges);

      const hasMore = Boolean(response?.meta?.hasMore);
      const meta = readListMeta(response, exchanges.length);
      totalItems = hasMore
        ? Math.max(meta.total, currentPage * itemsPerPage + 1)
        : Math.max(meta.total, (currentPage - 1) * itemsPerPage + exchanges.length);
      totalPages = hasMore
        ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
        : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);

      exchanges.forEach((j) => {
        if (!reference_types.includes(j.reference_type)) {
          reference_types = [...reference_types, j.reference_type];
        }
      });
    } catch (error) {
      console.error('Failed to load exchanges:', error);
      exchanges = [];
      totalPages = 1;
      totalItems = 0;
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  let searchTerm = '';
  let filterAccount = 'all';
  let filterStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let reference_type = null;
  let reference_types = [null];
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;

  onMount(async () => {
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await Promise.all([loadCurrencies(), loadExchanges()]);
    // Account filter dropdown can load after first paint.
    loadAccountsForFilter().catch(() => {});
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
      loadExchanges();
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else loadExchanges();
    }, 300);
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

  $: filteredExchanges = (() => {
    let result = exchanges.slice();

    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'account') {
        valA = getAccountName(a.first_entry_account);
        valB = getAccountName(b.first_entry_account);
      }

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

  $: paginatedExchanges = filteredExchanges;

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  async function deleteExchange(id) {
    await exchangeApi.remove(id);
    await loadExchanges();
  }

  function getAccountName(id) {
    const acc = accounts.find((a) => Number(a.id) === Number(id)) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  function getExchangeActions(exchange) {
    if (exchange.reference_type != 'account' && exchange.reference_id) {
      if (exchange.reference_type === 'stock_transfer') {
        return [{
          icon: 'bi-box2',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/stock-transfers/${exchange.reference_id}`),
        }];
      }

      if (exchange.reference_type === 'sale') {
        return [{
          icon: 'bi-cart',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/sales/${exchange.reference_id}`),
        }];
      }

      if (exchange.reference_type === 'sale_payment') {
        return [{
          icon: 'bi-cart',
          label: t('View'),
          tone: 'view',
          onClick: () => {
            if (exchange.reference_sale_id) {
              push(`/dashboard/sales/${exchange.reference_sale_id}`);
            }
          },
        }];
      }

      if (exchange.reference_type === 'purchase') {
        return [{
          icon: 'bi-truck',
          label: t('View'),
          tone: 'view',
          onClick: () => push(`/dashboard/purchases/${exchange.reference_id}`),
        }];
      }

      if (exchange.reference_type === 'purchase_payment') {
        return [{
          icon: 'bi-truck',
          label: t('View'),
          tone: 'view',
          onClick: () => {
            if (exchange.reference_purchase_id) {
              push(`/dashboard/purchases/${exchange.reference_purchase_id}`);
            }
          },
        }];
      }

      return [];
    }

    const actions = [{
      icon: 'bi-printer',
      label: t('Print'),
      tone: 'view',
      onClick: () => {
        showReceipt = true;
        selectedExchange = exchange;
      },
    }];

    if (permissions?.some((permission) => permission.code === 'Exchange' && permission.edit)) {
      actions.push({
        icon: 'bi-pencil',
        label: t('Edit'),
        tone: 'edit',
        onClick: () => editExchange(exchange),
      });
    }

    if (permissions?.some((permission) => permission.code === 'Exchange' && permission.delete)) {
      actions.push({
        icon: 'bi-trash',
        label: t('Delete'),
        tone: 'danger',
        onClick: () => {
          toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then((ok) => {
            if (ok) deleteExchange(exchange.id);
          });
        },
      });
    }

    return actions;
  }

  function handleExchangeFilterChange(event) {
    if (event.detail.key === 'account') filterAccount = event.detail.value;
    if (event.detail.key === 'reference') {
      reference_type = event.detail.value === 'all' ? null : event.detail.value;
    }
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    loadExchanges();
  }

  function resetExchangeFilters() {
    filterAccount = 'all';
    reference_type = null;
    searchTerm = '';
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    loadExchanges();
  }

  function editExchange(exchange) {
    editingExchangeId = exchange.id;
    showExchangeForm = true;
  }

  let showExchangeForm = false;
  let editingExchangeId = null;

  function openAddExchange() {
    editingExchangeId = null;
    showExchangeForm = true;
  }

  function closeExchangeForm() {
    showExchangeForm = false;
    editingExchangeId = null;
  }

  async function handleExchangeSaved() {
    closeExchangeForm();
    await loadExchanges();
  }

  $: exchangeToolbarFilters = [
    {
      key: 'account',
      label: t('Account'),
      value: filterAccount,
      visible: !account_id,
      options: [
        { value: 'all', label: t('All') },
        ...accounts.map((account) => ({ value: account.id, label: getAccountName(account.id) })),
      ],
    },
    {
      key: 'reference',
      label: t('Reference Type'),
      value: reference_type ?? 'all',
      options: [
        { value: 'all', label: t('All') },
        ...reference_types.filter(Boolean).map((type) => ({ value: type, label: t(type) })),
      ],
    },
  ];
</script>

<div class="exchanges-page">

{#if showExchangeForm}
  <QuickEntryModal
    title={editingExchangeId ? t('Update Exchange') : t('Add Exchange')}
    subtitle=""
    icon="bi-currency-exchange"
    appearance="exchange"
    dir={t('dir')}
    on:close={closeExchangeForm}>
    {#key editingExchangeId}
      <AddExchange
        exchangeId={editingExchangeId}
        selectedAccountID={account_id ? Number(account_id) : null}
        on:saved={handleExchangeSaved} />
    {/key}
  </QuickEntryModal>
{/if}

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Exchanges')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredExchanges.length > 0}
  dense={true}
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-plus-lg"
     label={t('Add Exchange')}
     on:click={openAddExchange} />
</svelte:fragment>
  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search exchanges...')}
      filters={exchangeToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        scheduleSearchReload();
      }}
      on:filterChange={handleExchangeFilterChange}
      on:reset={resetExchangeFilters} />
  </svelte:fragment>

    {#if loading}
      <div class="index-table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if filteredExchanges.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-inbox" message={t('No exchange entries found.')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Exchanges')}
        minWidth="980px"
        dense={true}
        striped={true}
        hover={false}
        stickyHeader={true}
        layout="fixed"
        scrollbar="thin">
          <svelte:fragment slot="head">
            <tr>
              <th class="col-start cursor-pointer" on:click={() => setSort('id')}>
                {t('#')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('date')}
                >{t('Date')}
                {#if sortColumn === 'date'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('account')}
                >{t('Account')}
                {#if sortColumn === 'account'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center">{t('Description')} </th>
              <th class="text-center">{t('Debit')} </th>
              <th class="text-center">{t('Rate')} </th>
              <th class="text-center">{t('Credit')} </th>
              <!-- <th class="text-center" on:click={() => setSort('benefit_amount')}> -->
                <!-- {t('Benefit')}
                {#if sortColumn === 'benefit_amount'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if} -->
              <!-- </th> -->
              <th class="text-center">{t('Actions')}</th>
            </tr>
          </svelte:fragment>
            {#each paginatedExchanges as j, index}
              <tr>
                <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td>
                  <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(j.date)}</StatusBadge>
                </td>
                <td>
                  <div class="account-pair">
                    <StatusBadge tone={j.first_entry_credit > 0 ? 'positive' : 'negative'}>
                      <button
                        type="button"
                        class="cell-link"
                        on:click={() => push(`/dashboard/account/${j.first_entry_account}`)}>
                        {getAccountName(j.first_entry_account)}
                      </button>
                    </StatusBadge>
                    <StatusBadge tone={j.second_entry_credit > 0 ? 'positive' : 'negative'}>
                      <button
                        type="button"
                        class="cell-link"
                        on:click={() => push(`/dashboard/account/${j.second_entry_account}`)}>
                        {getAccountName(j.second_entry_account)}
                      </button>
                    </StatusBadge>
                  </div>
                </td>
                <td><span class="description-cell" title={j.description || ''}>{j.description || '—'}</span></td>
                <td>
                  {#if j.first_entry_debit != 0}
                    <StatusBadge tone="negative">
                      <span dir="ltr">
                        {Number(j.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </span>
                      <span>{t(j.first_currency)}</span>
                    </StatusBadge>
                  {:else}
                    <span class="muted-dash">—</span>
                  {/if}
                </td>
                <td>
                  <StatusBadge tone="info" ltr={true}>
                    {Number(parseFloat(j.rate)).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                      minimumFractionDigits: 2,
                    })}
                  </StatusBadge>
                </td>
                <td>
                  {#if j.second_entry_credit != 0}
                    <StatusBadge tone="positive">
                      <span dir="ltr">
                        {Number(j.second_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </span>
                      <span>{t(j.second_currency)}</span>
                    </StatusBadge>
                  {:else}
                    <span class="muted-dash">—</span>
                  {/if}
                </td>
                <!-- <td>
                  <StatusBadge tone={j.benefit_amount < 0 ? 'negative' : 'positive'} ltr={true}>
                    {j.benefit_amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    {t(j.first_currency)}
                  </StatusBadge>
                </td> -->
                <td><TableActions actions={getExchangeActions(j)} /></td>
              </tr>
            {/each}
      </DataTable>
    {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={null}
      ariaLabel={t('Exchanges pagination')}
      rowLabel={t('rows')}
      perPageOptions={PAGE_SIZE_OPTIONS}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>
</div>

{#if showReceipt}
  <ExchangeReceiptModal exchange={selectedExchange} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .exchanges-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.65rem;
    width: 100%;
    min-height: 0;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
  }
  .quick-add-button {
    min-height: 2.625rem;
    padding: 0.55rem 1rem;
    border: 0;
    border-radius: 0.65rem;
    background: #2f6fed;
    color: #fff;
    box-shadow: 0 6px 14px rgba(47, 111, 237, 0.2);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    font-weight: 800;
    white-space: nowrap;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .quick-add-button:hover { background: #245ed0; box-shadow: 0 8px 18px rgba(47, 111, 237, 0.26); transform: translateY(-1px); }
  .exchanges-page :global(.filter-toggle) {
    flex-basis: 1.75rem !important;
    width: 1.75rem !important;
    min-width: 1.75rem !important;
    max-width: 1.75rem !important;
    height: 1.75rem !important;
    min-height: 1.75rem !important;
    max-height: 1.75rem !important;
    border-radius: 0.4rem !important;
    background: #0f6efd !important;
    color: #ffffff !important;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18) !important;
  }
  .exchanges-page :global(.filter-toggle:hover) { background: #1d4ed8 !important; }
  .exchanges-page :global(.filter-toggle i) {
    color: #ffffff !important;
    opacity: 1;
    -webkit-text-fill-color: #ffffff;
  }
  .exchanges-page :global(.index-page) { flex: 1 1 auto; height: auto; }
  .exchanges-toolbar { width: 100%; min-width: 0; padding: 0; background: transparent; }
  .exchanges-toolbar :global(.row) { width: 100%; margin: 0; }
  .exchanges-toolbar :global(.col-md-3) { width: 100%; padding: 0; }
  .exchanges-toolbar :global(.form-outline) {
    position: relative;
    display: flex;
    align-items: center;
    gap: .5rem;
    width: 100%;
    min-height: var(--index-toolbar-control-height, 2.625rem);
    padding-inline: .75rem .375rem;
    border: 1px solid #d6e0ed;
    border-radius: .625rem;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15,23,42,.025);
  }
  .exchange-search-icon { flex: 0 0 auto; color: #9aabc0; font-size: 1rem; }
  .exchanges-toolbar :global(.exchange-search-input) { flex: 1 1 auto; min-width: 0; height: 2.5rem; min-height: 2.5rem; margin: 0; padding: 0; border: 0; outline: 0; background: transparent; box-shadow: none; font-size: .875rem; }
  .exchange-search-clear { display: inline-grid; place-items: center; flex: 0 0 1.75rem; width: 1.75rem; height: 1.75rem; padding: 0; border: 0; border-radius: .4375rem; background: transparent; color: #94a3b8; font-size: .6875rem; }
  .exchange-search-clear:hover { background: #f1f5f9; color: #475569; }
  .account-pair {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: .25rem;
  }
  .cell-link {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .description-cell {
    display: block;
    overflow: hidden;
    color: #64748b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-muted,
  .muted-dash { color: #94a3b8; }
  .cursor-pointer {
    cursor: pointer;
  }
</style>
