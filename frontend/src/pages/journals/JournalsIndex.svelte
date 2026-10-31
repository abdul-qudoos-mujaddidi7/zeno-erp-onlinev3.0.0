<script>
  import { onMount, tick } from 'svelte';
  import { push, querystring } from 'svelte-spa-router';
  import { auth } from '../../auth/authStore';
  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import JournalReceiptModal from './JournalReceiptModal.svelte';
  import JournalA4ReceiptModal from './JournalA4ReceiptModal.svelte';
  import AddJournal from './AddJournal.svelte';
  import QuickEntryModal from '../../components/common/QuickEntryModal.svelte';
  import EditJournalModal from './EditJournalModal.svelte';
  import ViewJournalModal from './ViewJournalModal.svelte';
  import { currencyApi } from '../../api/currencyApi.js';
  import { journalApi } from '../../api/journalApi.js';
  import { fiscalYearApi } from '../../api/fiscalYearApi.js';
  import {
    applyCurrentFiscalYearRange,
    fiscalYearRangeOf,
  } from '../../utils/currentFiscalYear.js';
  import { accountApi } from '../../api/accountApi.js';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, readListMeta } from '../../lib/pagination.js';
  import { localizeDescription } from '../../utils/localizedDescription.js';

  let showReceipt = false;
  let showA4Receipt = false;
  let selectedJournal = null;
  let viewedJournal = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_a4_default_print_mode = $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;

  export let account_id = null;

  let accounts = [];
  let currencies = [];
  let journals = [];

  /* Per-currency debit/credit totals for the filtered range (server summary). */
  let summary = null;
  /* Vouchers that were cancelled (soft-deleted); the sheet's fourth KPI tile. */
  let cancelledCount = null;

  let loading = true;
  let TREASURY_ID = null;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let summaryRequestId = 0;
  let summaryFilterKey = '';
  let summaryLoadingKey = '';
  let summaryLoadedKey = '';

  let modalRef;

  let currency = '';

  /*
   * Fiscal-year scoping.
   *
   * The journal list works inside ONE fiscal year at a time: it opens on the
   * working fiscal year's range (so a closed year's journals leave the normal
   * view the moment the year is closed) and the toolbar's fiscal-year selector
   * switches to any other year — including a closed one, whose history stays
   * fully readable — or back to "All" for the unscoped lifetime view.
   *
   * Backward compatibility: an organization with no fiscal years configured
   * keeps exactly the previous behaviour (no date filter at all).
   */
  let fiscalYears = [];
  let filterFiscalYear = 'all';
  let workingFiscalYear = null;
  let startDate = '';
  let endDate = '';

  async function loadAccounts() {
    if (account_id) {
      const [accountResponse, treasuryResponse] = await Promise.all([
        accountApi.getById(account_id),
        accountApi.getAll({ status: 1, code: 'TREASURY' }),
      ]);
      accounts = accountResponse?.data ? [accountResponse.data] : [];
      TREASURY_ID = treasuryResponse?.data?.[0]?.id || null;
      return;
    }

    const [accountsResponse, treasuryResponse] = await Promise.all([
      accountApi.getAll({ status: 1 }),
      accountApi.getAll({ status: 1, code: 'TREASURY' }),
    ]);

    accounts = (accountsResponse?.data || []).filter((a) =>
      a.account_status ? a.account_status == 'active' : a.status == 1,
    );

    TREASURY_ID = treasuryResponse?.data?.[0]?.id || null;
  }

  async function ensurePeerAccounts(journalRows) {
    const needed = new Set();
    for (const j of journalRows || []) {
      if (j.first_entry_account) needed.add(Number(j.first_entry_account));
      if (j.second_entry_account) needed.add(Number(j.second_entry_account));
    }
    const have = new Set(accounts.map((a) => Number(a.id)));
    const missing = [...needed].filter((id) => !have.has(id));
    if (!missing.length) return;

    if (missing.length > 40) {
      const accountsResponse = await accountApi.getAll({ status: 1 });
      accounts = accountsResponse?.data || accounts;
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

  async function loadFiscalYears() {
    try {
      const response = await fiscalYearApi.getAll();

      fiscalYears = response?.data || [];
    } catch (error) {
      fiscalYears = [];

      if (import.meta.env?.DEV) {
        console.warn('Fiscal year lookup failed:', error?.message);
      }
    }
  }

  /*
   * How long the sheet will wait for one list read before treating it as
   * failed. A stalled request used to hold the spinner open forever, so the
   * page looked empty until it was reloaded by hand — several times, until one
   * attempt happened to get through.
   */
  const LIST_TIMEOUT_MS = 15000;

  function readJournals(params) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('slow')), LIST_TIMEOUT_MS);

      journalApi.getAll(params).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  async function loadJournals({ refreshSummary = false } = {}) {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;

    const params = {
      status: 1,
      search: searchTerm.trim(),
      date_from: startDate || undefined,
      date_to: endDate || undefined,
      /*
       * When viewing a specific account, do NOT exclude system
       * PAYABLE/RECEIVABLE counterparts — customer/supplier journals
       * almost always touch those accounts.
       */
      exclude_system_accounts: account_id ? 0 : 1,
      /*
       * Collapse a payment's two vouchers into one row (see
       * `accountScopedView()`).
       */
      exclude_report_accounts: accountScopedView() ? 0 : 1,
      /*
       * And drop the invoice rows that only move a control account, so a sale
       * or a purchase shows up as the one payment row it produced.
       */
      exclude_control_accounts: accountScopedView() ? 0 : 1,
      skip_count: 1,
      account_id:
        account_id ||
        (filterAccount !== 'all' ? Number(filterAccount) : undefined),
      reference_type: reference_type || undefined,
      currency: filterCurrency !== 'all' ? filterCurrency : undefined,
      page: currentPage,
      limit: itemsPerPage,
    };
    const summaryParams = Object.fromEntries(
      Object.entries(params).filter(
        ([key]) => !['page', 'limit', 'skip_count'].includes(key),
      ),
    );
    const summaryKey = JSON.stringify(summaryParams);
    if (refreshSummary) {
      summaryLoadedKey = '';
      summaryLoadingKey = '';
      summaryRequestId += 1;
    }
    if (summaryKey !== summaryFilterKey) {
      summaryFilterKey = summaryKey;
      summaryLoadingKey = '';
      summaryLoadedKey = '';
      summary = null;
      summaryRequestId += 1;
    }

    try {
      let journalResponse;

      try {
        journalResponse = await readJournals(params);
      } catch (error) {
        /*
         * One quiet retry: a single dropped or slow request should not send
         * the user to the reload button.
         */
        journalResponse = await readJournals(params);
      }

      if (requestId !== loadRequestId) return;

      journals = journalResponse?.data || [];
      /*
       * Counterparty names are decoration. A failed lookup leaves the row with
       * its own ids; it must never keep the whole sheet in its spinner.
       */
      void ensurePeerAccounts(journals).catch((error) =>
        console.error('Failed to load journal account names', error),
      );

      if (summaryLoadedKey !== summaryKey && summaryLoadingKey !== summaryKey) {
        void loadJournalSummary(summaryParams, summaryKey);
      }
      void loadCancelledCount(requestId);

      const meta = readListMeta(journalResponse, journals.length);
      const hasMore = Boolean(journalResponse?.meta?.hasMore);

      totalItems = hasMore
        ? Math.max(meta.total, currentPage * itemsPerPage + 1)
        : Math.max(meta.total, (currentPage - 1) * itemsPerPage + journals.length);
      totalPages = hasMore
        ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
        : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);

      journals.forEach((j) => {
        if (!reference_types.includes(j.reference_type)) {
          reference_types = [...reference_types, j.reference_type];
        }
      });
    } catch (error) {
      if (requestId !== loadRequestId) return;

      journals = [];
      totalItems = 0;
      totalPages = 0;
      console.error('Journal list failed to load', error);
    } finally {
      /*
       * Whatever happened above, the sheet stops waiting: the rows it managed
       * to read are shown, and a read that never arrived shows the empty state
       * instead of an endless spinner.
       */
      if (requestId === loadRequestId) loading = false;
    }
  }

  /*
   * A bill payment is one document but two vouchers: `customer ↔ treasury`
   * plus the internal `SALES ↔ RECEIVABLE` settlement. Only the first one is
   * the document the user recognizes, so the day book leaves the settlement
   * out and lists one row per payment. An account-scoped view is a ledger —
   * both legs are that account's real movements there — so nothing is
   * collapsed.
   */
  function accountScopedView() {
    return Boolean(account_id) || filterAccount !== 'all';
  }

  async function loadJournalSummary(params, summaryKey) {
    const requestId = ++summaryRequestId;
    summaryLoadingKey = summaryKey;

    try {
      const response = await journalApi.getAll({
        ...params,
        include_summary: 1,
        summary_only: 1,
      });

      if (requestId !== summaryRequestId || summaryKey !== summaryFilterKey) return;
      summary = response?.summary || null;
      summaryLoadedKey = summaryKey;
      summaryLoadingKey = '';
    } catch (error) {
      if (requestId !== summaryRequestId || summaryKey !== summaryFilterKey) return;

      summaryLoadingKey = '';
      summary = null;
      console.error('Could not load journal summary', error);
    }
  }

  async function loadCancelledCount(requestId) {
    try {
      const response = await journalApi.getAll({
        status: 0,
        search: searchTerm.trim(),
        date_from: startDate || undefined,
        date_to: endDate || undefined,
        exclude_system_accounts: account_id ? 0 : 1,
        exclude_report_accounts: accountScopedView() ? 0 : 1,
        exclude_control_accounts: accountScopedView() ? 0 : 1,
        account_id:
          account_id ||
          (filterAccount !== 'all' ? Number(filterAccount) : undefined),
        reference_type: reference_type || undefined,
        currency: filterCurrency !== 'all' ? filterCurrency : undefined,
        page: 1,
        limit: 1,
      });

      if (requestId !== loadRequestId) return;

      cancelledCount = readListMeta(response, 0).total;
    } catch (error) {
      if (requestId !== loadRequestId) return;

      cancelledCount = null;
      console.error('Could not count cancelled journals', error);
    }
  }

  onMount(async () => {
    const journalParams = new URLSearchParams($querystring || '');
    if (journalParams.get('addJournal') === '1') {
      addJournalSide = journalParams.get('side') === 'cr' ? 'cr' : 'dr';
      addJournalAccountCode = journalParams.get('accountCode') || '';
      addJournalIcon = addJournalSide === 'cr' ? 'ms:south_east' : 'ms:north_west';
      showAddJournal = true;
      push('/dashboard/journals/list');
    }

    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;

    // These reads decorate controls and row labels; they must not delay rows.
    void loadAccounts().catch((error) => console.error('Failed to load journal accounts', error));
    void loadCurrencies().catch((error) => console.error('Failed to load journal currencies', error));
    void loadFiscalYears();

    // The fiscal range is the only lookup required to scope the first list read.
    const fiscalYearScope = await applyCurrentFiscalYearRange(({ from, to }) => {
      startDate = from;
      endDate = to;
    }).catch((error) => {
      console.error('Failed to determine the working fiscal year', error);
      return null;
    });

    workingFiscalYear = fiscalYearScope;

    if (workingFiscalYear?.id) {
      filterFiscalYear = workingFiscalYear.id;
    }

    await loadJournals();
  });
  // --- Table State (mirrors ProductsIndex design) ---
  let searchTerm = '';
  let filterAccount = 'all';
  let filterCurrency = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let reference_type = null;
  let reference_types = [null];

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    const key = `${currentPage}|${itemsPerPage}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      loadJournals();
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else loadJournals();
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
  // Search, account and reference-type filters are applied server-side so
  // the paginated count matches what the table renders. The client only
  // sorts the current page here.
  $: filteredJournals = (() => {
    let result = journals.slice();

    // Status
    if (filterStatus === 'active') {
      result = result.filter((j) => j.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((j) => j.status === 0);
    }

    // Sort
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

  $: paginatedJournals = filteredJournals;

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  async function deleteJournal(id) {
    // The backend soft-deletes the journal and records the
    // activity log entry atomically.
    await journalApi.remove(id);
    await loadJournals({ refreshSummary: true });
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  /*
   * The two control accounts the sales/purchase postings move internally. They
   * are not switched on in the day book yet, so the list shows the party the
   * entry is really about and leaves these two out. The postings themselves are
   * untouched — the balances keep moving exactly as before.
   */
  const HIDDEN_ACCOUNT_CODES = ['RECEIVABLE', 'PAYABLE'];

  function isHiddenAccount(id) {
    if (id == null) return false;
    /* Opening the account's own ledger is the one place it must stay visible. */
    if (account_id) return false;
    const acc = accounts.find((a) => String(a.id) === String(id));
    return HIDDEN_ACCOUNT_CODES.includes(String(acc?.code || '').toUpperCase());
  }

  function getJournalReferenceRoute(journal) {
    if (!journal?.reference_type || journal.reference_id == null) return null;

    if (journal.reference_type === 'account') {
      return `/dashboard/account/${journal.reference_id}`;
    }
    if (journal.reference_type === 'stock_transfer') {
      return `/dashboard/stock-transfers/${journal.reference_id}`;
    }
    if (journal.reference_type === 'sale') {
      return `/dashboard/sales/${journal.reference_id}`;
    }
    if (journal.reference_type === 'sale_payment') {
      return journal.reference_sale_id != null
        ? `/dashboard/sales/${journal.reference_sale_id}`
        : null;
    }
    if (journal.reference_type === 'purchase') {
      return `/dashboard/purchases/${journal.reference_id}`;
    }
    if (journal.reference_type === 'purchase_payment') {
      return journal.reference_purchase_id != null
        ? `/dashboard/purchases/${journal.reference_purchase_id}`
        : null;
    }
    if (journal.reference_type === 'exchange') {
      return '/dashboard/exchanges/list';
    }

    return null;
  }

  function openJournalReference(journal) {
    const route = getJournalReferenceRoute(journal);
    if (route) push(route);
  }

  function openJournalView(journal) {
    viewedJournal = journal;
  }

  function closeJournalView() {
    viewedJournal = null;
  }

  /*
   * Everything the read-only voucher dialog prints, resolved once so the dialog
   * never re-derives account names, currency symbols or permissions.
   *
   * One row, one voucher: the payment row the day book shows is its
   * `customer ↔ treasury` voucher, so the dialog totals the payment amount
   * once (8,160 for an 8,160 payment) instead of stacking the internal
   * settlement voucher on top and doubling both sides.
   */
  function journalView(j) {
    const info = rowInfo(j);
    const tmeta = journalTypeMeta(j);
    const lines = journalLines(j);
    const totalDr = lines.reduce((sum, line) => sum + (line.dr || 0), 0);
    const totalCr = lines.reduce((sum, line) => sum + (line.cr || 0), 0);
    const symbol = currencySymbol(j.currency);
    const linked = j.reference_type != 'account' && !!j.reference_id;
    const route = linked ? getJournalReferenceRoute(j) : null;
    const canEdit = permissions?.some((permission) => permission.code === 'Journals' && permission.edit);
    const canDelete = permissions?.some((permission) => permission.code === 'Journals' && permission.delete);

    /* Reference story bands: one row per side that actually carries an amount. */
    const story = [
      { side: 'dr', icon: 'north_west', rows: lines.filter((line) => line.dr) },
      { side: 'cr', icon: 'south_east', rows: lines.filter((line) => line.cr) },
    ]
      .filter((group) => group.rows.length)
      .map((group) => ({
        side: group.side,
        icon: group.icon,
        names: group.rows.map((line) => getAccountName(line.id) || '—').join('، '),
        amount: `${symbol}\u200E ${fmtNum(group.rows.reduce((sum, line) => sum + (line.dr || line.cr), 0))}`,
      }));

    return {
      no: j.reference || shortID(j.id),
      typeLabel: tmeta.label,
      typeIcon: tmeta.icon,
      typeColor: tmeta.color,
      active: Number(j.status) === 1,
      dateText: latinDigits(info.dateText),
      gregorian: info.gD,
      time: info.tm,
      description: localizeDescription(j.description, $lang, t) || '—',
      lines: lines.map((line, index) => ({
        key: `${line.id}-${index}`,
        name: getAccountName(line.id) || '—',
        dr: line.dr ? fmtNum(line.dr) : '',
        cr: line.cr ? fmtNum(line.cr) : '',
      })),
      story,
      totalDr: fmtNum(totalDr),
      totalCr: fmtNum(totalCr),
      balanced: Math.abs(totalDr - totalCr) < 0.005,
      sourceLabel: linked ? `#${j.reference_id}` : '',
      sourceType: linked ? tmeta.label : '',
      /* Linked vouchers are edited in their source document, exactly like the
         reference footer's «ویرایش در بل فروش». */
      editMode: route ? 'route' : !linked && canEdit ? 'modal' : 'none',
      canDelete: !linked && !!canDelete,
    };
  }

  $: viewData = viewedJournal ? journalView(viewedJournal) : null;

  function printJournal(journal) {
    selectedJournal = journal;
    if (enable_a4_default_print_mode) {
      showA4Receipt = true;
    } else {
      showReceipt = true;
    }
  }

  function printViewedJournal() {
    const journal = viewedJournal;
    viewedJournal = null;
    if (journal) printJournal(journal);
  }

  function editViewedJournal() {
    const journal = viewedJournal;
    if (!journal) return;
    viewedJournal = null;
    /* Linked vouchers are edited where they were created (see `journalView()`). */
    if (journal.reference_type != 'account' && journal.reference_id) {
      openJournalReference(journal);
      return;
    }
    modalRef.openModal(journal.id);
  }

  function deleteViewedJournal() {
    const journal = viewedJournal;
    viewedJournal = null;
    if (journal) confirmDeleteJournal(journal);
  }

  function confirmDeleteJournal(journal) {
    toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then((ok) => {
      if (ok) deleteJournal(journal.id);
    });
  }

  function getJournalActions(journal) {
    const actions = [];

    /* Reference «نمایش»: the voucher itself opens read-only, for every row. */
    actions.push({
      icon: 'bi-eye',
      label: t('View'),
      tone: 'view',
      onClick: () => openJournalView(journal),
    });

    if (journal.reference_type != 'account' && journal.reference_id) {
      /* Linked vouchers jump to the document that produced them, so the entry is
         named after that document instead of repeating «نمایش». */
      const route = getJournalReferenceRoute(journal);
      if (route) {
        actions.push({
          icon: 'bi-box-arrow-up-right',
          label: journalTypeMeta(journal).label,
          tone: 'muted',
          onClick: () => push(route),
        });
      }
    } else {
      if (permissions?.some((permission) => permission.code === 'Journals' && permission.edit)) {
        actions.push({
          icon: 'bi-pencil',
          label: t('Edit'),
          tone: 'edit',
          onClick: () => modalRef.openModal(journal.id),
        });
      }

      if (permissions?.some((permission) => permission.code === 'Journals' && permission.delete)) {
        actions.push({
          icon: 'bi-trash',
          label: t('Delete'),
          tone: 'danger',
          onClick: () => confirmDeleteJournal(journal),
        });
      }
    }

    actions.push({
      icon: 'bi-printer',
      label: t('Print'),
      /* Reference «چاپ» glyph is muted, not link-blue like «نمایش». */
      tone: 'muted',
      onClick: () => printJournal(journal),
    });

    return actions;
  }

  // Reset pagination when filters change
  $: if (searchTerm || filterAccount || filterStatus) {
    currentPage = 1;
  }

  $: permissions = $auth.permissions;

  let reloadAddJournal = true;
  let showAddJournal = false;
  let addJournalSide = 'dr';
  let addJournalAccountCode = '';
  /* The reference dialog draws its header glyph from the voucher direction:
     north_west for debit, south_east for credit. */
  let addJournalIcon = 'ms:north_west';

  function openAddJournal() {
    addJournalSide = 'dr';
    addJournalIcon = 'ms:north_west';
    showAddJournal = true;
  }

  async function reloadAddJournalComponent() {
    reloadAddJournal = false;
    await tick(); // wait for the component to unmount
    reloadAddJournal = true; // mount a fresh instance
    addJournalSide = 'dr';
    addJournalAccountCode = '';
    addJournalIcon = 'ms:north_west';
    showAddJournal = false;
    await loadJournals({ refreshSummary: true });
  }

  $: journalToolbarFilters = [
    {
      key: 'currency', label: t('Currency'), icon: 'bi-cash-stack', value: filterCurrency,
      options: [{ value: 'all', label: t('All') }, ...currencies.map((currency) => ({ value: currency.code, label: t(currency.code) }))],
    },
    {
      key: 'fiscal_year', label: t('Fiscal Year'), value: filterFiscalYear,
      options: [
        { value: 'all', label: t('All') },
        ...fiscalYears.map((year) => {
          /* Fiscal years are stored as Gregorian dates; the sheet reads every
             date in the Hijri Shamsi calendar, so the option shows that range. */
          const range = jalaliRangeOf(year.start_date, year.end_date);
          return {
            value: year.id ?? year.local_id,
            label: range ? `${year.name} · ${range}` : year.name,
          };
        }),
      ],
    },
    {
      key: 'account', label: t('Account'), value: filterAccount, visible: !account_id,
      options: [{ value: 'all', label: t('All') }, ...accounts.map((account) => ({ value: account.id, label: getAccountName(account.id) }))],
    },
    {
      key: 'reference', label: t('Reference Type'), value: reference_type ?? 'all',
      options: [{ value: 'all', label: t('All') }, ...reference_types.filter(Boolean).map((type) => ({ value: type, label: t(type) }))],
    },
    { key: 'from_date', label: lbl('fromDate'), type: 'date', value: startDate },
    { key: 'to_date', label: lbl('toDate'), type: 'date', value: endDate },
  ];

  /*
   * A selected fiscal year becomes a date range on the query. `All` removes the
   * range again — that is the only state in which the list is not scoped to a
   * year.
   */
  function applyFiscalYearFilter(value) {
    filterFiscalYear = value;

    const year =
      value === 'all'
        ? null
        : fiscalYears.find(
            (item) => String(item.id ?? item.local_id) === String(value),
          );

    const range = year ? fiscalYearRangeOf(year) : null;

    startDate = range?.from || '';
    endDate = range?.to || '';
  }

  function handleJournalFilterChange(event) {
    if (event.detail.key === 'currency') filterCurrency = event.detail.value;
    if (event.detail.key === 'account') filterAccount = event.detail.value;
    if (event.detail.key === 'reference') reference_type = event.detail.value === 'all' ? null : event.detail.value;
    if (event.detail.key === 'fiscal_year') applyFiscalYearFilter(event.detail.value);
    /* A hand-edited window replaces the year's range, so the year no longer describes it. */
    if (event.detail.key === 'from_date') {
      startDate = event.detail.value || '';
      filterFiscalYear = 'all';
    }
    if (event.detail.key === 'to_date') {
      endDate = event.detail.value || '';
      filterFiscalYear = 'all';
    }
    currentPage = 1;
    loadJournals();
  }

  function resetJournalFilters() {
    searchTerm = '';
    filterAccount = 'all';
    filterCurrency = 'all';
    reference_type = null;

    /* Clearing goes back to the working year, not to every year at once. */
    applyFiscalYearFilter(workingFiscalYear?.id ?? 'all');

    currentPage = 1;
    loadJournals();
  }

  /* ===================== Zeno presentation helpers ===================== */

  const perPageOptions = PAGE_SIZE_OPTIONS;

  const L = {
    fa: {
      search: 'جستجو', filter: 'فیلتر', clear: 'پاک‌کردن', show: 'نمایش',
      download: 'دانلود', newDoc: 'سند جدید',
      debtor: 'بدهکار', creditor: 'طلبکار', dateTime: 'تاریخ و ساعت', parties: 'طرفین معامله',
      type: 'نوع', amount: 'مبلغ', actions: 'اقدامات', empty: 'در این بازه سندی نیست',
      rows: 'ردیف', prev: 'قبلی', next: 'بعدی', fromDate: 'از تاریخ', toDate: 'تا تاریخ',
      doc: 'سند', of: 'از', to: 'تا', exportDone: 'فایل Excel روزنامچه دانلود شد',
      journal: 'روزنامچه', exchange: 'تبادله', transfer: 'انتقال',
      /* The invoice reads «فروش»; the payment it posts names that same bill. */
      sale: 'فروش', salePayment: 'بل فروش', purchase: 'بل خرید', purchasePayment: 'پرداخت خرید',
      searchPlaceholder: 'جستجوی سند، شرح یا حساب',
      docs: 'سندها', totalDebit: 'جمع بدهکار', totalCredit: 'جمع طلبکار',
      voided: 'باطل شده', noVoided: 'هیچ سندی باطل نشده',
      balanced: 'متوازن', unbalanced: 'نامتوازن', print: 'چاپ',
    },
    ps: {
      search: 'لټون', filter: 'فلتر', clear: 'پاکول', show: 'ښکاره کول',
      download: 'ډاونلوډ', newDoc: 'نوی سند',
      debtor: 'بدهکار', creditor: 'طلبکار', dateTime: 'نیټه او وخت', parties: 'معامله اړخونه',
      type: 'ډول', amount: 'مقدار', actions: 'کړنې', empty: 'په دې دوره کې سند نشته',
      rows: 'ردیفونه', prev: 'مخکې', next: 'وروسته', fromDate: 'له نیټې', toDate: 'تر نیټې',
      doc: 'سند', of: 'له', to: 'تر', exportDone: 'د Excel فایل ډاونلوډ شو',
      journal: 'روزنامچه', exchange: 'تبادله', transfer: 'انتقال',
      sale: 'خرڅلاو', salePayment: 'د خرڅلاو بل', purchase: 'د خرید بل', purchasePayment: 'د خرید تادیه',
      searchPlaceholder: 'د سند، شرح یا حساب لټون',
      docs: 'سندونه', totalDebit: 'ټول ډیبیټ', totalCredit: 'ټول کریډیټ',
      voided: 'باطل شوي', noVoided: 'هیڅ سند باطل شوی نه دی',
      balanced: 'متوازن', unbalanced: 'ناسمتوازن', print: 'چاپ',
    },
    en: {
      search: 'Search', filter: 'Filter', clear: 'Clear', show: 'Show',
      download: 'Download', newDoc: 'New journal',
      debtor: 'Debit', creditor: 'Credit', dateTime: 'Date & time', parties: 'Parties',
      type: 'Type', amount: 'Amount', actions: 'Actions', empty: 'No journals in this range',
      rows: 'Rows', prev: 'Prev', next: 'Next', fromDate: 'From date', toDate: 'To date',
      doc: 'documents', of: 'of', to: 'to', exportDone: 'Journal Excel file downloaded',
      journal: 'Journal', exchange: 'Exchange', transfer: 'Transfer',
      sale: 'Sale', salePayment: 'Sale bill', purchase: 'Purchase bill', purchasePayment: 'Purchase payment',
      searchPlaceholder: 'Search journal, description or account',
      docs: 'Documents', totalDebit: 'Total debit', totalCredit: 'Total credit',
      voided: 'Voided', noVoided: 'No voided documents',
      balanced: 'Balanced', unbalanced: 'Unbalanced', print: 'Print',
    },
  };

  function lbl(key) {
    return L[_lang]?.[key] || L.fa[key] || key;
  }

  function fmtNum(value) {
    const n = Number(value || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function currencySymbol(code) {
    const normalizedCode = String(code ?? '');
    return currencies.find((item) => String(item.code ?? '') === normalizedCode)?.symbol || t(normalizedCode);
  }

  /* Journal type labels reuse the reference's Material Symbols and colors. */
  function journalTypeMeta(j) {
    const meta = {
      sale: ['sale', 'receipt_long', '#2F6FED'],
      sale_payment: ['salePayment', 'call_received', '#16A34A'],
      purchase: ['purchase', 'shopping_bag', '#7C5CE0'],
      purchase_payment: ['purchasePayment', 'call_made', '#D64560'],
      stock_transfer: ['transfer', 'swap_horiz', '#0EA5E9'],
      exchange: ['exchange', 'currency_exchange', '#7C3AED'],
      sale_return: ['sale', 'assignment_return', '#DB2777'],
      expense: ['journal', 'payments', '#D9822B'],
      opening_balance: ['journal', 'flag', '#64748B'],
    }[j?.reference_type];

    if (meta) return { label: lbl(meta[0]), icon: meta[1], color: meta[2] };
    return { label: lbl('journal'), icon: 'edit_note', color: '#0891B2' };
  }

  function toDateObj(value) {
    const d = value instanceof Date ? value : new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function jalaliShort(iso) {
    const d = toDateObj(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).reduce((acc, part) => ((acc[part.type] = part.value), acc), {});
    /* The reference renders Jalali dates with Latin digits (1405/06/17). */
    const latin = (v) => v.replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));
    return `${latin(p.year)}/${latin(p.month)}/${latin(p.day)}`;
  }

  /* A fiscal year carries Gregorian ISO dates; `1405/06/29 – 1406/06/28` is what
     the sheet shows for it. */
  function jalaliRangeOf(start, end) {
    const from = jalaliShort(start);
    const to = jalaliShort(end);
    if (from && to) return `${from} – ${to}`;
    return from || to;
  }

  function gregorianDay(iso) {
    const d = toDateObj(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).formatToParts(d).reduce((acc, part) => ((acc[part.type] = part.value), acc), {});
    return `${p.day} ${p.month} ${p.year}`;
  }

  function latinDigits(value) {
    return String(value).replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
  }

  function kabulTime(iso) {
    const d = toDateObj(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kabul', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce((acc, part) => ((acc[part.type] = part.value), acc), {});
    return p.hour ? `${p.hour}:${p.minute}` : '';
  }

  /* Debit / credit side of a journal from its two entries. */
  function rowInfo(j) {
    const fDr = Number(j.first_entry_debit || 0);
    const fCr = Number(j.first_entry_credit || 0);
    const sDr = Number(j.second_entry_debit || 0);
    const sCr = Number(j.second_entry_credit || 0);
    /*
     * The leg that carries a non-zero amount names that side. Testing `> 0`
     * sent both sides to the second leg on a negative amount (a return), which
     * printed the same account as debtor and creditor.
     */
    const drId = fDr !== 0 ? j.first_entry_account : j.second_entry_account;
    const crId = fCr !== 0 ? j.first_entry_account : j.second_entry_account;

    /*
     * A control account only hides its own side; a voucher that is nothing but
     * control accounts (an internal settlement) keeps both, so no row is ever
     * left without a party.
     */
    const hideDr = isHiddenAccount(drId);
    const hideCr = isHiddenAccount(crId);
    const hideBoth = hideDr && hideCr;

    return {
      drId: hideDr && !hideBoth ? null : drId,
      crId: hideCr && !hideBoth ? null : crId,
      drAmt: fDr + sDr,
      crAmt: fCr + sCr,
      total: fDr + sDr,
      dateText: jalaliShort(j.date || j.created_at),
      gD: gregorianDay(j.date || j.created_at),
      tm: kabulTime(j.created_at),
    };
  }

  function journalLines(j) {
    const lines = [];
    const add = (id, dr, cr) => {
      if (dr || cr) lines.push({ id, dr, cr });
    };
    add(j.first_entry_account, Number(j.first_entry_debit || 0), Number(j.first_entry_credit || 0));
    add(j.second_entry_account, Number(j.second_entry_debit || 0), Number(j.second_entry_credit || 0));
    return lines;
  }

  /* ===================== KPI row (reference `.jr-kpi`) ===================== */

  function currencyLabel(code) {
    if (!code) return '';
    const match = currencies.find((item) => String(item.code) === String(code));
    return t(String(code)) || match?.name || String(code);
  }

  $: summaryCurrencies = Object.keys(summary || {});
  $: baseCurrency =
    filterCurrency !== 'all'
      ? filterCurrency
      : currency || summaryCurrencies[0] || '';
  $: baseTotals = summary?.[baseCurrency] || { debit: 0, credit: 0, balance: 0 };
  $: balanced =
    Math.abs(Number(baseTotals.credit || 0) - Number(baseTotals.debit || 0)) < 0.005;
  $: balancedText = balanced ? `${lbl('balanced')} ✓` : lbl('unbalanced');

  /* A second currency only ever appears beside the first one's totals. */
  $: otherCurrencyDebit = summaryCurrencies
    .filter((code) => code !== baseCurrency)
    .map((code) => `${currencyLabel(code)} ${fmtNum(summary[code].debit)}`)
    .join(' · ');

  $: kpiCards = (($lang, [
    {
      key: 'docs',
      label: lbl('docs'),
      icon: 'receipt_long',
      ink: '#2F6FED',
      soft: 'var(--z-brand-soft, #e3ecff)',
      value: fmtNum(totalItems),
      unit: lbl('doc'),
      sub: `${summaryCurrencies.length} ${t('Currency')}`,
      title: lbl('docs'),
    },
    {
      key: 'debit',
      label: lbl('totalDebit'),
      icon: 'north_west',
      ink: '#DC2626',
      soft: '#FDECEC',
      value: fmtNum(baseTotals.debit),
      unit: currencyLabel(baseCurrency),
      sub: otherCurrencyDebit || balancedText,
      title: lbl('totalDebit'),
    },
    {
      key: 'credit',
      label: lbl('totalCredit'),
      icon: 'south_east',
      ink: '#16A34A',
      soft: '#E7F6EC',
      value: fmtNum(baseTotals.credit),
      unit: currencyLabel(baseCurrency),
      sub: balancedText,
      title: lbl('totalCredit'),
    },
    {
      key: 'voided',
      label: lbl('voided'),
      icon: 'block',
      ink: 'var(--z-danger, #b91c1c)',
      soft: 'var(--z-danger-soft, #fee2e2)',
      value: fmtNum(cancelledCount || 0),
      unit: lbl('doc'),
      sub: cancelledCount ? `${fmtNum(cancelledCount)} ${lbl('doc')}` : lbl('noVoided'),
      title: lbl('voided'),
    },
  ]));

  /* ===================== toolbar presentation ===================== */

  /* Reference format: `1405/06/17 – 1405/07/16` (en-dash), as-of: `تا 1405/07/16`. */
  $: rangeText = (() => {
    const from = jalaliShort(startDate);
    const to = jalaliShort(endDate);
    if (from && to) return `${from} – ${to}`;
    if (to) return `${lbl('to')} ${to}`;
    return from || '';
  })();

  /* One named handler per chip: a closure that assigns here would make the
     chip list depend on the very state it clears. */
  function clearFiscalYearChip() {
    applyFiscalYearFilter(workingFiscalYear?.id ?? 'all');
    currentPage = 1;
    loadJournals();
  }

  function clearDateChip() {
    startDate = '';
    endDate = '';
    currentPage = 1;
    loadJournals();
  }

  function clearAccountChip() {
    filterAccount = 'all';
    currentPage = 1;
    loadJournals();
  }

  function clearCurrencyChip() {
    filterCurrency = 'all';
    currentPage = 1;
    loadJournals();
  }

  function clearReferenceChip() {
    reference_type = null;
    currentPage = 1;
    loadJournals();
  }

  /*
   * Every applied toolbar filter reports itself as a chip under the search row,
   * exactly like the sales sheet: the chip names the field and its value, and
   * clicking it drops only that one filter. A fiscal year already describes the
   * date window, so the two never appear together.
   */
  $: activeChips = (() => {
    const chips = [];

    if (filterFiscalYear !== 'all') {
      const year = fiscalYears.find(
        (item) => String(item.id ?? item.local_id) === String(filterFiscalYear),
      );
      const range = year ? jalaliRangeOf(year.start_date, year.end_date) : '';
      chips.push({
        key: 'fiscal_year',
        label: `${t('Fiscal Year')}: ${range || year?.name || filterFiscalYear}`,
        clear: clearFiscalYearChip,
      });
    } else if (rangeText) {
      chips.push({
        key: 'date',
        label: `${lbl('fromDate')} / ${lbl('toDate')}: ${rangeText}`,
        clear: clearDateChip,
      });
    }

    if (!account_id && filterAccount !== 'all') {
      const acc = accounts.find((a) => String(a.id) === String(filterAccount));
      chips.push({
        key: 'account',
        label: `${t('Account')}: ${acc ? getAccountName(acc.id) : filterAccount}`,
        clear: clearAccountChip,
      });
    }

    if (filterCurrency !== 'all') {
      chips.push({
        key: 'currency',
        label: `${t('Currency')}: ${t(filterCurrency)}`,
        clear: clearCurrencyChip,
      });
    }

    if (reference_type) {
      chips.push({
        key: 'reference',
        label: `${t('Reference Type')}: ${t(reference_type)}`,
        clear: clearReferenceChip,
      });
    }

    return chips;
  })();

  /*
   * The row itself is the «نمایش» shortcut: a click anywhere on it opens the
   * read-only voucher dialog, the same one the kebab's first entry triggers.
   * The row's own controls (kebab, links) keep their click.
   */
  function openRow(journal, event) {
    const target = event?.target;
    if (target?.closest?.('button, a, .table-actions')) return;
    openJournalView(journal);
  }
</script>

<EditJournalModal bind:this={modalRef} on:saved={loadJournals} />

<div class="jindex" dir={t('dir')}>

  {#if showAddJournal}
    <QuickEntryModal
      title={t('Add Journal')}
      subtitle=""
      icon={addJournalIcon}
      appearance="journal"
      dir={t('dir')}
      on:close={() => (showAddJournal = false)}>
      {#if reloadAddJournal}
        <AddJournal
          selectedAccountID={account_id ? Number(account_id) : null}
          initialJournalSide={addJournalSide}
          initialAccountCode={addJournalAccountCode}
          referenceModal={true}
          on:side={(event) =>
            (addJournalIcon = event.detail === 'cr' ? 'ms:south_east' : 'ms:north_west')}
          on:saved={reloadAddJournalComponent}
          on:close={() => (showAddJournal = false)} />
      {/if}
    </QuickEntryModal>
  {/if}

  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Journals')}
    showStats={true}
    showExtra={true}
    showFooter={totalItems > 0}
    dense={true}
    contained={true}
    panelClass="journals-card"
    contentClass="journals-content"
    tablePadding={true}>

    <svelte:fragment slot="extra">
      <div class="journal-actions">
        <ActionButton
          iconSet="material"
          icon="add"
          label={lbl('newDoc')}
          extraClass="journal-new"
          on:click={openAddJournal} />
      </div>
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <section class="jkpi" aria-label={lbl('docs')}>
        {#each kpiCards as card (card.key)}
          <article class="jkcard" title={card.title}>
            <span class="jtile" style={`--tile-ink: ${card.ink}; --tile-soft: ${card.soft};`} aria-hidden="true">
              <span class="ms f">{card.icon}</span>
            </span>
            <span class="jbody">
              <span class="jlabel">{card.label}</span>
              <span class="jvalue-line">
                <b class="jvalue" dir="ltr" style={`color: ${card.ink};`}>{card.value}</b>
                <span class="junit">{card.unit}</span>
              </span>
              <span class="jsub">{card.sub}</span>
            </span>
          </article>
        {/each}
      </section>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={lbl('search')}
        filters={journalToolbarFilters}
        filterLabel={lbl('filter')}
        resetLabel={lbl('clear')}
        applyLabel={lbl('show')}
        activeCount={activeChips.length}
        showReset={true}
        material={true}
        on:searchChange={(event) => { searchTerm = event.detail; scheduleSearchReload(); }}
        on:filterChange={handleJournalFilterChange}
        on:reset={resetJournalFilters}>
      </FilterToolbar>
    </svelte:fragment>

    {#if activeChips.length}
      <div class="active-filters">
        {#each activeChips as chip (chip.key)}
          <button type="button" class="active-chip" on:click={chip.clear}>
            {chip.label}
            <span class="ms" aria-hidden="true">close</span>
          </button>
        {/each}
        <button type="button" class="active-filters__clear" on:click={resetJournalFilters}>
          {t('Clear Filters')}
        </button>
      </div>
    {/if}

    {#if loading && journals.length === 0}
      <TableSkeleton
        ariaLabel={t('Loading...')}
        columns={['158px', 'auto', '162px', '162px', '87px']}
        minWidth="820px"
        headerHeight="40px"
        cellPaddingY="6px"
        edgePaddingX="16px"
        headEdgePaddingX="16px"
        headBorderColor="var(--z-border-soft, #eef2f7)" />
    {:else if filteredJournals.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-journal-x" message={lbl('empty')} />
      </div>
    {:else}
      <!-- Reference `.jth` grid: date 136 · parties 1fr · type 150 · amount 150 ·
           actions 64, a 12px gutter and a 16px inset at both edges. Each
           declared width carries that gutter as a trailing pad on the edge
           cells; the 6px row pad and the type block give the 54px row. -->
      <DataTable
        ariaLabel={t('Journals')}
        columns={['158px', 'auto', '162px', '162px', '87px']}
        minWidth="820px"
        dense={true}
        striped={false}
        hover={false}
        headerHeight="40px"
        cellPaddingY="6px"
        edgePaddingX="16px"
        headEdgePaddingX="16px"
        headBorderColor="var(--z-border-soft, #eef2f7)"
        stickyHeader={true}
        mobileCards={true}>
        <svelte:fragment slot="head">
          <tr>
            <th><span class="jth-label">{lbl('dateTime')}</span></th>
            <th><span class="jth-label">{lbl('parties')}</span></th>
            <th><span class="jth-label">{lbl('type')}</span></th>
            <th class="col-end"><span class="jth-label">{lbl('amount')}</span></th>
            <th class="col-center"><span class="jth-label">{lbl('actions')}</span></th>
          </tr>
        </svelte:fragment>

        {#each paginatedJournals as j (j.id)}
          {@const info = rowInfo(j)}
          {@const tmeta = journalTypeMeta(j)}
          <tr
            class="journal-row"
            role="button"
            tabindex="0"
            aria-haspopup="dialog"
            on:click={(event) => openRow(j, event)}
            on:keydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openJournalView(j);
              }
            }}>
            <td>
              <span class="journal-date">
                <b dir="ltr">{latinDigits(info.dateText)}</b>
                <span dir="ltr" class="journal-date__sub">
                  <span>{info.gD}</span>
                  {#if info.tm}
                    <i class="journal-date__sep" aria-hidden="true"></i>
                    <span class="journal-date__time">{info.tm}</span>
                  {/if}
                </span>
              </span>
            </td>

            <td>
              <span class="journal-party">
                {#if info.drId}
                  <span class="journal-party__line">
                    <span class="journal-side journal-side--dr">{lbl('debtor')}</span>
                    <span class="journal-party__name">{getAccountName(info.drId)}</span>
                  </span>
                {/if}
                {#if info.crId}
                  <span class="journal-party__line">
                    <span class="journal-side journal-side--cr">{lbl('creditor')}</span>
                    <span class="journal-party__name journal-party__name--cr">{getAccountName(info.crId)}</span>
                  </span>
                {/if}
              </span>
            </td>

            <td>
              <span class="journal-type">
                <span class="journal-pill" style={`--journal-type: ${tmeta.color}`}>
                  <span class="ms" aria-hidden="true">{tmeta.icon}</span>{tmeta.label}
                </span>
                <span class="journal-type__sub">
                  <span dir="ltr" class="journal-type__no">{j.reference || shortID(j.id)}</span>
                  {#if j.reference_type}
                    <span dir="ltr"> · {t(j.reference_type)}</span>
                  {/if}
                </span>
              </span>
            </td>

            <td class="col-end">
              <span dir="ltr" class="journal-amount">
                <span class="journal-amount__sym">{currencySymbol(j.currency)}</span><b>{fmtNum(info.total)}</b>
              </span>
            </td>

            <td class="col-center">
              <TableActions actions={getJournalActions(j)} menuTitle={j.reference || shortID(j.id)} foldAll material />
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
        rowLabel={lbl('rows')}
        {getPageNumbers}
        on:perPageChange={(event) => {
          itemsPerPage = Number(event.detail);
          currentPage = 1;
        }} />
    </svelte:fragment>
  </IndexPageLayout>

  {#if viewData}
    <ViewJournalModal
      view={viewData}
      on:close={closeJournalView}
      on:print={printViewedJournal}
      on:edit={editViewedJournal}
      on:delete={deleteViewedJournal} />
  {/if}

  {#if showReceipt}
    <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
  {/if}
  {#if showA4Receipt}
    <JournalA4ReceiptModal
      journal={selectedJournal}
      on:close={() => (showA4Receipt = false)}
      on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
  {/if}
</div>

<style>
  /* ================= page shell ================= */
  .jindex {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }

  :global(.jindex > .index-page) {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }

  .index-table-state {
    padding: 6px 0 10px;
  }

  /*
   * Reference stack: the action buttons and the KPI tiles sit on the page
   * surface, and only the toolbar, the ledger and the pager share the 14px
   * sheet. The shared panel is therefore unwrapped and its children re-ordered.
   */
  .jindex :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .jindex :global(.index-statistics) {
    order: -1;
    flex: 0 0 auto;
    padding: 0;
    margin-bottom: 10px;
    border: 0;
    background: transparent;
  }

  .jindex :global(.index-toolbar) {
    order: 0;
    flex: 0 0 auto;
    min-height: 0;
    padding: 8px 12px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: var(--z-r-xl, 14px) var(--z-r-xl, 14px) 0 0;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .jindex :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
    flex-wrap: nowrap;
  }

  .jindex :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }

  .jindex :global(.journals-content .data-table-wrap) {
    border: 0;
  }

  /*
   * Applied filters, reported the way the sales sheet does it: a surface-2
   * band under the search row with one removable chip per filter and a single
   * "clear" link after them.
   */
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

  .jindex :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  /* ---------- action group: download split, print, new voucher ---------- */
  .journal-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  /* ---------- KPI row (reference `.jr-kpi`) ---------- */
  .jkpi {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .jkcard {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 72px;
    padding: 9px 12px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 12px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .jtile {
    display: inline-grid;
    place-items: center;
    flex: 0 0 32px;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--tile-soft, var(--z-brand-soft, #e3ecff));
    color: var(--tile-ink, var(--z-link, #2f6fed));
    line-height: 1;
  }

  .jtile .ms {
    font-size: 17px;
  }

  .jbody {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .jlabel {
    overflow: hidden;
    color: var(--z-text, #475569);
    font-size: 11.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jvalue-line {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }

  .jvalue {
    min-width: 0;
    overflow: hidden;
    font-family: var(--z-font-num);
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .junit {
    flex: 0 0 auto;
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jsub {
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---------- header labels ---------- */
  .jth-label {
    color: var(--z-muted, #64748b);
    font-size: 11.5px;
    font-weight: 600;
  }

  /* Reference actions column: the header label and the kebab are centred, not
     end-aligned (`text-align: center` + `justify-content: center`). */
  .jindex .col-center {
    text-align: center;
  }

  /* ================= row ================= */
  .journal-row {
    cursor: pointer;
  }

  .journal-row:focus-visible {
    outline: 2px solid var(--z-brand, #2f6fed);
    outline-offset: -2px;
  }

  /* --- date --- */
  /* Reference: 12px/800 ink date over a 10.5px sub line, line-height 1.35. */
  .journal-date {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.35;
    white-space: nowrap;
  }

  .journal-date b {
    display: block;
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  .jindex[dir='rtl'] .journal-date b {
    text-align: right;
  }

  .journal-date__sub {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--z-font-num);
    font-size: var(--z-fs-xs, 10.5px);
    font-weight: 400;
    color: var(--z-muted, #64748b);
  }

  .jindex[dir='rtl'] .journal-date__sub {
    justify-content: flex-end;
  }

  .journal-date__sep {
    width: 1px;
    height: 9px;
    background: var(--z-border, #e1e7f0);
  }

  .journal-date__time {
    font-weight: 600;
    color: var(--z-text, #475569);
  }

  /* --- parties --- */
  /* Reference: 46x17 side chip (radius 5, 9.5px/800) beside a 12px name, two
     lines at a 3px gap and 1.3 line-height. */
  .journal-party {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    line-height: 1.3;
  }

  .journal-party__line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .journal-side {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 17px;
    border-radius: 5px;
    font-size: 9.5px;
    font-weight: 800;
  }

  .journal-side--dr {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .journal-side--cr {
    background: var(--z-credit-soft, #e7f6ec);
    color: var(--z-credit, #16a34a);
  }

  .journal-party__name {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink, #0b1530);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .journal-party__name--cr {
    font-weight: 600;
    color: var(--z-text, #475569);
  }

  /* --- journal type pill: measured against Journal.dc.html's `typS`. --- */
  .journal-type {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }

  .journal-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px 0 7px;
    border-radius: var(--z-r-pill, 999px);
    background: color-mix(in srgb, var(--journal-type, #2f6fed) 11%, transparent);
    color: var(--journal-type, #2f6fed);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .journal-pill .ms {
    font-size: 14px;
    line-height: 1;
  }

  .journal-type__sub {
    display: flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 400;
    /* The sheet's sub-line sits in a 16.8px line box, so the two-line type
       block (22 + 3 + 16.8) is what sets the 54px row height. */
    line-height: 1.6;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .journal-type__no {
    font-family: var(--z-font-num);
    font-weight: 700;
  }

  /* --- amount --- */
  /* Reference: 11px/700 muted currency symbol on a 13.5px/800 ink figure. */
  .journal-amount {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 5px;
    font-family: var(--z-font-num);
    white-space: nowrap;
  }

  .journal-amount__sym {
    font-size: 11px;
    font-weight: 700;
    color: var(--z-muted, #64748b);
  }

  .journal-amount b {
    font-family: var(--z-font-num);
    font-size: 13.5px;
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  /* ================= responsive ================= */
  @media (max-width: 900px) {
    .journal-date__sub {
      display: none;
    }

    .journal-pill {
      height: 20px;
      padding: 0 7px;
      font-size: var(--z-fs-2xs, 10px);
    }

    .journal-pill .ms {
      font-size: 12px;
    }

    .journal-side {
      min-width: 40px;
    }
  }
</style>
