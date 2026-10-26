<script>
  import { onceAsync } from '../../lib/onceAsync.js';
  import { onMount, onDestroy } from 'svelte';
  import { accountImageApi } from '../../api/accountImageApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { accountTypeApi } from '../../api/accountTypeApi.js';
  import { accountGroupApi } from '../../api/accountGroupApi.js';
  import DeferredModal from '../../components/DeferredModal.svelte';
  const loadAccountModal = () => import('./AccountModal.svelte');
  import { push } from 'svelte-spa-router';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { toast } from '../../ToastUI/toast.js';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;
  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  import { isSystemAccount } from '../../lib/systemAccounts.js';

  let accounts = [];
  let accountTypes = [];
  let accountGroups = [];
  let accountStatuses = [
    { id: 'active', name: 'Active' },
    { id: 'archived', name: 'Archived' },
  ];
  let totalItems = 0;
  let totalPages = 0;
  let lookupsLoaded = false;
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let bootstrapped = false;
  let lastPageFilterKey = '';

  let filterType = new Set();
  let filterGroup = new Set();
  let searchTerm = '';
  let filterStatus = new Set(['active']);
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'asc';
  let modalRef;

  export let loading = true;

  function pageFilterKey() {
    return `${currentPage}|${itemsPerPage}|${[...filterType]}|${[...filterGroup]}|${[...filterStatus]}`;
  }

  const loadLookups = onceAsync(async () => {
    if (lookupsLoaded) return;
    const [typesRes, groupsRes] = await Promise.all([
      accountTypeApi.getAll({ status: 1 }),
      accountGroupApi.getAll({ status: 1 }),
    ]);
    accountTypes = typesRes?.data || [];
    accountGroups = groupsRes?.data || [];
    lookupsLoaded = true;
  });

  async function loadAccounts() {
    const requestId = ++loadRequestId;
    lastPageFilterKey = pageFilterKey();
    loading = true;
    try {
      void loadLookups().catch((error) => console.error('Failed to load account filters', error));

      const query = {
        status: 1,
        exclude_system: 1,
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm.trim(),
      };

      if (filterType.size === 1) query.account_type_id = [...filterType][0];
      if (filterGroup.size === 1) query.account_group_id = [...filterGroup][0];
      if (filterStatus.size === 1) query.account_status = [...filterStatus][0];

      const response = await accountApi.getAll(query);
      if (requestId !== loadRequestId) return;

      const rows = response?.data || [];
      const meta = readListMeta(response, rows.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

      const ids = rows.map((a) => a.id).filter(Boolean);
      const idsCsv = ids.join(',');

      accounts = rows.map((account) => ({ ...account, balancesLoaded: false }));
      loading = false;
      if (!ids.length) return;

      // Balances and images enrich the visible page independently.
      void accountApi.getBalances({ status: 1, account_ids: idsCsv }).then((response) => {
        if (requestId !== loadRequestId) return;
        const balances = response?.data || {};
        accounts = accounts.map((account) => ({
          ...account,
          balancesLoaded: true,
          computedBalances: balances[account.id] || {},
        }));
      }).catch((error) => console.error('Failed to load account balances', error));
      void accountImageApi.getAll({ status: 1, account_ids: idsCsv }).then((response) => {
        if (requestId !== loadRequestId) return;
        const images = new Map((response?.data || []).map((img) => [Number(img.account_id), img]));
        accounts = accounts.map((account) => ({
          ...account,
          imageUrl: resolveMediaUrl(images.get(Number(account.id))?.image, null),
        }));
      }).catch((error) => console.error('Failed to load account images', error));
    } catch (err) {
      console.error('Failed to load accounts', err);
      if (requestId === loadRequestId) {
        accounts = [];
        totalItems = 0;
        totalPages = 0;
      }
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else loadAccounts();
    }, 300);
  }

  onMount(() => {
    lastPageFilterKey = pageFilterKey();
    bootstrapped = true;
    loadAccounts();
  });

  onDestroy(() => {
    loadRequestId += 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  // Reload when PaginationBar page / per-page or filters change
  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void [...filterType].join(',');
    void [...filterGroup].join(',');
    void [...filterStatus].join(',');
    const key = pageFilterKey();
    if (key !== lastPageFilterKey) {
      lastPageFilterKey = key;
      loadAccounts();
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

  function getTypeName(id) {
    const tObj = accountTypes.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return tObj.name || '';
    if (t('Lang') === 'fa') return tObj.name_fa || tObj.name || '';
    if (t('Lang') === 'ps') return tObj.name_ps || tObj.name || '';
    return tObj.name || '';
  }

  function getAccountDisplayName(acc) {
    if (!acc) return '';
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  function resetFilters() {
    searchTerm = '';
    filterType = new Set();
    filterGroup = new Set();
    filterStatus = new Set(['active']);
    currentPage = 1;
    loadAccounts();
  }

  function handlePerPageChange(e) {
    itemsPerPage = Number(e.detail);
    currentPage = 1;
  }

  // Sort current server page only (search/filters are server-side)
  $: paginatedAccounts = (() => {
    let result = accounts.slice();

    result = result.sort((a, b) => {
      const aSystem = isSystemAccount(a) ? 0 : 1;
      const bSystem = isSystemAccount(b) ? 0 : 1;
      if (aSystem !== bSystem) return aSystem - bSystem;

      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'percentage') {
        valA = Number(a[sortColumn]);
        valB = Number(b[sortColumn]);
      }

      if (sortColumn === 'name') {
        valA = getAccountDisplayName(a);
        valB = getAccountDisplayName(b);
      }
      if (sortColumn === 'type') {
        valA = getTypeName(a.account_type_id);
        valB = getTypeName(b.account_type_id);
      }

      if (sortColumn === 'balance') {
        if (a.computedBalances && a.computedBalances['AFN']) {
          valA = Number(a.computedBalances['AFN']);
        } else {
          valA = 0;
        }

        if (b.computedBalances && b.computedBalances['AFN']) {
          valB = Number(b.computedBalances['AFN']);
        } else {
          valB = 0;
        }
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

  $: totalPercentage = paginatedAccounts
    .reduce((sum, a) => (a.account_type_id == 7 ? sum + (+a.percentage || 0) : sum), 0)
    .toFixed(3);

  $: showTotalPercentage = filterType.size == 1 && filterType.has('7');

  function setSort(column) {
    if (sortColumn === column) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  $: accountsCountLabel = `${totalItems} ${totalItems < 2 ? t('Account') : t('Accounts')}`;
  $: activeAccountsCount = paginatedAccounts.filter((a) => a.account_status === 'active').length;
  $: accountToolbarFilters = [
    {
      key: 'type',
      label: t('Account Types'),
      value: filterType.size === 1 ? [...filterType][0] : 'all',
      icon: 'bi-diagram-3',
      options: [
        { value: 'all', label: t('All') },
        ...accountTypes.map((type) => ({ value: String(type.id), label: getTypeName(type.id) })),
      ],
    },
    {
      key: 'group',
      label: t('Account Groups'),
      value: filterGroup.size === 1 ? [...filterGroup][0] : 'all',
      icon: 'bi-collection',
      visible: enable_account_groups,
      options: [
        { value: 'all', label: t('All') },
        ...accountGroups.map((group) => ({ value: String(group.id), label: group.name })),
      ],
    },
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus.size === 1 ? [...filterStatus][0] : 'all',
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All') },
        ...accountStatuses.map((status) => ({ value: status.id, label: t(status.name) })),
      ],
    },
  ];

  function handleAccountToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterType = value === 'all' ? new Set() : new Set([String(value)]);
    if (key === 'group') filterGroup = value === 'all' ? new Set() : new Set([String(value)]);
    if (key === 'status') {
      filterStatus = value === 'all' ? new Set(accountStatuses.map((status) => status.id)) : new Set([value]);
    }
    currentPage = 1;
  }

  async function deleteAccount(id) {
    const acc = accounts.find((a) => Number(a.id) === Number(id));
    if (isSystemAccount(acc)) {
      toast.error(t('Error'), t('System accounts cannot be deleted.'));
      return;
    }

    if (confirm('Delete this account?')) {
      await accountApi.remove(id);
      await loadAccounts();
    }
  }

  async function openModal(account = null) {
    try {
      await loadLookups();
      await modalRef.openModal(account);
    } catch (error) {
      console.error('Failed to open account form', error);
      toast.error(t('Error'));
    }
  }

  function showInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    return parts[0].charAt(0).toUpperCase();
  }

  async function changeAccountStatus(id, newStatus) {
    const acc = accounts.find((a) => a.id === id);
    if (isSystemAccount(acc)) {
      toast.error(t('Error'), t('System accounts cannot be edited.'));
      return;
    }

    if (newStatus === 'archived') {
      // Never interpret a pending/failed balance request as a zero balance.
      let balances = acc?.computedBalances;
      if (!acc?.balancesLoaded) {
        try {
          const response = await accountApi.getBalances({ status: 1, account_ids: String(id) });
          balances = response?.data?.[id] || {};
        } catch (error) {
          console.error('Failed to verify account balance', error);
          toast.error(t('Error'));
          return;
        }
      }
      let keys = Object.keys(balances || {});
      for (let i = 0; i < keys.length; i++) {
        if (Number(balances[keys[i]]) !== 0) {
          toast.error(t('Cannot archive account with non-zero balance!'));
          return;
        }
      }
    }

    toast
      .confirm(t('Are you sure?'), t('Are you sure you want to change the status of this account!'))
      .then(async (result) => {
        if (result) {
          await accountApi.update(id, { account_status: newStatus });
          loadAccounts();
        }
      });
  }

</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Accounts')}
  toolbarWidth="25rem"
  showFooter={!loading && totalItems > 0}
  dense={true}
  contentClass="accounts-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    {#if permissions?.some((p) => p.code === 'Accounts' && p.create)}
      <ActionButton icon="bi-plus-lg" label={t('Add Account')} on:click={() => openModal()} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search accounts...')}
      filters={accountToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        scheduleSearchReload();
      }}
      on:filterChange={handleAccountToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

    {#if loading}
          <div class="index-table-state">
          <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if paginatedAccounts.length === 0}
          <div class="index-table-state">
          <EmptyState icon="bi-inbox" message={t('No accounts found.')} />
          </div>
    {:else}
          <DataTable
            ariaLabel={t('Accounts')}
            minWidth="760px"
            dense={true}
            striped={true}
            hover={false}
            stickyHeader={true}
            layout="fixed"
            scrollbar="thin">
            <svelte:fragment slot="head">
          {#if showTotalPercentage}
                <tr class="shareholders-banner-row">
                  <th colspan="12">{t('List')}{t('-of-')}{t('Shareholders')}</th>
              </tr>
          {/if}
            <tr>
                <th class="col-start cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </th>
                <th class="col-start cursor-pointer" on:click={() => setSort('name')}>
                {t('Name')}
                {#if sortColumn === 'name'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </th>
              {#if showTotalPercentage}
                <th class="col-end cursor-pointer" on:click={() => setSort('percentage')}>
                  {t('Percentage')}
                  {#if sortColumn === 'percentage'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                  {/if}
                </th>
              {:else}
                  <th class="cursor-pointer" on:click={() => setSort('type')}>
                  {t('Type')}
                  {#if sortColumn === 'type'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                  {/if}
                </th>
              {/if}
              {#if enable_account_groups}
                  <th class="cursor-pointer" on:click={() => setSort('group')}>{t('Group')}</th>
                  {/if}
                <th class="col-end cursor-pointer" on:click={() => setSort('balance')}>{t('Balance')}</th>
              {#if filterStatus.size > 1 || filterStatus.has('archived')}
                  <th class="cursor-pointer" on:click={() => setSort('account_status')}>{t('Status')}</th>
              {/if}
            </tr>
            </svelte:fragment>

            {#each paginatedAccounts as acc, index (acc.id)}
              <tr class="account-row" on:click={() => push(`/dashboard/account/${acc.id}`)}>
                <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td class="col-start">
                  <div class="account-info">
                  {#if acc.imageUrl}
                      <img class="account-avatar" src={acc.imageUrl || '/img/no-image.png'} alt="" />
                  {:else}
                    <div class="account-avatar account-avatar-fallback">
                        {showInitials(getAccountDisplayName(acc))}
                    </div>
                  {/if}
                    <span class="account-name">{getAccountDisplayName(acc)}</span>
                  </div>
                </td>
                {#if showTotalPercentage}
                  <td class="col-end">
                    {#if acc?.account_type_id == 7}
                      <span dir="ltr" class="percentage-value">
                        {Number(acc?.percentage).toLocaleString(undefined, { maximumFractionDigits: 3 })}%
                      </span>
                    {/if}
                  </td>
                {:else}
                  <td>
                    <StatusBadge tone="neutral" ghost>{getTypeName(acc.account_type_id) || '—'}</StatusBadge>
                  </td>
                {/if}
                {#if enable_account_groups}
                  <td>
                    <StatusBadge tone="neutral" ghost>
                      {accountGroups.find((ac) => ac.id == acc.account_group_id)?.name || '—'}
                    </StatusBadge>
                  </td>
                {/if}
                <td class="col-end">
                  {#if !acc.balancesLoaded}
                    <span aria-busy="true">...</span>
                  {:else if acc.computedBalances}
                    <div class="balance-list">
                    {#each Object.keys(acc.computedBalances) as cur}
                        <StatusBadge
                          tone={acc.computedBalances[cur] > 0
                            ? 'positive'
                          : acc.computedBalances[cur] < 0
                              ? 'negative'
                              : 'neutral'}>
                          <span dir="ltr">
                            {Number(acc.computedBalances[cur]).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          </span>
                          <span>{t(cur)}</span>
                        </StatusBadge>
                    {/each}
                    </div>
                  {/if}
                </td>
                {#if filterStatus.size > 1 || filterStatus.has('archived')}
                  <td>
                    <div class="status-cell" on:click|stopPropagation>
                      <StatusBadge tone={acc.account_status === 'active' ? 'positive' : 'negative'}>
                        {t(acc.account_status)}
                      </StatusBadge>
                    <button
                        type="button"
                        class="archive-btn"
                        disabled={isSystemAccount(acc)}
                        title={isSystemAccount(acc)
                          ? t('System accounts cannot be edited.')
                          : acc.account_status === 'active' ? t('Archived') : t('Active')}
                      on:click={() =>
                        !isSystemAccount(acc) &&
                        changeAccountStatus(acc.id, acc.account_status === 'active' ? 'archived' : 'active')}>
                      <i class="bi bi-{acc.account_status === 'active' ? 'archive' : 'box-arrow-in-up'}"></i>
                    </button>
                    </div>
                  </td>
                {/if}
              </tr>
            {/each}

            {#if showTotalPercentage}
              <tr class="total-percentage-row">
                <td colspan="12">
                  {t('Total')} {t('Percentage')}: <span dir="ltr">{totalPercentage}%</span>
                </td>
              </tr>
            {/if}
          </DataTable>
    {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      {totalItems}
      ariaLabel={t('Accounts pagination')}
      rowLabel={t('rows')}
      on:perPageChange={handlePerPageChange}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>
<DeferredModal loader={loadAccountModal} bind:this={modalRef} {accountTypes} on:saved={loadAccounts} />

<style>
  .cursor-pointer {
    cursor: pointer;
  }

  .accounts-page {
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

  .accounts-page :global(.page-header) {
    padding: var(--card-padding, 0.85rem) clamp(0.85rem, 1.1vw, 1.1rem);
    border: 1px solid #e2e8f0;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
  }

  .accounts-page :global(.header-icon) {
    width: clamp(2.1rem, 2.5vw, 2.5rem);
    height: clamp(2.1rem, 2.5vw, 2.5rem);
    border-radius: 12px;
    background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
    color: #0f6efd;
    font-size: 1rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .accounts-page :global(.page-header h1) {
    font-size: var(--app-heading-sm, 1.1rem);
    font-weight: 850;
    letter-spacing: -0.02em;
  }

  .accounts-page :global(.page-header p) {
    margin-top: 0.2rem;
    color: #64748b;
    font-size: var(--app-font-sm, 0.84rem);
  }

  .accounts-page :global(.header-actions .action-btn.primary) {
    min-height: var(--control-height, 2.35rem);
    padding: 0.45rem 0.95rem;
    border-radius: var(--control-radius, 0.625rem);
    background: linear-gradient(180deg, #3b82f6 0%, #0f6efd 100%);
    border-color: #0f6efd;
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.24);
    font-size: var(--control-font, 0.84rem);
    font-weight: 800;
  }

  .filters-wrap {
    position: relative;
    z-index: 1;
    overflow: visible;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  }

  .filters-wrap.filters-open {
    z-index: 100;
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

  .accounts-table-card {
    position: relative;
    z-index: 0;
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

  .accounts-page :global(.shareholders-banner-row th) {
    padding: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 0.92rem;
    font-weight: 800;
    text-align: center;
  }

  .account-row {
    cursor: pointer;
  }

  .cell-muted {
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .account-info {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    text-align: start;
  }

  .account-avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }

  .account-avatar-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    background: #edf2f8;
    color: #8b9bb0;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .account-name {
    overflow: hidden;
    color: #0f172a;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .percentage-value {
    font-weight: 800;
  }

  .balance-list {
    display: inline-flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .status-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }

  .archive-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    color: #64748b;
    background: #ffffff;
    cursor: pointer;
  }

  .archive-btn:hover {
    color: #0f6efd;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .archive-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .total-percentage-row td {
    padding: 1rem !important;
    color: #0f172a;
    font-weight: 800;
    text-align: center !important;
  }

  .accounts-page :global(.pagination-shell) {
    padding: 0.65rem 0.85rem;
    border-top: 1px solid #eef2f7;
    background: #F8FAFC;
  }

</style>
