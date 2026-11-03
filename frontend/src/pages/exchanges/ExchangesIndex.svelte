<script>
  import { onMount, onDestroy } from 'svelte';
  import { push, querystring } from 'svelte-spa-router';
  import { exchangeApi } from '../../api/exchangeApi.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { toast } from '../../ToastUI/toast.js';
  import { auth } from '../../auth/authStore';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, readListMeta } from '../../lib/pagination.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';

  import ActionButton from '../../components/common/ActionButton.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import AddExchange from './AddExchange.svelte';
  import ExchangeReceiptModal from './ExchangeReceiptModal.svelte';
  import QuickEntryModal from '../../components/common/QuickEntryModal.svelte';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: permissions = $auth.permissions;

  export let account_id = null;

  let accounts = [];
  let currencies = [];
  let exchanges = [];

  let loading = true;
  let accountsLoaded = false;

  let searchTerm = '';
  let filtersOpen = false;
  let filterAccount = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'date';
  let sortDirection = 'desc';
  let reference_type = null;
  let reference_types = [null];
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;

  let showReceipt = false;
  let selectedExchange = null;
  let showExchangeForm = false;
  let editingExchangeId = null;

  /* ------------------------------------------------------------------ *
   * Lookups                                                             *
   * ------------------------------------------------------------------ */

  async function loadAccountsForFilter() {
    if (accountsLoaded) return;
    const accountsResponse = await accountApi.getAll({ status: 1 });
    accounts = (accountsResponse?.data || []).filter((a) =>
      a.account_status ? a.account_status == 'active' : a.status == 1,
    );
    accountsLoaded = true;
  }

  /*
   * A page only carries the ids of the accounts it shows, so the names of
   * anything newer than the filter list are fetched one by one — or the whole
   * list once that would be cheaper.
   */
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

  function nameForLanguage(account, language) {
    if (!account) return '';
    if (language === 'en') return account.name || '';
    if (language === 'ps') return account.name_ps || account.name || '';
    return account.name_fa || account.name || '';
  }

  /* Memoised so a translated name is picked up when the language changes. */
  $: accountNameById = new Map(
    accounts.map((account) => [String(account.id), nameForLanguage(account, $lang)]),
  );

  function accountName(id) {
    const key = String(id ?? '');
    if (!key) return '—';
    return accountNameById.get(key) || '…';
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  }

  /* ------------------------------------------------------------------ *
   * Reference formatting                                                *
   * ------------------------------------------------------------------ */

  /* Three decimals keep the raw ledger value intact (e.g. 6,602.425). */
  const amountFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  const rateFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  /* The reference prints the Persian day with Latin digits, like the bills. */
  const persianDateFormatter = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const CURRENCY_SYMBOL_FALLBACKS = { AFN: '؋', USD: '$', EUR: '€', PKR: 'Rs', IRR: '﷼' };

  function asDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function amountText(value) {
    const number = Number(value);
    return amountFormatter.format(Number.isFinite(number) ? number : 0);
  }

  function persianDate(value) {
    const date = asDate(value);
    return date ? persianDateFormatter.format(date) : '—';
  }

  function isoDate(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function rateText(value) {
    const number = Number(value);
    return Number.isFinite(number) && number !== 0 ? rateFormatter.format(number) : '—';
  }

  function currencyUnit(code) {
    const normalized = String(code ?? '').toUpperCase();
    if (!normalized) return '';
    const match = currencies.find(
      (currency) => String(currency.code ?? '').toUpperCase() === normalized,
    );
    return match?.symbol || CURRENCY_SYMBOL_FALLBACKS[normalized] || t(normalized);
  }

  /*
   * The two lines of an exchange, read the way the ledger writes them: one
   * account is debited and the other is credited. A page row stores both
   * entries, and which side they sit on is decided by the amounts.
   */
  function entriesOf(row) {
    const firstDebit = Number(row.first_entry_debit || 0);
    const firstCredit = Number(row.first_entry_credit || 0);
    const secondDebit = Number(row.second_entry_debit || 0);
    const secondCredit = Number(row.second_entry_credit || 0);

    const firstIsDebit = firstDebit > 0 || (firstCredit === 0 && secondCredit > 0);

    const debit = firstIsDebit
      ? { amount: firstDebit, currency: row.first_currency, account: row.first_entry_account }
      : { amount: secondDebit, currency: row.second_currency, account: row.second_entry_account };

    const credit = firstIsDebit
      ? { amount: secondCredit, currency: row.second_currency, account: row.second_entry_account }
      : { amount: firstCredit, currency: row.first_currency, account: row.first_entry_account };

    return {
      debit: { ...debit, currency: String(debit.currency || '').toUpperCase() },
      credit: { ...credit, currency: String(credit.currency || '').toUpperCase() },
    };
  }

  /* ------------------------------------------------------------------ *
   * Data loading                                                        *
   * ------------------------------------------------------------------ */

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

  onMount(async () => {
    if (new URLSearchParams($querystring || '').get('addExchange') === '1') {
      openAddExchange();
      push('/dashboard/exchanges/list');
    }

    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await Promise.all([loadCurrencies(), loadExchanges()]);
    // The account filter can fill in after the first paint.
    loadAccountsForFilter().catch(() => {});
  });

  onDestroy(() => {
    loadRequestId += 1;
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

  /* ------------------------------------------------------------------ *
   * Rows, sorting and the pager                                         *
   * ------------------------------------------------------------------ */

  $: filteredExchanges = (() => {
    const rows = exchanges.slice();

    rows.sort((a, b) => {
      let valA;
      let valB;

      if (sortColumn === 'account') {
        valA = accountName(entriesOf(a).debit.account);
        valB = accountName(entriesOf(b).debit.account);
      } else {
        valA = a[sortColumn];
        valB = b[sortColumn];
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  })();

  $: paginatedExchanges = filteredExchanges;

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = column === 'date' ? 'desc' : 'asc';
    }
  }

  function sortAria(column) {
    if (sortColumn !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  $: rangeStart = totalItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
  $: rangeEnd = Math.min(currentPage * itemsPerPage, totalItems);

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

  function ordinalOf(index) {
    return (currentPage - 1) * itemsPerPage + index + 1;
  }

  /* ------------------------------------------------------------------ *
   * Actions                                                             *
   * ------------------------------------------------------------------ */

  async function deleteExchange(id) {
    await exchangeApi.remove(id);
    await loadExchanges();
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
      tone: 'muted',
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

  function editExchange(exchange) {
    editingExchangeId = exchange.id;
    showExchangeForm = true;
  }

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

  /* ------------------------------------------------------------------ *
   * Filters                                                             *
   * ------------------------------------------------------------------ */

  function handleExchangeFilterChange(event) {
    if (event.detail.key === 'account') filterAccount = event.detail.value;
    if (event.detail.key === 'reference') {
      reference_type = event.detail.value === 'all' ? null : event.detail.value;
    }
    currentPage = 1;
    loadExchanges();
  }

  function resetExchangeFilters() {
    filterAccount = 'all';
    reference_type = null;
    searchTerm = '';
    currentPage = 1;
    loadExchanges();
  }

  $: activeChips = (() => {
    const chips = [];

    if (!account_id && filterAccount !== 'all') {
      chips.push({
        key: 'account',
        label: `${t('Account')}: ${accountName(filterAccount)}`,
        clear: () => {
          filterAccount = 'all';
          currentPage = 1;
          loadExchanges();
        },
      });
    }

    if (reference_type) {
      chips.push({
        key: 'reference',
        label: `${t('Reference Type')}: ${t(reference_type)}`,
        clear: () => {
          reference_type = null;
          currentPage = 1;
          loadExchanges();
        },
      });
    }

    return chips;
  })();

  $: toolbarActiveCount = activeChips.length;

  $: exchangeToolbarFilters = [
    {
      key: 'account',
      label: t('Account'),
      value: filterAccount,
      icon: 'bi-person',
      visible: !account_id,
      options: [
        { value: 'all', label: t('All') },
        ...accounts.map((account) => ({ value: account.id, label: accountName(account.id) })),
      ],
    },
    {
      key: 'reference',
      label: t('Reference Type'),
      value: reference_type ?? 'all',
      icon: 'bi-link-45deg',
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
          on:saved={handleExchangeSaved}
          on:close={closeExchangeForm} />
      {/key}
    </QuickEntryModal>
  {/if}

  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Exchanges')}
    showExtra={true}
    showFooter={!loading && filteredExchanges.length > 0}
    dense={true}
    contentClass="exchanges-index-content"
    tablePadding={true}>
    <svelte:fragment slot="extra">
      <ActionButton
        icon="add"
        label={t('Add Exchange')}
        extraClass="exchanges-create"
        on:click={openAddExchange} />
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        bind:filtersOpen
        searchValue={searchTerm}
        searchPlaceholder={t('Search exchanges...')}
        filters={exchangeToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        applyLabel={t('Show')}
        activeCount={toolbarActiveCount}
        showReset={true}
        on:searchChange={(event) => {
          searchTerm = event.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleExchangeFilterChange}
        on:reset={resetExchangeFilters} />
    </svelte:fragment>

    {#if activeChips.length}
      <div class="active-filters">
        {#each activeChips as chip (chip.key)}
          <button type="button" class="active-chip" on:click={chip.clear}>
            {chip.label}
            <span class="ms" aria-hidden="true">close</span>
          </button>
        {/each}
        <button type="button" class="active-filters__clear" on:click={resetExchangeFilters}>
          {t('Clear Filters')}
        </button>
      </div>
    {/if}

    {#if loading}
      <TableSkeleton
        ariaLabel={t('Loading...')}
        colCount={7}
        minWidth="1000px"
        headerHeight="40px"
        cellPaddingY="6px" />
    {:else if filteredExchanges.length === 0}
      <div class="index-table-state">
        <EmptyState
          icon="bi-search"
          message={t('No exchange entries found.')}
          description={t('Change the range or filters')}>
          <button type="button" class="empty-clear" on:click={resetExchangeFilters}>
            {t('Clear Filters')}
          </button>
        </EmptyState>
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Exchanges')}
        columns={['76px', '144px', 'auto', '160px', '128px', '160px', '96px']}
        minWidth="1000px"
        dense={true}
        striped={false}
        hover={false}
        stickyHeader={true}
        headerHeight="40px"
        cellPaddingY="6px"
        cellPaddingX="12px"
        headPaddingX="12px"
        edgePaddingX="16px"
        headEdgePaddingX="16px"
        mobileCards={true}>
        <svelte:fragment slot="head">
          <tr>
            <th class="col-start">{t('Documents')}</th>
            <th class="col-center" aria-sort={sortAria('date')}>
              <button type="button" class="th-sort" on:click={() => setSort('date')}>
                {t('Date')}
                {#if sortColumn === 'date'}
                  <span class="ms sort-icon" aria-hidden="true">
                    {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                {:else}
                  <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                {/if}
              </button>
            </th>
            <th aria-sort={sortAria('account')}>
              <button type="button" class="th-sort" on:click={() => setSort('account')}>
                {t('Account')}
                {#if sortColumn === 'account'}
                  <span class="ms sort-icon" aria-hidden="true">
                    {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                {:else}
                  <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                {/if}
              </button>
            </th>
            <th class="col-end">{t('Debit')}</th>
            <th class="col-center">{t('Rate')}</th>
            <th class="col-end">{t('Credit')}</th>
            <!-- The reference leaves this header blank; the label still names
                 the column for assistive tech. -->
            <th class="col-end actions-head">{t('Actions')}</th>
          </tr>
        </svelte:fragment>

        {#each paginatedExchanges as j, index (j.id)}
          {@const entry = entriesOf(j)}
          <tr class="exchange-row">
            <td class="col-start">
              <span class="doc-no" dir="ltr">#{ordinalOf(index)}</span>
            </td>
            <td class="col-center">
              <div class="doc-date" title={isoDate(j.date)}>
                <span class="doc-date__main">{persianDate(j.date)}</span>
                <span class="doc-date__sub" dir="ltr">{isoDate(j.date)}</span>
              </div>
            </td>
            <td>
              <div class="party">
                <span class="party__line">
                  <span class="party__side party__side--dr">{t('Debit')}</span>
                  <button
                    type="button"
                    class="party__name"
                    class:is-static={!entry.debit.account}
                    title={accountName(entry.debit.account)}
                    on:click={() => entry.debit.account && push(`/dashboard/account/${entry.debit.account}`)}>
                    {accountName(entry.debit.account)}
                  </button>
                </span>
                <span class="party__line">
                  <span class="party__side party__side--cr">{t('Credit')}</span>
                  <button
                    type="button"
                    class="party__name"
                    class:is-static={!entry.credit.account}
                    title={accountName(entry.credit.account)}
                    on:click={() => entry.credit.account && push(`/dashboard/account/${entry.credit.account}`)}>
                    {accountName(entry.credit.account)}
                  </button>
                </span>
              </div>
            </td>
            <td class="col-end">
              {#if entry.debit.amount}
                <span
                  class="amount amount--debit"
                  title={`${t('Debit')}: ${amountText(entry.debit.amount)} ${currencyUnit(entry.debit.currency)}`}>
                  <span class="amount__value">{amountText(entry.debit.amount)}</span>
                  <span class="amount__unit">{currencyUnit(entry.debit.currency)}</span>
                </span>
              {:else}
                <span class="muted-dash">—</span>
              {/if}
            </td>
            <td class="col-center">
              <span class="rate-chip" dir="ltr">{rateText(j.rate)}</span>
            </td>
            <td class="col-end">
              {#if entry.credit.amount}
                <span
                  class="amount amount--credit"
                  title={`${t('Credit')}: ${amountText(entry.credit.amount)} ${currencyUnit(entry.credit.currency)}`}>
                  <span class="amount__value">{amountText(entry.credit.amount)}</span>
                  <span class="amount__unit">{currencyUnit(entry.credit.currency)}</span>
                </span>
              {:else}
                <span class="muted-dash">—</span>
              {/if}
            </td>
            <td class="col-end">
              <TableActions material={true} actions={getExchangeActions(j)} />
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
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        perPageOptions={PAGE_SIZE_OPTIONS}
        ariaLabel={t('Exchanges')}
        rowLabel={t('Documents')}
        perPageRowLabel={t('rows')}
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
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /*
   * The reference keeps the toolbar, table and pager inside one 14px sheet, so
   * the shared panel is unwrapped here and its children are re-ordered to that
   * stack.
   */
  .exchanges-page :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .exchanges-page :global(.index-toolbar) {
    order: 0;
    flex: 0 0 auto;
    min-height: 0;
    padding: 12px 14px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: var(--z-r-xl, 14px) var(--z-r-xl, 14px) 0 0;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .exchanges-page :global(.index-toolbar-main) {
    gap: 8px;
  }

  .exchanges-page :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
    flex-wrap: nowrap;
  }

  .exchanges-page :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    --z-row-border: var(--z-border-soft, #eef2f7);
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }

  .exchanges-page :global(.exchanges-index-content .data-table-wrap) {
    border: 0;
  }

  .exchanges-page :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .exchanges-page :global(.index-footer .pagination-shell) {
    padding: 10px 16px;
    border: 0;
    background: var(--z-surface-2, #f8fafc);
  }

  /* ---------- active filter chips ---------- */
  .active-filters {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface-2, #f8fafc);
  }

  .active-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding-inline-start: 10px;
    padding-inline-end: 6px;
    border: 1px solid var(--z-border-strong, #dce6f8);
    border-radius: 999px;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .active-chip .ms {
    font-size: 14px;
  }

  .active-filters__clear {
    height: 26px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--z-muted, #64748b);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }

  .active-filters__clear:hover {
    color: var(--z-ink, #0b1530);
  }

  /* ---------- table header ---------- */
  .th-sort {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    margin-inline-start: -6px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.14s ease,
      color 0.14s ease;
  }

  .th-sort:hover {
    color: var(--z-ink, #0b1530);
  }

  .th-sort .sort-icon {
    font-size: 14px;
    margin: 0;
    opacity: 1;
  }

  .th-sort .sort-icon--idle {
    opacity: 0.55;
  }

  .actions-head {
    color: transparent;
    font-size: 0;
  }

  /* ---------- rows ---------- */
  .exchange-row {
    height: auto;
  }

  .exchange-row:hover {
    background: var(--z-hover, #f5f9ff);
  }

  .doc-no {
    color: var(--z-muted, #64748b);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .doc-date {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.35;
  }

  .doc-date__main {
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-size: 12.5px;
    font-weight: 600;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-date__sub {
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 11px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One line per side, so the pair always reads debit then credit. */
  .party {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .party__line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .party__side {
    flex: 0 0 auto;
    border-radius: 5px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.6;
    white-space: nowrap;
  }

  .party__side--dr {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .party__side--cr {
    background: var(--z-credit-soft, #e7f6ec);
    color: var(--z-credit, #16a34a);
  }

  .party__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 700;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .party__name:hover {
    color: var(--z-link, #2f6fed);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .party__name.is-static {
    color: var(--z-subtle, #94a3b8);
    cursor: default;
    text-decoration: none;
  }

  /*
   * The value and the currency are two boxes, not one string: bidi reorders the
   * Afghani sign and the trailing «€» around the digits differently, which
   * flipped the pair from row to row. The RTL flex row keeps the number flush
   * to the start of the cell with the currency hanging after it.
   */
  .amount {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    max-width: 100%;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.55;
    white-space: nowrap;
  }

  .amount__value {
    direction: ltr;
  }

  .amount--debit {
    color: var(--z-debit, #dc2626);
  }

  .amount--credit {
    color: var(--z-credit, #16a34a);
  }

  .amount__unit {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 10px;
    font-weight: 700;
  }

  .rate-chip {
    display: inline-block;
    border-radius: 999px;
    padding: 2px 8px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.55;
    white-space: nowrap;
  }

  .muted-dash {
    color: var(--z-subtle, #94a3b8);
  }

  /* The reference row actions are 30px squares with an 8px radius. */
  .exchanges-page :global(.table-actions .action-btn) {
    width: 30px;
    height: 30px;
    min-height: 30px;
    border-radius: 8px;
  }

  .empty-clear {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--z-border-strong, #dce6f8);
    border-radius: 9px;
    background: var(--z-surface, #ffffff);
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .empty-clear:hover {
    background: var(--z-brand-soft, #e3ecff);
  }

  /* Reference empty state: glyph in a 48px tile. */
  .exchanges-page :global(.index-table-state .empty-state i) {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-muted, #64748b);
    font-size: 26px;
  }

  .exchanges-page :global(.index-table-state .empty-state p) {
    color: var(--z-ink, #0b1530);
    font-size: 14px;
    font-weight: 700;
  }

  @media (max-width: 900px) {
    .exchanges-page :global(.index-toolbar-main .filter-toolbar-row) {
      flex-wrap: wrap;
    }

    .exchanges-page :global(.filter-tools--grouped) {
      max-width: 100%;
      overflow-x: auto;
    }
  }

  @media (max-width: 767.98px) {
    .active-filters {
      padding-inline: 10px;
    }
  }
</style>
