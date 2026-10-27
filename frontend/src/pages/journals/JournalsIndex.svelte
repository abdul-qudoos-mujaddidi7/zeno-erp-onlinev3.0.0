<script>
  import { onMount, tick } from 'svelte';
  import { push, querystring } from 'svelte-spa-router';
  import { auth } from '../../auth/authStore';
  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
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

  let loading = true;
  let TREASURY_ID = null;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;

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

  async function loadJournals() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;

    const journalResponse =
      await journalApi.getAll({
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
        skip_count: 1,
        account_id:
          account_id ||
          (filterAccount !== 'all' ? Number(filterAccount) : undefined),
        reference_type: reference_type || undefined,
        currency: filterCurrency !== 'all' ? filterCurrency : undefined,
        page: currentPage,
        limit: itemsPerPage,
      });

    if (requestId !== loadRequestId) return;

    journals = journalResponse?.data || [];
    await ensurePeerAccounts(journals);

    const meta = readListMeta(journalResponse, journals.length);
    const hasMore = Boolean(journalResponse?.meta?.hasMore);

    totalItems = hasMore
      ? Math.max(meta.total, currentPage * itemsPerPage + 1)
      : Math.max(meta.total, (currentPage - 1) * itemsPerPage + journals.length);
    totalPages = hasMore
      ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
      : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);

    if (requestId === loadRequestId) loading = false;

    journals.forEach((j) => {
      if (!reference_types.includes(j.reference_type)) {
        reference_types = [...reference_types, j.reference_type];
      }
    });
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

    /*
     * Default the list to the working fiscal year BEFORE the first request, and
     * show that year as the selected value of the fiscal-year filter so the
     * scope on screen always matches the scope applied to the query.
     */
    workingFiscalYear = await applyCurrentFiscalYearRange(({ from, to }) => {
      startDate = from;
      endDate = to;
    });

    await Promise.all([loadAccounts(), loadCurrencies(), loadFiscalYears()]);

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
    await loadJournals();
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
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

  /*
   * Everything the read-only voucher dialog prints, resolved once so the dialog
   * never re-derives account names, currency symbols or permissions.
   */
  function journalView(j) {
    const info = rowInfo(j);
    const tmeta = journalTypeMeta(j);
    const lines = journalLines(j);
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
      totalDr: fmtNum(info.drAmt),
      totalCr: fmtNum(info.crAmt),
      balanced: Math.abs(info.drAmt - info.crAmt) < 0.005,
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
    await loadJournals();
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
        ...fiscalYears.map((year) => ({
          value: year.id ?? year.local_id,
          label: `${year.name} (${year.start_date} → ${year.end_date})`,
        })),
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
    return {
      drId: fDr > 0 ? j.first_entry_account : j.second_entry_account,
      crId: fCr > 0 ? j.first_entry_account : j.second_entry_account,
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

  /* ===================== toolbar presentation ===================== */

  /* Reference format: `1405/06/17 – 1405/07/16` (en-dash), as-of: `تا 1405/07/16`. */
  $: rangeText = (() => {
    const from = jalaliShort(startDate);
    const to = jalaliShort(endDate);
    if (from && to) return `${from} – ${to}`;
    if (to) return `${lbl('to')} ${to}`;
    return from || '';
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

  /* ===================== print & excel ===================== */

  function escText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function printList() {
    const body = filteredJournals
      .map((j) => {
        const info = rowInfo(j);
        const meta = journalTypeMeta(j);
        return (
          '<tr>' +
          `<td dir="ltr">${escText(info.dateText)}${info.tm ? ' · ' + escText(info.tm) : ''}</td>` +
          `<td>${escText(getAccountName(info.drId))}<br/>${escText(getAccountName(info.crId))}</td>` +
          `<td>${escText(meta.label)}</td>` +
          `<td dir="ltr">${escText(fmtNum(info.total))} ${escText(t(j.currency))}</td>` +
          `<td>${escText(localizeDescription(j.description, $lang, t))}</td>` +
          '</tr>'
        );
      })
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>روزنامچه · Zeno</title><style>' +
      'body{font-family:Inter,Vazirmatn,Tahoma,sans-serif;color:#0B1530;margin:24px;font-size:11px}' +
      'table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}' +
      'th{background:#F6F8FC;border-bottom:1px solid #E7EBF3;padding:6px 8px;text-align:right;font-size:10px;color:#5B6478}' +
      'td{border-bottom:1px solid #F0F2F7;padding:6px 8px}' +
      '.hd{display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px}' +
      '</style></head><body>' +
      `<div class="hd"><b>روزنامچه · Zeno</b><span dir="ltr">${escText(rangeText)}</span></div>` +
      '<table><thead><tr><th>تاریخ</th><th>طرفین معامله</th><th>نوع</th><th>مبلغ</th><th>شرح</th></tr></thead><tbody>' +
      body +
      '</tbody></table><script>window.onload=function(){window.focus();window.print()}</scr' + 'ipt></body></html>',
    );
    win.document.close();
  }

  async function exportExcel() {
    const all = [];
    let exportPage = 1;
    const limit = 200;

    while (exportPage <= 100) {
      const response = await journalApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        date_from: startDate || undefined,
        date_to: endDate || undefined,
        exclude_system_accounts: account_id ? 0 : 1,
        skip_count: 1,
        account_id: account_id || (filterAccount !== 'all' ? Number(filterAccount) : undefined),
        reference_type: reference_type || undefined,
        currency: filterCurrency !== 'all' ? filterCurrency : undefined,
        page: exportPage,
        limit,
      });
      const rows = response?.data || [];
      all.push(...rows);
      if (!response?.meta?.hasMore || !rows.length) break;
      exportPage += 1;
    }

    const lines = [['تاریخ', 'سند', 'نوع', 'شرح', 'ارز', 'حساب بدهکار', 'بدهکار', 'حساب طلبکار', 'طلبکار']];
    for (const j of all) {
      const info = rowInfo(j);
      const meta = journalTypeMeta(j);
      lines.push([
        info.dateText,
        j.reference || '',
        meta.label,
        localizeDescription(j.description, $lang, t) || '',
        j.currency || '',
        getAccountName(info.drId),
        info.drAmt ? fmtNum(info.drAmt) : '',
        getAccountName(info.crId),
        info.crAmt ? fmtNum(info.crAmt) : '',
      ]);
    }

    const csv = '\uFEFF' + lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `روزنامچه-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(lbl('exportDone'));
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
    toolbarWidth="22rem"
    showStats={false}
    showFooter={totalItems > 0}
    dense={true}
    contained={true}
    panelClass="journals-card"
    contentClass="journals-content"
    tablePadding={true}>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={lbl('search')}
        filters={journalToolbarFilters}
        filterLabel={lbl('filter')}
        resetLabel={lbl('clear')}
        applyLabel={lbl('show')}
        showReset={true}
        material={true}
        on:searchChange={(event) => { searchTerm = event.detail; scheduleSearchReload(); }}
        on:filterChange={handleJournalFilterChange}
        on:reset={resetJournalFilters}>
        <svelte:fragment slot="actions">
          {#if rangeText}
            <span class="journal-range" dir="ltr">{rangeText}</span>
          {/if}
        </svelte:fragment>
      </FilterToolbar>
    </svelte:fragment>

    <svelte:fragment slot="actions">
      <ExportMenu material={true} on:export={(event) => (event.detail === 'excel' ? exportExcel() : printList())} />
      <ActionButton
        iconSet="material"
        icon="add"
        label={lbl('newDoc')}
        on:click={openAddJournal} />
    </svelte:fragment>

    {#if loading && journals.length === 0}
      <div class="index-table-state">
        <EmptyState loading={true} message={t('Loading...')} />
      </div>
    {:else if filteredJournals.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-journal-x" message={lbl('empty')} />
      </div>
    {:else}
      <!-- Reference `.jth` grid: date 136 · parties 1fr · type 150 · amount 150 ·
           actions 64. The declared widths add the 6px cell padding per side (and
           the 14px edge insets). -->
      <DataTable
        ariaLabel={t('Journals')}
        columns={['156px', 'auto', '162px', '162px', '84px']}
        minWidth="820px"
        dense={true}
        striped={false}
        hover={false}
        cellPaddingY="9px"
        stickyHeader={true}
        mobileCards={true}>
        <svelte:fragment slot="head">
          <tr>
            <th>{lbl('dateTime')}</th>
            <th>{lbl('parties')}</th>
            <th>{lbl('type')}</th>
            <th class="col-end">{lbl('amount')}</th>
            <th class="col-center">{lbl('actions')}</th>
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
                <span class="journal-party__line">
                  <span class="journal-side journal-side--dr">{lbl('debtor')}</span>
                  <span class="journal-party__name">{getAccountName(info.drId)}</span>
                </span>
                <span class="journal-party__line">
                  <span class="journal-side journal-side--cr">{lbl('creditor')}</span>
                  <span class="journal-party__name journal-party__name--cr">{getAccountName(info.crId)}</span>
                </span>
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
      on:close={() => (viewedJournal = null)}
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

  :global(.jindex .index-toolbar-main .filter-search) {
    flex: 0 1 220px;
    width: 220px;
    max-width: 100%;
    height: 30px;
    min-height: 30px;
    padding: 0 9px;
    gap: 6px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 8px;
    background: var(--z-surface-2, #f8fafc);
    box-shadow: none;
  }

  :global(.jindex .index-toolbar-main .filter-search__icon) {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    font-size: 16px;
    line-height: 16px;
  }

  :global(.jindex .index-toolbar-main .filter-search__input) {
    font-size: 12.5px;
    color: var(--z-ink, #0b1530);
  }

  /* Reference actions column: the header label and the kebab are centred, not
     end-aligned (`text-align: center` + `justify-content: center`). */
  .jindex .col-center {
    text-align: center;
  }

  /* ================= toolbar date range ================= */
  /* The document count is gone; only the range the list is scoped to stays,
     in LTR Inter-700 against --z-text. */
  .journal-range {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 700;
    color: var(--z-text, #475569);
    white-space: nowrap;
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
    line-height: normal;
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
