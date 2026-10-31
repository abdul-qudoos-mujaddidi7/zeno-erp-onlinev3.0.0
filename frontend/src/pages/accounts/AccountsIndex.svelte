<script>
  import { onceAsync } from '../../lib/onceAsync.js';
  import { onMount, onDestroy } from 'svelte';
  import { accountApi } from '../../api/accountApi.js';
  import { accountTypeApi } from '../../api/accountTypeApi.js';
  import { accountGroupApi } from '../../api/accountGroupApi.js';
  import DeferredModal from '../../components/DeferredModal.svelte';
  const loadAccountModal = () => import('./AccountModal.svelte');
  import { push } from 'svelte-spa-router';

  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { toast } from '../../ToastUI/toast.js';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';
  import { formatBalance, formatBalanceNumber, isPartyBalanceAccount } from '../../utils/accountBalanceDisplay.js';

  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;
  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

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
  let filtersOpen = false;
  let filterStatus = new Set(['active']);
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'asc';
  let modalRef;

  /* Reference KPI + quick-filter totals. Bootstrap gives every active account
     with its capabilities; the balance map gives each account's net position. */
  let summaryAccounts = [];
  let summaryBalances = {};
  let summaryLoaded = false;
  let summaryRequestId = 0;
  let debtOnly = false;

  export let loading = true;

  function pageFilterKey() {
    return `${currentPage}|${itemsPerPage}|${[...filterType]}|${[...filterGroup]}|${[
      ...filterStatus,
    ]}|${debtOnly}`;
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

  async function loadSummary(force = false) {
    if (summaryLoaded && !force) return;
    const requestId = ++summaryRequestId;
    try {
      const [bootstrapRes, balancesRes] = await Promise.all([
        accountApi.getReportBootstrap({ status: 1 }),
        accountApi.getBalances({ status: 1 }),
      ]);
      if (requestId !== summaryRequestId) return;
      const bootstrap = bootstrapRes?.data || {};
      summaryAccounts = bootstrap.accounts || [];
      summaryBalances = balancesRes?.data || {};
      summaryLoaded = true;
    } catch (error) {
      console.error('Failed to load accounts summary', error);
    }
  }

  function debtorAccountIds() {
    return summaryAccounts
      .filter((account) => isCustomerAccount(account) && afnBalance(account) < -0.5)
      .map((account) => account.id)
      .filter(Boolean);
  }

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

      if (debtOnly) {
        const ids = debtorAccountIds();
        if (!ids.length) {
          accounts = [];
          totalItems = 0;
          totalPages = 0;
          loading = false;
          return;
        }
        query.ids = ids.slice(0, 500).join(',');
      } else {
        if (filterType.size === 1) query.account_type_id = [...filterType][0];
        if (filterGroup.size === 1) query.account_group_id = [...filterGroup][0];
      }
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

      // Balances enrich the visible page independently.
      void accountApi
        .getBalances({ status: 1, account_ids: idsCsv })
        .then((response) => {
          if (requestId !== loadRequestId) return;
          const balances = response?.data || {};
          accounts = accounts.map((account) => ({
            ...account,
            balancesLoaded: true,
            computedBalances: balances[account.id] || {},
          }));
        })
        .catch((error) => console.error('Failed to load account balances', error));
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
    loadSummary();
    loadAccounts();
  });

  onDestroy(() => {
    loadRequestId += 1;
    summaryRequestId += 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  // Reload when PaginationBar page / per-page or filters change
  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void [...filterType].join(',');
    void [...filterGroup].join(',');
    void [...filterStatus].join(',');
    void debtOnly;
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

  function getGroupName(id) {
    return accountGroups.find((group) => String(group.id) === String(id))?.name || '';
  }

  function accountTypeFor(account) {
    return accountTypes.find((type) => Number(type.id) === Number(account?.account_type_id)) || null;
  }

  function isCustomerAccount(account) {
    if (!account) return false;
    const type = accountTypeFor(account);
    return (
      Number(account.can_be_customer) === 1 ||
      Number(type?.can_be_customer) === 1 ||
      Number(account.account_type_id) === 4
    );
  }

  function isSupplierAccount(account) {
    if (!account) return false;
    const type = accountTypeFor(account);
    return (
      Number(account.can_be_supplier) === 1 ||
      Number(type?.can_be_supplier) === 1 ||
      Number(account.account_type_id) === 3
    );
  }

  function preferredTypeId(kind) {
    const matches = accountTypes.filter((type) =>
      kind === 'customer'
        ? Number(type.can_be_customer) === 1
        : Number(type.can_be_supplier) === 1,
    );
    const preferredCode = kind === 'customer' ? 'CUSTOMER' : 'SUPPLIER';
    const preferredId = kind === 'customer' ? 4 : 3;
    const match =
      matches.find((type) => String(type.code || '').toUpperCase() === preferredCode) ||
      matches.find((type) => Number(type.id) === preferredId) ||
      matches[0];
    return match ? String(match.id) : null;
  }

  $: customerTypeId = preferredTypeId('customer');
  $: supplierTypeId = preferredTypeId('supplier');

  function afnBalance(account) {
    return Number(summaryBalances?.[account?.id]?.AFN) || 0;
  }

  $: customerAccounts = summaryAccounts.filter(isCustomerAccount);
  $: supplierAccounts = summaryAccounts.filter(isSupplierAccount);
  $: debtorAccounts = customerAccounts.filter((account) => afnBalance(account) < -0.5);
  $: receivableTotal = customerAccounts.reduce((sum, account) => {
    const balance = afnBalance(account);
    return balance < 0 ? sum - balance : sum;
  }, 0);
  $: payableTotal = supplierAccounts.reduce((sum, account) => {
    const balance = afnBalance(account);
    return balance > 0 ? sum + balance : sum;
  }, 0);

  function formatAmount(value) {
    const number = Number(value) || 0;
    return `${number < 0 ? '−' : ''}${Math.abs(number).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })}`;
  }

  $: kpiCards = (($lang, [
    {
      key: 'receivable',
      label: t('Receivable'),
      icon: 'call_received',
      value: formatAmount(receivableTotal),
      unit: t('AFN'),
      hero: true,
      sub: t('All Customers Balances'),
    },
    {
      key: 'payable',
      label: t('Payable'),
      icon: 'call_made',
      value: formatAmount(payableTotal),
      unit: t('AFN'),
      sub: t('All Supplier Balances'),
    },
    {
      key: 'debtors',
      label: t('Debtors'),
      icon: 'group',
      value: formatAmount(debtorAccounts.length),
      unit: t('Account'),
      sub: t('Customers'),
    },
    {
      key: 'active',
      label: t('Active'),
      icon: 'contacts',
      value: formatAmount(summaryAccounts.length),
      unit: t('Account'),
      sub: t('Accounts'),
    },
  ]));

  $: quickKind = (() => {
    if (debtOnly) return 'debt';
    if (filterStatus.size === 1 && filterStatus.has('archived')) return 'arch';
    if (filterType.size === 1) {
      const selected = String([...filterType][0]);
      if (customerTypeId && selected === String(customerTypeId)) return 'cust';
      if (supplierTypeId && selected === String(supplierTypeId)) return 'sup';
    }
    return 'all';
  })();

  $: quickOptions = [
    { key: 'all', label: t('All'), count: summaryAccounts.length },
    { key: 'cust', label: t('Customers'), count: customerAccounts.length, disabled: !customerTypeId },
    { key: 'sup', label: t('Suppliers'), count: supplierAccounts.length, disabled: !supplierTypeId },
    { key: 'debt', label: t('Debit'), count: debtorAccounts.length },
    { key: 'arch', label: t('Archived'), count: null },
  ];

  /* Choosing from the filter popup applies at once and closes it. */
  function chooseQuickFilter(kind) {
    filtersOpen = false;
    void setQuickFilter(kind);
  }

  async function setQuickFilter(kind) {
    if (kind === 'debt' || kind === 'cust' || kind === 'sup') {
      if (!lookupsLoaded) {
        try {
          await loadLookups();
        } catch (error) {
          console.error('Failed to load account filters', error);
        }
      }
      if (!summaryLoaded) await loadSummary();
    }

    debtOnly = kind === 'debt';
    if (kind === 'arch') {
      filterStatus = new Set(['archived']);
      filterType = new Set();
    } else {
      filterStatus = new Set(['active']);
      if (kind === 'cust' && customerTypeId) filterType = new Set([String(customerTypeId)]);
      else if (kind === 'sup' && supplierTypeId) filterType = new Set([String(supplierTypeId)]);
      else filterType = new Set();
    }
    if (kind === 'debt') filterGroup = new Set();
    currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterType = new Set();
    filterGroup = new Set();
    filterStatus = new Set(['active']);
    debtOnly = false;
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
      if (sortColumn === 'group') {
        valA = getGroupName(a.account_group_id);
        valB = getGroupName(b.account_group_id);
      }

      if (sortColumn === 'balance') {
        valA =
          a.computedBalances && a.computedBalances['AFN'] ? Number(a.computedBalances['AFN']) : 0;
        valB =
          b.computedBalances && b.computedBalances['AFN'] ? Number(b.computedBalances['AFN']) : 0;
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

  /* Reference widths are the cell content widths; a fixed table column also
     carries its 8px side paddings, so type 120 becomes 136 and so on. */
  $: accountTableColumns = [
    'auto',
    '136px',
    ...(enable_account_groups ? ['206px'] : []),
    '120px',
    '166px',
    '64px',
  ];

  $: activeChips = (() => {
    const chips = [];
    if (!['cust', 'sup'].includes(quickKind) && filterType.size) {
      [...filterType].forEach((id) => {
        chips.push({
          key: `type-${id}`,
          kind: 'type',
          value: String(id),
          label: getTypeName(id) || t('Account Types'),
        });
      });
    }
    if (filterGroup.size && enable_account_groups) {
      [...filterGroup].forEach((id) => {
        chips.push({
          key: `group-${id}`,
          kind: 'group',
          value: String(id),
          label: getGroupName(id) || t('Account Groups'),
        });
      });
    }
    if (quickKind === 'debt') {
      chips.push({ key: 'debt', kind: 'debt', label: t('Debit') });
    } else if (quickKind === 'arch') {
      chips.push({ key: 'arch', kind: 'arch', label: t('Archived') });
    } else if (filterStatus.size && !filterStatus.has('active')) {
      chips.push({ key: 'status', kind: 'status', label: t('Status') });
    }
    return chips;
  })();

  function clearChip(chip) {
    if (chip.kind === 'type') {
      const next = new Set(filterType);
      next.delete(chip.value);
      filterType = next;
    } else if (chip.kind === 'group') {
      const next = new Set(filterGroup);
      next.delete(chip.value);
      filterGroup = next;
    } else if (chip.kind === 'debt') {
      debtOnly = false;
    } else {
      void setQuickFilter('all');
      return;
    }
    currentPage = 1;
  }

  function getBalanceLines(account) {
    return formatBalance(account, {
      accountTypes,
      labels: { debit: t('Debit'), credit: t('Credit') },
    });
  }

  function getVisibleBalanceLines(account) {
    return getBalanceLines(account).slice(0, 3);
  }

  function getBalanceTitle(account) {
    const party = isPartyBalanceAccount(account, accountTypes);
    return Object.entries(account?.computedBalances || {})
      .map(([currency, rawBalance]) => {
        const balance = Number(rawBalance) || 0;
        const amount = `${balance < 0 && !party ? '−' : ''}${formatBalanceNumber(balance)}`;
        return `${t(currency)}: ${amount}`;
      })
      .join(' · ');
  }

  function handleAccountToolbarFilter(event) {
    const { key, value } = event.detail;
    debtOnly = false;
    if (key === 'type') filterType = value === 'all' ? new Set() : new Set([String(value)]);
    if (key === 'group') filterGroup = value === 'all' ? new Set() : new Set([String(value)]);
    if (key === 'status') {
      filterStatus =
        value === 'all'
          ? new Set(accountStatuses.map((status) => status.id))
          : new Set([value]);
    }
    currentPage = 1;
  }

  function accountInitial(account) {
    return String(getAccountDisplayName(account) || '?').trim().charAt(0) || '?';
  }

  const persianDate = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function formatAccountDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const parts = persianDate.formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value || '';
    return `${part('year')}/${part('month')}/${part('day')}`;
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
      await loadSummary(true);
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

  function accountActions(account) {
    const system = isSystemAccount(account);
    return [
      {
        icon: 'bi-eye',
        label: t('View'),
        tone: 'view',
        onClick: () => push(`/dashboard/account/${account.id}`),
      },
      {
        icon: 'bi-journal-text',
        label: t('Journals'),
        onClick: () => push(`/dashboard/account/${account.id}?tab=journals`),
      },
      {
        icon: 'bi-pencil',
        label: t('Edit'),
        visible: permissions?.some((p) => p.code === 'Accounts' && p.update),
        disabled: system,
        onClick: () => openModal(account),
      },
      {
        icon: account.account_status === 'active' ? 'bi-archive' : 'bi-box-arrow-in-up',
        label: account.account_status === 'active' ? t('Archived') : t('Active'),
        tone: 'danger',
        disabled: system || loading,
        onClick: () =>
          changeAccountStatus(
            account.id,
            account.account_status === 'active' ? 'archived' : 'active',
          ),
      },
    ];
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
          await loadAccounts();
          await loadSummary(true);
        }
      });
  }

  $: canCreateAccount = permissions?.some((p) => p.code === 'Accounts' && p.create);
  $: hasClearableFilters = Boolean(activeChips.length || searchTerm.trim());
</script>

<div class="accounts-page">
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Accounts')}
    showStats={true}
    showExtra={true}
    showFooter={!loading && totalItems > 0}
    dense={true}
    contentClass="accounts-index-content"
    tablePadding={true}>
    <svelte:fragment slot="extra">
      {#if canCreateAccount}
        <ActionButton icon="person_add" label={t('New')} on:click={() => openModal()} />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <section class="kpi" aria-label={t('Accounts')}>
        {#each kpiCards as card (card.key)}
          <article class="kcard kcard--{card.key}" data-hero={card.hero ? 'true' : undefined}>
            <span class="ktile" aria-hidden="true">
              <span class="ms">{card.icon}</span>
            </span>
            <div class="kbody">
              <span class="klabel">{card.label}</span>
              <span class="krow">
                <span class="kval" dir="ltr">{card.value}</span>
                <span class="kunit">{card.unit}</span>
              </span>
              <span class="ksub">{card.sub}</span>
            </div>
          </article>
        {/each}
      </section>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        bind:filtersOpen
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
        on:reset={resetFilters}>
        <svelte:fragment slot="panelBeforeFields">
          <div class="quick-filters" role="group" aria-label={t('Filter')}>
            {#each quickOptions as option (option.key)}
              <button
                type="button"
                class="quick-filter"
                class:active={quickKind === option.key}
                aria-pressed={quickKind === option.key}
                disabled={option.disabled}
                on:click={() => chooseQuickFilter(option.key)}>
                <span class="quick-filter__label">{option.label}</span>
                {#if option.count != null && summaryLoaded}
                  <span class="quick-filter__count" dir="ltr">{option.count}</span>
                {/if}
              </button>
            {/each}
          </div>
        </svelte:fragment>
      </FilterToolbar>
    </svelte:fragment>

    {#if activeChips.length}
      <div class="active-filters">
        {#each activeChips as chip (chip.key)}
          <button type="button" class="active-chip" on:click={() => clearChip(chip)}>
            {chip.label}
            <i class="bi bi-x" aria-hidden="true"></i>
          </button>
        {/each}
        <button type="button" class="active-filters__clear" on:click={resetFilters}>
          {t('Clear Filters')}
        </button>
      </div>
    {/if}

    {#if loading}
      <TableSkeleton
        ariaLabel={t('Loading...')}
        columns={accountTableColumns}
        minWidth="780px"
        cellPaddingY="5px" />
    {:else if paginatedAccounts.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-search" message={t('No accounts found.')}>
          {#if hasClearableFilters}
            <button type="button" class="empty-clear" on:click={resetFilters}>
              {t('Clear Filters')}
            </button>
          {/if}
        </EmptyState>
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Accounts')}
        minWidth="780px"
        columns={accountTableColumns}
        dense={true}
        striped={true}
        hover={true}
        stickyHeader={true}
        layout="fixed"
        scrollbar="thin"
        cellPaddingY="5px"
        cellPaddingX="8px"
        edgePaddingX="12px">
        <svelte:fragment slot="head">
          {#if showTotalPercentage}
            <tr class="shareholders-banner-row">
              <th colspan={accountTableColumns.length}>
                {t('List')}{t('-of-')}{t('Shareholders')}
              </th>
            </tr>
          {/if}
          <tr>
            <th
              class="col-start"
              aria-sort={sortColumn === 'name'
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'}>
              <button type="button" on:click={() => setSort('name')}>
                {t('Name')}
                {#if sortColumn === 'name'}
                  <span class="ms sort-icon" aria-hidden="true">
                    {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                {:else}
                  <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                {/if}
              </button>
            </th>
            {#if showTotalPercentage}
              <th
                aria-sort={sortColumn === 'percentage'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'}>
                <button type="button" on:click={() => setSort('percentage')}>
                  {t('Percentage')}
                  {#if sortColumn === 'percentage'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
            {:else}
              <th
                class="col-start"
                aria-sort={sortColumn === 'type'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'}>
                <button type="button" on:click={() => setSort('type')}>
                  {t('Type')}
                  {#if sortColumn === 'type'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
            {/if}
            {#if enable_account_groups}
              <th
                class="col-start"
                aria-sort={sortColumn === 'group'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'}>
                <button type="button" on:click={() => setSort('group')}>
                  {t('Group')}
                  {#if sortColumn === 'group'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
            {/if}
            <th
              class="col-start"
              aria-sort={sortColumn === 'created_at'
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'}>
              <button type="button" on:click={() => setSort('created_at')}>
                {t('Date')}
                {#if sortColumn === 'created_at'}
                  <span class="ms sort-icon" aria-hidden="true">
                    {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                {:else}
                  <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                {/if}
              </button>
            </th>
            <th
              class="col-end"
              aria-sort={sortColumn === 'balance'
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'}>
              <button type="button" on:click={() => setSort('balance')}>
                {t('Balance')}
                {#if sortColumn === 'balance'}
                  <span class="ms sort-icon" aria-hidden="true">
                    {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                {:else}
                  <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                {/if}
              </button>
            </th>
            <th class="col-end" style="color: transparent; font-size: 0;">{t('Actions')}</th>
          </tr>
        </svelte:fragment>

        {#each paginatedAccounts as acc, index (acc.id)}
          {@const balanceLines = getVisibleBalanceLines(acc)}
          {@const allBalanceLines = getBalanceLines(acc)}
          <tr class="account-row" on:click={() => push(`/dashboard/account/${acc.id}`)}>
            <td class="col-start">
              <div class="account-info">
                <span
                  class="account-avatar"
                  aria-hidden="true">
                  {accountInitial(acc)}
                </span>
                <span class="account-identity">
                  <span class="account-name">{getAccountDisplayName(acc)}</span>
                  <span class="account-meta" dir="rtl">
                    <bdi dir="ltr">#{(currentPage - 1) * itemsPerPage + index + 1}</bdi>
                    {#if acc.phone || acc.phone2}
                      <span aria-hidden="true">·</span>
                      <bdi dir="ltr">{acc.phone || acc.phone2}</bdi>
                    {/if}
                    {#if acc.account_status !== 'active'}
                      <span aria-hidden="true">·</span>
                      <span>{t('Archived')}</span>
                    {/if}
                  </span>
                </span>
              </div>
            </td>
            {#if showTotalPercentage}
              <td class="percentage-cell">
                {#if acc?.account_type_id == 7}
                  <span dir="ltr" class="percentage-value">
                    {Number(acc?.percentage).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}%
                  </span>
                {/if}
              </td>
            {:else}
              <td class="col-start">
                <span class="account-type-badge">
                  {getTypeName(acc.account_type_id) || '—'}
                </span>
              </td>
            {/if}
            {#if enable_account_groups}
              <td class="account-group-cell">
                <span class="account-group-name" dir="auto">
                  {getGroupName(acc.account_group_id)}
                </span>
              </td>
            {/if}
            <td class="account-date-cell">
              <span class="account-date" dir="ltr" title={acc.created_at || ''}>
                {formatAccountDate(acc.created_at)}
              </span>
            </td>
            <td class="col-end">
              {#if !acc.balancesLoaded}
                <span class="balance-loading" aria-busy="true">…</span>
              {:else if balanceLines.length}
                <div class="balance-list" title={getBalanceTitle(acc)}>
                  {#each balanceLines as line}
                    <span class="balance-line">
                      <span
                        class="balance-amount"
                        class:balance-amount--single={balanceLines.length === 1}
                        style:color={line.color}>
                        {line.amount}
                      </span>
                      <span class="currency-chip">{line.symbol}</span>
                    </span>
                  {/each}
                  {#if allBalanceLines.length > 3}
                    <button
                      type="button"
                      class="balance-more"
                      on:click|stopPropagation={() => push(`/dashboard/account/${acc.id}`)}>
                      +{allBalanceLines.length - 3}
                    </button>
                  {/if}
                </div>
              {:else}
                <span class="balance-settled">{t('Settled')}</span>
              {/if}
            </td>
            <td class="col-end account-actions-cell" on:click|stopPropagation>
              <TableActions
                actions={accountActions(acc)}
                foldAll={true}
                material={true}
                menuTitle={getAccountDisplayName(acc)} />
            </td>
          </tr>
        {/each}

        {#if showTotalPercentage}
          <tr class="total-percentage-row">
            <td colspan={accountTableColumns.length}>
              {t('Total')} {t('Percentage')}:
              <span dir="ltr">{totalPercentage}%</span>
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
</div>

<DeferredModal loader={loadAccountModal} bind:this={modalRef} {accountTypes} on:saved={loadAccounts} />

<style>
  .accounts-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    --danger-text: var(--z-danger, #b91c1c);
    --ok-text: var(--z-ok, #15803d);
    --ink: var(--z-ink, #0b1530);
  }

  /* The reference puts the KPI row on the page surface and the toolbar, table
     and pager inside one 14px sheet. IndexPageLayout's panel is unwrapped here
     so those two groups can live at their reference positions. */
  .accounts-page :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .accounts-page :global(.index-statistics) {
    order: -1;
    flex: 0 0 auto;
    padding: 0;
    margin-bottom: 10px;
    border: 0;
    background: transparent;
  }

  .accounts-page :global(.index-toolbar) {
    order: 0;
    flex: 0 0 auto;
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: var(--z-r-xl, 14px) var(--z-r-xl, 14px) 0 0;
    background: var(--z-surface, #ffffff);
    box-shadow: var(--z-sh-1, 0 1px 2px rgba(11, 21, 48, 0.04));
  }

  .accounts-page :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    --z-row-border: var(--z-border, #e1e7f0);
    --data-table-alt-row-bg: var(--z-surface-2, #f8fafc);
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }

  .accounts-page :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .accounts-page :global(.index-footer .pagination-shell) {
    padding: 10px 16px;
    border: 0;
    background: var(--z-surface-2, #f8fafc);
  }

  /* ---------- dense KPI row (reference `.pl-dense .kpi`) ---------- */
  .kpi {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .kcard {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 10px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .kcard[data-hero='true'] {
    border-color: var(--z-border-strong, #dce6f8);
    background: linear-gradient(135deg, var(--z-brand-soft, #e3ecff) 0%, #ffffff 70%);
  }

  :global(html.dark) .accounts-page .kcard,
  :global([data-mdb-theme='dark']) .accounts-page .kcard {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf7);
    box-shadow: var(--erp-shadow-sm, 0 8px 22px rgba(0, 0, 0, 0.26));
  }

  :global(html.dark) .accounts-page .kcard[data-hero='true'],
  :global([data-mdb-theme='dark']) .accounts-page .kcard[data-hero='true'] {
    border-color: var(--erp-border-strong, #40516a);
    background: linear-gradient(135deg, #1e3a8a 0%, #172033 78%);
  }

  :global(html.dark) .accounts-page .klabel,
  :global([data-mdb-theme='dark']) .accounts-page .klabel {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .accounts-page .kval,
  :global([data-mdb-theme='dark']) .accounts-page .kval {
    color: var(--erp-text, #e5edf7);
  }

  :global(html.dark) .accounts-page .kcard--debtors .kval,
  :global([data-mdb-theme='dark']) .accounts-page .kcard--debtors .kval {
    color: #fbbf24;
  }

  :global(html.dark) .accounts-page .kunit,
  :global([data-mdb-theme='dark']) .accounts-page .kunit {
    color: var(--erp-text-soft, #cbd5e1);
  }

  .ktile {
    display: inline-grid;
    place-items: center;
    flex: 0 0 24px;
    width: 24px;
    height: 24px;
    border-radius: 9px;
    line-height: 1;
  }

  .ktile .ms {
    font-size: 14px;
  }

  .kcard--receivable .ktile {
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
  }

  .kcard--payable .ktile {
    background: var(--z-credit-soft, #e7f6ec);
    color: var(--z-credit, #16a34a);
  }

  .kcard--debtors .ktile {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .kcard--active .ktile {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .kbody {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .klabel {
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .krow {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }

  .kval {
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kcard--debtors .kval {
    color: var(--z-warn, #92400e);
  }

  .kunit {
    flex-shrink: 0;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
  }

  .ksub {
    display: none;
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---------- toolbar ---------- */
  .accounts-page :global(.index-toolbar-main) {
    gap: 8px;
  }

  .accounts-page :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
  }

  /*
   * Quick account filters read as a two-column grid of choice rows at the top
   * of the filter popup, each carrying its count.
   */
  .quick-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .quick-filter {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    height: 28px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-muted, #64748b);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      color 0.14s ease,
      background 0.14s ease,
      border-color 0.14s ease;
  }

  .quick-filter:hover:not(:disabled) {
    border-color: var(--z-border, #e1e7f0);
    color: var(--z-ink, #0b1530);
  }

  .quick-filter.active {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    box-shadow: none;
  }

  .quick-filter:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .quick-filter__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quick-filter__count {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .quick-filter.active .quick-filter__count {
    color: var(--z-link, #2f6fed);
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
    padding: 0 6px 0 10px;
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

  .active-chip i {
    font-size: 12px;
    line-height: 1;
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

  /* ---------- table ---------- */
  .accounts-page :global(.accounts-index-content .data-table-wrap) {
    border: 0;
  }

  .accounts-page :global(.accounts-index-content .sort-icon--idle) {
    opacity: 0.45;
  }

  .accounts-page :global(.accounts-index-content .sort-icon) {
    display: inline-block;
    width: 14px;
    height: 14px;
    font-size: 14px;
    line-height: 14px;
    flex: 0 0 14px;
  }

  .accounts-page :global(.accounts-index-content .data-table) {
    --data-table-alt-row-bg: var(--z-surface-2, #f8fafc);
  }

  .accounts-page :global(.accounts-index-content .data-table tbody tr.account-row) {
    height: auto;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .account-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .account-avatar {
    display: inline-flex;
    flex: 0 0 26px;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .account-identity {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }

  .account-name {
    display: block;
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
    text-align: start;
  }

  .account-row:hover .account-name {
    color: var(--z-link, #2f6fed);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .account-meta {
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-type-badge {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    height: 22px;
    padding: 0 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--z-surface-3, #f1f5f9);
    color: #475569;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.55;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-group-name {
    display: block;
    overflow: hidden;
    color: var(--z-text, #475569);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.55;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-date {
    color: var(--z-text, #475569);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .percentage-value {
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .balance-list {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    max-width: 100%;
  }

  .balance-line {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    min-width: 0;
  }

  .balance-amount {
    display: inline-block;
    min-width: 66px;
    color: var(--z-ink, #0b1530);
    direction: ltr;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: left;
    white-space: nowrap;
  }

  .balance-amount--single {
    font-size: 12.5px;
  }

  .currency-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 22px;
    height: 16px;
    padding: 0 3px;
    border-radius: 4px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    direction: ltr;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 9.5px;
    font-weight: 800;
    white-space: nowrap;
  }

  .balance-more {
    height: 16px;
    padding: 0 4px;
    border: 0;
    border-radius: 4px;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .balance-settled {
    color: var(--z-subtle, #94a3b8);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .balance-loading {
    color: var(--z-subtle, #94a3b8);
    font-size: 12px;
  }

  .account-actions-cell {
    width: 44px;
  }

  :global(.accounts-index-content .table-actions) {
    justify-content: flex-end;
  }

  .shareholders-banner-row th {
    padding: 0.75rem;
    border-bottom: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-size: 0.92rem;
    font-weight: 800;
    text-align: center;
  }

  .total-percentage-row td {
    padding: 1rem !important;
    color: var(--z-ink, #0b1530);
    font-weight: 800;
    text-align: center !important;
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

  @media (max-width: 1100px) {
    .kpi {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .accounts-page :global(.filter-tools--grouped) {
      max-width: 100%;
      overflow-x: auto;
    }
  }

  @media (max-width: 767.98px) {
    .accounts-page :global(.index-toolbar) {
      border-radius: 14px 14px 0 0;
    }

    .active-filters {
      padding-inline: 10px;
    }

    .quick-filters {
      flex: 0 0 auto;
    }

    .balance-list {
      align-items: flex-start;
    }

    .balance-line {
      justify-content: flex-start;
    }
  }
</style>
