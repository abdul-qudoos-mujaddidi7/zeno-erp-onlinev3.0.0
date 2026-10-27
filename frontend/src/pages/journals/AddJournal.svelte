<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import JournalReceiptModal from './JournalReceiptModal.svelte';
  import JournalA4ReceiptModal from './JournalA4ReceiptModal.svelte';

  let showReceipt = false;
  let showA4Receipt = false;
  let savedJournal = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_a4_default_print_mode =
    $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;

  let componentRoot;
  import AccountModal from '../accounts/AccountModal.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';

  let accounts = [];
  let accountTypes = [];

  let currencies = [];
  let journals = [];
  let allJournals = [];
  let accountBalances = {};

  let loading = true;
  let saving = false;
  let showTrackModal = false;

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  export let selectedAccountID = null;
  export let journalId = null;
  export let referenceModal = false;
  export let initialJournalSide = 'dr';
  export let initialAccountCode = '';

  let general = false;
  export let genInp = null;

  $: if (genInp) {
    general = true;
    let myPercent = accounts.find((a) => a.id == selectedAccountID)?.percentage || 0;

    if (genInp[1] < 0) {
      first_entry_debit = 0;
      first_entry_credit = (genInp[1] / 100) * myPercent * -1;
    } else {
      first_entry_debit = (genInp[1] / 100) * myPercent;
      first_entry_credit = 0;
    }
    description = t('Total') + t('-of-') + t('Dividends') + ': ' +
      (genInp ? Number(genInp[1] || 0).toFixed(2) : '') + ' ' +
      (genInp ? t(genInp[0]) : '') + ' | ' +
      t('Percentage') + ': ' + myPercent + '%';
    second_entry_account = notrack_ID; // this is reactive since it's `let`
    currency = genInp[0];
  }

  export async function modalOpened(id) {
    if (Array.isArray(id)) {
      await loadAccounts();

      general = true;

      accounts = accounts.filter((a) => a.account_type_id === 7);
      filteredAccounts = [...accounts];

      accountTypes = accountTypes.filter((at) => at.id == 7);
      console.log('Filtered accounts:', accounts);

      if (id[0][1] < 0) {
        first_entry_credit = id[0][1] * -1;
      } else {
        first_entry_debit = id[0][1];
      }

      selectedAccountID = id[1];
      first_entry_account = parseInt(selectedAccountID);
      second_entry_account = notrack_ID;
      currency = id[0];
      console.log('second_entry_account', second_entry_account);
    } else {
      journalId = id;
      await loadJournalIfEditing();
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
  }

  const dispatch = createEventDispatcher();

  let modalRef;
  let modalRefAdd;
  
  let date = new Date().toISOString().slice(0, 10);
  let description = '';
  let reference = '';
  let currency = '';
  let first_entry_account = '';
  let first_entry_debit = null;
  let first_entry_credit = null;
  let second_entry_account = '';
  let second_entry_debit = null;
  let second_entry_credit = null;
  let reference_id = null;
  let reference_type = null;
  let status = 1;
  let treasury_balance = 0;
  let treasury_ID = 0;
  let notrack_ID = 0;
  let account = null;
  // Account balances are credit minus debit, so available treasury funds are
  // the negated balance for the currency currently selected in the form.
  $: treasury_balance = Number(
    accountBalances?.[treasury_ID]?.[currency] || 0,
  );

  async function loadAccounts() {
    await loadAccountBalances();
    accountTypes = (await accountTypeApi.getAll({ status: 1 }))?.data || [];
    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    accounts = accounts.filter((a) => (a.account_status ? a.account_status == 'active' : a.status == 1));
    console.log(general);
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
        treasury_ID = acc.id;
      }
      if (acc.code === 'NOTRACK') {
        notrack_ID = acc.id;
      }
    });
    accounts = accounts.filter(
      (a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE', 'EXCHANGE'].includes(a.code),
    );
    accounts.sort((a, b) => {
      if (a.account_type_id === b.account_type_id) {
        return a.name.localeCompare(b.name);
      }
      return b.account_type_id - a.account_type_id;
    });
    if (general) {
      accounts = accounts.filter((a) => a.account_type_id == 7);
    }

    account = accounts.find(
      (item) =>
        Number(item.id) ===
        Number(first_entry_account),
    );

    if (!applyInitialAccount()) applySelectedAccount();
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadAccountBalances() {
    loading = true;
    try {
      accountBalances =
        (await accountApi.getBalances({ status: 1 }))?.data || {};
      journals = [];
      allJournals = [];
    } finally {
      loading = false;
    }
  }

  async function loadJournalIfEditing() {
    if (journalId) {
      let journal =
        (await journalApi.getById(Number(journalId)))?.data || null;
      if (journal) {
        date = journal.date.slice(0, 10);
        console.log(date);
        description = journal.description;
        reference = journal.reference || '';
        currency = journal.currency;
        first_entry_account = journal.first_entry_account;
        first_entry_debit = journal.first_entry_debit;
        first_entry_credit = journal.first_entry_credit;
        second_entry_account = journal.second_entry_account;
        second_entry_debit = journal.second_entry_debit;
        second_entry_credit = journal.second_entry_credit;
        reference_id = journal.reference_id;
        reference_type = journal.reference_type;
        status = journal.status;
        let first_account = await (async () => { const _a = (await accountApi.getById(first_entry_account))?.data; return _a && _a.status === 1 ? _a : null; })();
        first_entry_account_search = first_account
          ? t('Lang') === 'en'
            ? first_account.name
            : t('Lang') === 'fa'
              ? first_account.name_fa
              : t('Lang') === 'ps'
                ? first_account.name_ps
                : first_account.name
          : first_entry_account;
        console.log('loaded', journal);
      }
    }
  }

  onMount(async () => {
    pinnedAccountIds = readPinnedAccounts();

    await loadCurrencies();
    await loadAccounts();

    /*
     * At this point the accounts are available, so the account name
     * can be resolved and displayed in the customer field.
     */
    applySelectedAccount();

    if (window.mdb) {
      document
        .querySelectorAll('[data-mdb-input-init]')
        .forEach(
          (element) =>
            new window.mdb.Input(element),
        );

      document
        .querySelectorAll('.dropdown-toggle')
        .forEach((element) => {
          new window.mdb.Dropdown(element);
        });
    }

    await loadJournalIfEditing();

    /*
     * When editing a journal that already pays a bill, reload the bill
     * list and preselect the referenced bill.
     */
    if (reference_type === 'sale' || reference_type === 'purchase') {
      await loadBillsForAccount(first_entry_account);
      const match = bills.find((b) => Number(b.id) === Number(reference_id));
      if (match) {
        selectedBill = match;
        currency = match.currency;
        billSearch = billLabel(match);
        billFilter = '';
      }
    }

    await tick();
    setDatePickers(
      handleDateChange,
      componentRoot,
    );
  });

  async function saveJournal() {
  if (saving) return;

  const debitAmount = Number(first_entry_debit ?? 0);
  const creditAmount = Number(first_entry_credit ?? 0);

  if (!first_entry_account || !second_entry_account) {
    toast.error(t('Error'), t('Please select accounts for both entries.'));
    return;
  }

  if (first_entry_account == second_entry_account) {
    toast.error(
      t('Error'),
      t('Please select different accounts for both entries.')
    );
    return;
  }

  // Prevent saving when both debit and credit are null, empty, invalid, or zero
  const hasDebit =
    Number.isFinite(debitAmount) && debitAmount > 0;

  const hasCredit =
    Number.isFinite(creditAmount) && creditAmount > 0;

  if (!hasDebit && !hasCredit) {
    toast.error(
      t('Error'),
      t('Please enter a debit or credit amount greater than zero.')
    );
    return;
  }

  // Extra protection: do not allow both fields at the same time
  if (hasDebit && hasCredit) {
    toast.error(
      t('Error'),
      t('Enter an amount in either debit or credit, not both.')
    );
    return;
  }

  if (first_entry_account == treasury_ID) {
    if (hasCredit && creditAmount > treasury_balance * -1) {
      toast.error(t('Error'), t('Insufficient Funds in Treasury.'));
      return;
    }
  }

  if (second_entry_account == treasury_ID) {
    if (hasDebit && debitAmount > treasury_balance * -1) {
      toast.error(t('Error'), t('Insufficient Funds in Treasury.'));
      return;
    }
  }

  // Generate the second entry safely from the entered amount
  const data = {
    date,
    description,
    reference: reference.trim() || null,
    reference_id,
    reference_type,
    /*
     * Bill payments are always posted in the bill's currency so the
     * customer/supplier balance and the bill's remaining move in the
     * bill's currency, even when the payment was made in another
     * currency (the amounts were converted on input).
     */
    currency: selectedBill ? selectedBill.currency : currency,

    first_entry_account,
    first_entry_debit: hasDebit ? debitAmount : 0,
    first_entry_credit: hasCredit ? creditAmount : 0,

    second_entry_account,
    second_entry_debit: hasCredit ? creditAmount : 0,
    second_entry_credit: hasDebit ? debitAmount : 0,

    status: parseInt(status) || 1,
  };

  saving = true;

  try {
    let saved;

    if (!journalId) {
      // The backend creates the journal and records the
      // activity log entry atomically.
      saved = await journalApi.create(data);
    } else {
      saved = await journalApi.update(
        Number(journalId),
        data,
      );
    }

    data.id = saved?.data?.id || Number(journalId);

    savedJournal = { ...data };

    resetForm();
    await loadAccounts();
    await tick();

    if (!general) {
      if (enable_a4_default_print_mode) {
        showA4Receipt = true;
        showReceipt = false;
      } else {
        showReceipt = true;
        showA4Receipt = false;
      }
      componentRoot?.closest('.quick-entry-modal')?.classList.add('receipt-open');
    } else {
      dispatch('saved', { journal: data });
    }

    toast.success(t('Success'), t('Journal saved successfully.'));
  } catch (err) {
    console.error('Failed to save journal:', err);

    toast.error(
      t('Error'),
      t('An error occurred while saving the journal. Please try again.')
    );
  } finally {
    saving = false;
  }

  }

  function closeReceipt() {
    showReceipt = false;
    showA4Receipt = false;
    componentRoot?.closest('.quick-entry-modal')?.classList.remove('receipt-open');
    dispatch('saved', { journal: savedJournal });
  }

  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    description = '';
    reference = '';

    first_entry_debit = null;
    first_entry_credit = null;
    journalSide = 'dr';

    if (!applySelectedAccount()) {
      first_entry_account = '';
      first_entry_account_search = '';
      account = null;
    }

    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
      }
    });

    currency =
      currencies.find((item) => item.isDefault)
        ?.code || '';

    second_entry_debit = null;
    second_entry_credit = null;
    status = 1;

    clearBillSelection();
    bills = [];
    showBillDropdown = false;
    billSearch = '';
  }

  function format(value) {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }
  function normalize(value) {
    if (!value) return '0';
    value = value.toString().replace(/[^0-9.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    let [integer, decimal] = value.split('.');
    if (integer) {
      integer = integer.replace(/^0+(?=\d)/, '');
      if (integer === '') integer = '0';
    }
    return decimal !== undefined ? integer + '.' + decimal : integer;
  }
  /*
   * Cross-currency bill payments (SaleForm-style): when a bill is
   * selected the user may pay in any currency, but the journal is always
   * posted in the bill's currency so the customer/supplier balance and
   * the bill's remaining move correctly. The amount typed in the paid
   * currency is converted to the bill currency before saving.
   */
  function billCurrencyCode() {
    return selectedBill ? selectedBill.currency : null;
  }

  function toJournalAmount(value) {
    const billCur = billCurrencyCode();
    if (billCur && currency && currency !== billCur) {
      return exchangeRate(Number(value || 0), currency, billCur);
    }
    return value;
  }

  function toDisplayAmount(value) {
    const billCur = billCurrencyCode();
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return value;
    }
    if (billCur && currency && currency !== billCur) {
      return exchangeRate(Number(value || 0), billCur, currency);
    }
    return value;
  }

  function onFirstDebitInput(value) {
    const amount = normalize(value);
    const journalAmount = normalize(String(toJournalAmount(amount)));
    first_entry_debit = journalAmount;
    first_entry_credit = null;
    second_entry_credit = journalAmount;
    second_entry_debit = null;
  }
  function onFirstCreditInput(value) {
    const amount = normalize(value);
    const journalAmount = normalize(String(toJournalAmount(amount)));
    first_entry_credit = journalAmount;
    first_entry_debit = null;
    second_entry_debit = journalAmount;
    second_entry_credit = null;
  }
  function onSecondDebitInput(value) {
    const amount = normalize(value);
    const journalAmount = normalize(String(toJournalAmount(amount)));
    second_entry_debit = journalAmount;
    second_entry_credit = null;
    first_entry_credit = journalAmount;
    first_entry_debit = null;
  }
  function onSecondCreditInput(value) {
    const amount = normalize(value);
    const journalAmount = normalize(String(toJournalAmount(amount)));
    second_entry_credit = journalAmount;
    second_entry_debit = null;
    first_entry_debit = journalAmount;
    first_entry_credit = null;
  }
  function onlyNumbers(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowed.includes(e.key)) return;
    if (/[0-9]/.test(e.key)) return;
    if (e.key === '.' && !e.target.value.includes('.')) return;
    e.preventDefault();
  }
  let first_entry_account_search = '';
  let showAccountDropdown = false;
  let filteredAccounts = [];
  let second_entry_account_search = '';
  let trackPickerStyle = '';
  let currencyMenuFor = null; // 'debit' | 'credit' | null

  function getAccountName(id) {
    const normalizedId = Number(id);

    const acc = accounts.find(
      (item) => Number(item.id) === normalizedId,
    );

    if (!acc) return '';

    if (t('Lang') === 'fa') {
      return acc.name_fa || acc.name || acc.name_ps || '';
    }

    if (t('Lang') === 'ps') {
      return acc.name_ps || acc.name_fa || acc.name || '';
    }

    return acc.name || acc.name_fa || acc.name_ps || '';
  }

  /* ---- Counterpart account picker ------------------------------------
   * Mirrors the reference "Create Journal" account list: a search row with
   * a "new account" chip, a pinned section (a local preference, exactly
   * like the reference's own pins) and every other account with its type,
   * code and balance in the currency of the voucher.
   */
  const PIN_STORAGE_KEY = 'zeno.jvPins';
  let pinnedAccountIds = [];

  function readPinnedAccounts() {
    try {
      const stored = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || '[]');

      return Array.isArray(stored) ? stored.map(String) : [];
    } catch (error) {
      return [];
    }
  }

  function toggleAccountPin(accountId) {
    const value = String(accountId);

    pinnedAccountIds = pinnedAccountIds.includes(value)
      ? pinnedAccountIds.filter((item) => item !== value)
      : pinnedAccountIds.concat([value]);

    try {
      localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedAccountIds));
    } catch (error) {
      /* Blocked storage must not stop the picker from working. */
    }
  }

  /* The reference paints each row from the account class: one icon and one
     colour per class, mixed into a 13% tile. */
  const ACCOUNT_TYPE_TINTS = {
    1: ['account_balance_wallet', '#2F6FED'],
    2: ['request_quote', '#D64560'],
    3: ['request_quote', '#D64560'],
    4: ['account_balance_wallet', '#2F6FED'],
    5: ['receipt_long', '#D9822B'],
    6: ['trending_up', '#16A34A'],
    7: ['savings', '#7C5CE0'],
  };

  function accountTypeTint(selected) {
    const [icon, color] = ACCOUNT_TYPE_TINTS[Number(selected?.account_type_id)] || [
      'account_balance_wallet',
      '#64748B',
    ];

    return {
      icon,
      style: `background: color-mix(in srgb, ${color} 13%, transparent); color: ${color};`,
    };
  }

  /*
   * House accounts (treasury, expenses, equity …) lead both pickers; the
   * customer / supplier ledgers follow them.
   */
  function accountRank(selected) {
    const isParty =
      Number(selected?.can_be_customer) === 1 ||
      Number(selected?.can_be_supplier) === 1 ||
      Number(selected?.account_type_id) === 3 ||
      Number(selected?.account_type_id) === 4;

    return isParty ? 1 : 0;
  }

  /* The panel carries its own search row, so the field and the panel filter
     through the same helper. */
  function filterCustomerAccounts() {
    const query = first_entry_account_search.trim().toLowerCase();

    filteredAccounts = accounts.filter((acc) => {
      if (!query) return true;

      return (
        accountSearchName(acc).toLowerCase().includes(query) ||
        String(acc.code || '').toLowerCase().includes(query)
      );
    });
  }

  function accountSearchName(selected) {
    if (t('Lang') === 'fa') {
      return selected.name_fa || selected.name || selected.name_ps || '';
    }

    if (t('Lang') === 'ps') {
      return selected.name_ps || selected.name || selected.name_fa || '';
    }

    return selected.name || selected.name_fa || selected.name_ps || '';
  }

  function accountTypeLabel(selected) {
    const type = accountTypes.find(
      (item) => Number(item.id) === Number(selected.account_type_id),
    );

    if (!type) return 'N/A';

    if (t('Lang') === 'fa') return type.name_fa || type.name || '';
    if (t('Lang') === 'ps') return type.name_ps || type.name || '';

    return type.name || '';
  }

  function buildBalanceMap(list, balances, code, language) {
    return list.reduce((map, item) => {
      const bucket = balances?.[item.id] || {};
      const value = Number(bucket[code] || 0);
      const settled = Math.abs(value) < 0.01;
      const amount = Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      map[item.id] = {
        /*
         * Symbol and digits are separate so the row can lay them out from
         * the inline start: the sign leads in RTL (as in the reference),
         * and stays on the left in LTR, without bidi surprises.
         */
        symbol: currencySymbol(code),
        amount,
        label: settled ? t('Balance') : value < 0 ? t('Debit') : t('Credit'),
        tone: settled ? 'settled' : value < 0 ? 'debit' : 'credit',
      };

      return map;
    }, {});
  }

  function matchesSecondAccount(selected, query) {
    if (!query) return true;

    return (
      accountSearchName(selected).toLowerCase().includes(query) ||
      String(selected.code || '').toLowerCase().includes(query) ||
      String(selected.id) === query
    );
  }

  function pickSecondAccount(accountId) {
    second_entry_account = accountId;
    showTrackModal = false;
  }

  /*
   * The list always drops down from the field. A field that sits low in the
   * dialog leaves no room below, so the form itself scrolls by the missing
   * amount first; the panel only flips up when nothing is left to scroll.
   */
  function revealRoomBelow(trigger, needed) {
    let rect = trigger.getBoundingClientRect();
    let node = trigger.parentElement;

    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const scrollable =
        /(auto|scroll)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 1;

      if (scrollable) {
        const deficit = rect.bottom + needed - window.innerHeight;

        if (deficit > 0) {
          node.scrollTop += Math.min(
            deficit,
            node.scrollHeight - node.clientHeight - node.scrollTop,
          );
          rect = trigger.getBoundingClientRect();
        }

        break;
      }

      node = node.parentElement;
    }

    return rect;
  }

  function openSecondAccountPicker(event) {
    second_entry_account_search = '';

    /* Both the chip and the icon button open the list; anchor it to the row
       so the panel spans the field exactly like the reference. */
    const anchor = event.currentTarget.closest('.jv-account-row') || event.currentTarget;
    const viewportPadding = 8;
    const gap = 4;
    const preferredHeight = Math.min(420, window.innerHeight - viewportPadding * 2);
    /* Room for the search row plus a couple of accounts. */
    const minimumBelow = Math.min(280, preferredHeight);
    const rect = revealRoomBelow(anchor, minimumBelow + gap + viewportPadding);
    const maxWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
    const width = Math.min(Math.max(rect.width, Math.min(360, maxWidth)), maxWidth);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding),
    );
    const spaceBelow = Math.max(
      0,
      window.innerHeight - rect.bottom - viewportPadding - gap,
    );
    const spaceAbove = Math.max(0, rect.top - viewportPadding - gap);
    /* Down is the default; up only when below is unusable and above is not. */
    const openBelow = spaceBelow >= 160 || spaceAbove < 160;
    const maxHeight = Math.max(
      120,
      Math.min(preferredHeight, openBelow ? spaceBelow : spaceAbove),
    );
    const top = openBelow
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - maxHeight - gap);

    trackPickerStyle = `top:${Math.max(viewportPadding, top)}px;left:${left}px;width:${width}px;max-height:${maxHeight}px`;
    showTrackModal = true;
  }

  /*
   * The picker list is derived, not mutated on input: typing, pinning and
   * an account reload all recompute it, so the two sections stay correct.
   */
  $: accountQuery = second_entry_account_search.trim().toLowerCase();
  $: matchingSecondAccounts = accounts.filter((item) =>
    matchesSecondAccount(item, accountQuery),
  );
  $: pinnedSecondAccounts = pinnedAccountIds
    .map((value) => matchingSecondAccounts.find((item) => String(item.id) === value))
    .filter(Boolean)
    .sort((a, b) => accountRank(a) - accountRank(b));
  $: unpinnedSecondAccounts = matchingSecondAccounts
    .filter((item) => !pinnedAccountIds.includes(String(item.id)))
    .sort((a, b) => accountRank(a) - accountRank(b));
  $: noTrackVisible =
    Boolean(notrack_ID) &&
    (!accountQuery || t('No Track').toLowerCase().includes(accountQuery));
  $: showPinnedSection = pinnedSecondAccounts.length > 0 || noTrackVisible;
  /* _lang is read on purpose: the labels follow the interface language. */
  $: balanceByAccount = buildBalanceMap(accounts, accountBalances, currency, _lang);
  $: selectedSecondAccount = accounts.find(
    (item) => Number(item.id) === Number(second_entry_account),
  );
  /* The customer box mirrors the reference account field, so it needs the
     whole account record, not just the id it holds. */
  $: selectedFirstAccount = accounts.find(
    (item) => first_entry_account && Number(item.id) === Number(first_entry_account),
  );
  /* Pinned accounts float to the top of the customer list, as in the
     reference list. */
  $: customerAccountRows = [...filteredAccounts].sort(
    (a, b) =>
      accountRank(a) - accountRank(b) ||
      Number(pinnedAccountIds.includes(String(b.id))) -
      Number(pinnedAccountIds.includes(String(a.id))),
  );

  function normalizeSelectedAccountId(value) {
    const normalizedId = Number(value);

    return Number.isFinite(normalizedId) && normalizedId > 0
      ? normalizedId
      : null;
  }

  function applySelectedAccount() {
    /*
     * Do not overwrite the account while an existing journal is
     * being edited. This preselection is only for a new journal.
     */
    if (journalId) return false;

    const normalizedId =
      normalizeSelectedAccountId(selectedAccountID);

    if (!normalizedId || !accounts.length) {
      return false;
    }

    const selectedAccount = accounts.find(
      (item) => Number(item.id) === normalizedId,
    );

    if (!selectedAccount) {
      return false;
    }

    first_entry_account = normalizedId;
    first_entry_account_search =
      getAccountName(normalizedId);
    account = selectedAccount;
    showAccountDropdown = false;

    return true;
  }

  function applyInitialAccount() {
    if (journalId || !initialAccountCode || !accounts.length) return false;

    const selectedAccount = accounts.find(
      (item) =>
        String(item.code || '').toUpperCase() ===
        String(initialAccountCode).toUpperCase(),
    );

    if (!selectedAccount) return false;

    first_entry_account = Number(selectedAccount.id);
    first_entry_account_search = getAccountName(selectedAccount.id);
    account = selectedAccount;
    showAccountDropdown = false;

    return true;
  }

  /*
   * This also handles a selectedAccountID that changes after the
   * component has mounted.
   */
  $: if (
    !journalId &&
    accounts.length > 0
  ) {
    if (!applyInitialAccount() && selectedAccountID) applySelectedAccount();
  }

  function selectCurrency(code) {
    currency = code;
    currencyMenuFor = null;
  }

  function currencySymbol(code) {
    const normalizedCode = String(code ?? '');
    return currencies.find((item) => String(item.code ?? '') === normalizedCode)?.symbol || t(normalizedCode);
  }

  function balanceStatus(value) {
    const amount = Number(value || 0);
    const status = Math.abs(amount) < 0.01 ? 'settled' : amount < 0 ? 'debtor' : 'creditor';
    const labels = {
      en: { settled: 'Settled', debtor: 'Debtor', creditor: 'Creditor' },
      fa: { settled: 'تسویه', debtor: 'بدهکار', creditor: 'طلبکار' },
      ps: { settled: 'تصفیه', debtor: 'پوروړی', creditor: 'طلبکار' },
    };

    return labels[_lang]?.[status] || labels.en[status];
  }

  const counterAccountLabels = {
    en: { creditor: 'Creditor', debtor: 'Debtor' },
    fa: { creditor: 'طلبکار', debtor: 'باقیدار' },
    ps: { creditor: 'طلبکار', debtor: 'پوروړی' },
  };

  $: counterAccountLanguage = counterAccountLabels[_lang] || counterAccountLabels.en;
  $: counterAccountLabel =
    journalSide === 'dr' ? counterAccountLanguage.creditor : counterAccountLanguage.debtor;

  function toggleCurrencyMenu(which) {
    if (isBillCurrencyLocked) return;
    currencyMenuFor = currencyMenuFor === which ? null : which;
  }

  function handleWindowClick(event) {
    if (currencyMenuFor && !event.target.closest('.journal-currency-picker')) {
      currencyMenuFor = null;
    }
    /* The picked bill renders as a button, so blur cannot close its panel. */
    if (showBillDropdown && !event.target.closest('.jv-bill, .jv-dd--bill')) {
      showBillDropdown = false;
    }
  }
  function calculateAccountBalance(accountId, targetCurrency) {
    const balance = accountBalances?.[accountId] || {};

    const amount = Number(balance[targetCurrency] || 0);

    return Object.prototype.toString.call(balance) === '[object Object]'
      ? Object.entries(balance)
          .map(([cur, amt]) =>
            cur == targetCurrency
              ? t('Balance') +
                `: <span dir='ltr' class='text-${amt > 0 ? 'success' : 'danger'}'>${Number(
                  amt,
                ).toFixed(2)}</span> ${t(cur)}`
              : '',
          )
          .join('')
      : '';
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }
  let first_entry_account_search_input = null;
  import { auth } from '../../auth/authStore';
import { currencyApi } from '../../api/currencyApi.js';
import { journalApi } from '../../api/journalApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { saleApi } from '../../api/saleApi.js';
import { purchaseApi } from '../../api/purchaseApi.js';

  /* ---- Bill picker: customer -> sale bills, supplier -> purchase bills ---- */
  let bills = [];
  let showBillDropdown = false;
  let selectedBill = null;
  let billLoading = false;
  /*
   * billSearch is what the input shows (the selected bill's number when
   * one is chosen); billFilter drives the dropdown list, so clicking the
   * input always shows every bill while typing narrows the list.
   */
  let billSearch = '';
  let billFilter = '';

  /*
   * When a bill is selected the payment direction is fixed: a customer's
   * bill is paid by crediting the customer (debit disabled), a supplier's
   * bill by debiting the supplier (credit disabled).
   */
  $: isCustomerBill = Boolean(
    selectedBill && selectedBill._role === 'customer',
  );
  $: isSupplierBill = Boolean(
    selectedBill && selectedBill._role === 'supplier',
  );
  $: isBillCurrencyLocked = Boolean(selectedBill);
  
    /*
     * Reference-style voucher dialog: one amount box at a time, selected from
     * the debit/credit tab list. The two amount fields stay mutually exclusive
     * (typing in one clears the other), so the tab simply exposes that state.
     */
    let journalSide = initialJournalSide;
  
    $: if (Number(first_entry_credit) > 0) journalSide = 'cr';
    $: if (Number(first_entry_debit) > 0) journalSide = 'dr';
    $: amountSide = journalSide === 'dr' ? 'debit' : 'credit';
  
    $: hasBillPicker = Boolean(
      canBeCustomer(first_entry_account) || canBeSupplier(first_entry_account),
    );
  
    /* Before -> after preview of the selected account (credit adds, debit takes). */
    $: firstEntryBefore = Number(
      accountBalances?.[first_entry_account]?.[currency] || 0,
    );
  
    $: firstEntryAfter =
      firstEntryBefore +
      (journalSide === 'cr'
        ? Number(first_entry_credit || 0)
        : -Number(first_entry_debit || 0));
  
    function pickJournalSide(side) {
      if (side === journalSide) return;
  
      journalSide = side;
  
      if (side === 'cr') {
        first_entry_debit = null;
        second_entry_debit = null;
      } else {
        first_entry_credit = null;
        second_entry_credit = null;
      }
    }
  
    function cancelJournal() {
      resetForm();
      dispatch('close');
    }

  /*
   * Live SaleForm-style conversion line, e.g. "7.81 USD = 500 AFN".
   */
  $: conversionHint = (() => {
    if (!selectedBill || !currency || currency === selectedBill.currency) {
      return null;
    }
    const journalAmount = Number(
      first_entry_credit || first_entry_debit || 0,
    );
    if (!journalAmount) return null;
    const paidAmount = exchangeRate(
      journalAmount,
      selectedBill.currency,
      currency,
    );
    return {
      paid: paidAmount,
      paidCurrency: currency,
      journal: journalAmount,
      journalCurrency: selectedBill.currency,
    };
  })();

  function getAccountTypeId(accountId) {
    const acc = accounts.find((a) => Number(a.id) === Number(accountId));
    return acc ? Number(acc.account_type_id) : null;
  }

  function getAccountById(accountId) {
    return accounts.find((a) => Number(a.id) === Number(accountId)) || null;
  }

  function canBeCustomer(accountId) {
    const acc = getAccountById(accountId);
    return Boolean(acc && (Number(acc.account_type_id) === 4 || Number(acc.can_be_customer) === 1));
  }

  function canBeSupplier(accountId) {
    const acc = getAccountById(accountId);
    return Boolean(acc && (Number(acc.account_type_id) === 3 || Number(acc.can_be_supplier) === 1));
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

  function billRemaining(bill) {
    const activePayments = (bill.payments || []).filter((p) => Number(p.status) === 1);
    let totalPayments = activePayments.reduce((sum, p) => {
      if (p.currency === bill.currency) return sum + Number(p.amount || 0);
      return sum + Number(exchangeRate(Number(p.amount || 0), p.currency, bill.currency) || 0);
    }, 0);
    const totalReturns = (bill.returns || [])
      .filter((r) => Number(r.status) === 1)
      .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    return Number(bill.total_amount || 0) - totalPayments - totalReturns;
  }

  function billLabel(bill) {
    return bill.invoice_number || bill.bill_number || `#${bill.id}`;
  }

  async function loadBillsForAccount(accountId) {
    bills = [];
    selectedBill = null;
    showBillDropdown = false;
    billSearch = '';
    billFilter = '';

    const customerCapable = canBeCustomer(accountId);
    const supplierCapable = canBeSupplier(accountId);
    if (!customerCapable && !supplierCapable) return;

    billLoading = true;
    try {
      const [salesResponse, purchasesResponse] = await Promise.all([
        customerCapable
          ? saleApi.getAll({ status: 1, account_id: accountId, relations: 1, limit: 100, skip_count: 1 })
          : Promise.resolve({ data: [] }),
        supplierCapable
          ? purchaseApi.getAll({ status: 1, account_id: accountId, relations: 1, limit: 100, skip_count: 1 })
          : Promise.resolve({ data: [] }),
      ]);

      bills = [
        ...(salesResponse?.data || []).map((bill) => ({ ...bill, _role: 'customer' })),
        ...(purchasesResponse?.data || []).map((bill) => ({ ...bill, _role: 'supplier' })),
      ]
        .filter(
          (b) =>
            Number(b.status) === 1 &&
            (b._role === 'customer'
              ? b.invoice_status === 'confirmed'
              : b.bill_status === 'confirmed'),
        )
        .map((b) => ({ ...b, _remaining: billRemaining(b) }))
        /*
         * Only unpaid bills are shown: once a bill is fully paid it
         * disappears from the picker.
         */
        .filter((b) => Number(b._remaining) > 0)
        .sort((a, b) => Number(a._remaining) - Number(b._remaining));
    } finally {
      billLoading = false;
    }
  }

  function selectBill(bill) {
    selectedBill = bill;
    currency = bill.currency;
    currencyMenuFor = null;
    reference_id = bill.id;
    reference_type = bill._role === 'customer' ? 'sale' : 'purchase';

    const remaining = Number(bill._remaining || 0);
    if (remaining > 0) {
      // Keep the money going to treasury by default (when one exists).
      if (treasury_ID) {
        second_entry_account = treasury_ID;
      }
      if (reference_type === 'sale') {
        // Customer paid us: credit the customer, debit treasury.
        onFirstCreditInput(String(remaining));
      } else {
        // We paid the supplier: debit the supplier, credit treasury.
        onFirstDebitInput(String(remaining));
      }
    }

    if (!description.trim()) {
      description = t('Payment') + ' ' + billLabel(bill);
    }
    showBillDropdown = false;
    billSearch = billLabel(bill);
    billFilter = '';
  }

  function clearBillSelection() {
    selectedBill = null;
    reference_id = null;
    reference_type = null;
    billSearch = '';
    billFilter = '';
  }

  $: filteredBills = billFilter.trim()
    ? bills.filter((bill) => {
        const label = billLabel(bill).toLowerCase();
        return label.includes(billFilter.trim().toLowerCase());
      })
    : bills;

  $: permissions = $auth.permissions;

  /*
   * The reference tints the dialog header tile with the active direction
   * (#DC2626 for debit, #16A34A for credit). QuickEntryModal owns that
   * header, so the tone travels there through one custom property.
   */
  function syncHeaderAccent(side) {
    if (typeof document === 'undefined') return;

    document.documentElement.style.setProperty(
      '--jv-accent',
      side === 'cr' ? '#16A34A' : '#DC2626',
    );
  }

  /*
   * The reference header glyph also follows the direction (north_west for
   * debit, south_east for credit), so publish the side to whichever modal
   * hosts us.
   */
  $: dispatch('side', journalSide);

  $: syncHeaderAccent(journalSide);
</script>

<svelte:window on:click={handleWindowClick} />

{#if !permissions?.some(
  (p) => p.code === 'Journals' && (journalId ? p.edit : p.create),
)}
  <!-- <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3> -->
{:else}
  <div class="journal-form-page" bind:this={componentRoot}>
    <div class="jv-body">
      <div class="jv-tabs" role="tablist" aria-label={t('Direction')}>
        <button
          type="button"
          role="tab"
          aria-selected={journalSide === 'dr'}
          class="jv-tab jv-tab--dr"
          class:is-active={journalSide === 'dr'}
          on:click={() => pickJournalSide('dr')}>
          {t('Debit')}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={journalSide === 'cr'}
          class="jv-tab jv-tab--cr"
          class:is-active={journalSide === 'cr'}
          on:click={() => pickJournalSide('cr')}>
          {t('Credit')}
        </button>
      </div>

      <div class="jv-field">
        <div class="jv-labels" class:jv-labels--split={hasBillPicker}>
          <span class="jv-label">
            {t('Select Customer')}
            <span class="jv-req" aria-hidden="true">*</span>
          </span>

          {#if hasBillPicker}
            <span class="jv-label">{t('Select Bill')}</span>
          {/if}
        </div>

        <div class="jv-grid" class:jv-grid--split={hasBillPicker}>
          <div class="jv-cell">
            <!-- The reference's account box: a tinted icon tile, the name over
                 type · code, the running balance and the unfold_more chevron. -->
            <div
              class="jv-acc"
              class:is-open={showAccountDropdown}
              class:is-empty={!first_entry_account}>
      {#if first_entry_account}
        {@const tint = accountTypeTint(selectedFirstAccount)}
        <span class="jv-acc__tile" style={tint.style} aria-hidden="true">
          <span class="ms">
            {selectedFirstAccount?.code === 'TREASURY' ? 'savings' : tint.icon}
          </span>
        </span>

        <button
          type="button"
          class="jv-acc__picked"
          aria-label={t('Select Customer')}
          on:click={async () => {
            if (selectedAccountID) return;

            first_entry_account = '';
            first_entry_account_search = '';
            showAccountDropdown = true;
            filterCustomerAccounts();

            await tick();
            first_entry_account_search_input?.focus();
          }}>
          <span class="jv-acc__name">
            {getAccountName(first_entry_account)}
          </span>

          {#if selectedFirstAccount}
            <span class="jv-acc__meta">
              {accountTypeLabel(selectedFirstAccount)}
            </span>
          {/if}
        </button>

        {#if balanceByAccount[first_entry_account]}
          <span
            class="jv-acc__bal"
            class:is-debit={balanceByAccount[first_entry_account].tone === 'debit'}
            class:is-credit={balanceByAccount[first_entry_account].tone === 'credit'}
            class:is-settled={balanceByAccount[first_entry_account].tone === 'settled'}>
            <b dir="rtl">
              {balanceByAccount[first_entry_account].amount}
              <span class="jv-acc__cur">{balanceByAccount[first_entry_account].symbol}</span>
            </b>
            <small>{balanceByAccount[first_entry_account].label}</small>
          </span>
        {/if}
      {:else}
        <span class="ms jv-acc__icon" aria-hidden="true">person</span>

        <input
          type="text"
          class="jv-acc__input"
          id="form_account_search"
          bind:this={first_entry_account_search_input}
          bind:value={first_entry_account_search}
          placeholder={t('Select Customer')}
          aria-label={t('Select Customer')}
          autocomplete="off"
          on:input={() => {
            showAccountDropdown = true;
            filterCustomerAccounts();
          }}
          on:focus={() => {
            showAccountDropdown = true;
            filterCustomerAccounts();
          }}
          on:blur={(event) => {
            /* Focus moving into the panel's own search box keeps it open. */
            if (event.relatedTarget?.closest?.('.jv-dd')) return;

            setTimeout(() => (showAccountDropdown = false), 150);
          }} />
      {/if}

              <span class="ms jv-acc__chev" aria-hidden="true">unfold_more</span>
            </div>

            {#if showAccountDropdown}
              <div class="jv-dd" role="listbox">
                <div class="jv-dd__head">
                  <label class="jv-dd__search" for="form_account_panel_search">
                    <span class="ms" aria-hidden="true">search</span>

                    <input
                      id="form_account_panel_search"
                      type="search"
                      autocomplete="off"
                      value={first_entry_account_search}
                      placeholder={t('Search accounts...')}
                      aria-label={t('Search accounts...')}
                      on:input={(event) => {
                        first_entry_account_search = event.currentTarget.value;
                        filterCustomerAccounts();
                      }} />
                  </label>

                  <button
                    type="button"
                    class="jv-dd__add"
                    title={t('Add Account')}
                    aria-label={t('Add Account')}
                    on:click={() => modalRefAdd.openModal()}>
                    <span class="ms" aria-hidden="true">person_add</span>
                    {t('New')}
                  </button>
                </div>

                <div class="jv-dd__list">
                  {#each customerAccountRows as acc (acc.id)}
                    {@const tint = accountTypeTint(acc)}
                    <div class="jv-opt-row">
                      <button
                        type="button"
                        role="option"
                        aria-selected={first_entry_account === acc.id}
                        class="jv-opt"
                        class:is-selected={first_entry_account === acc.id}
                        on:mousedown|preventDefault={() => {
                          first_entry_account = acc.id;
                          first_entry_account_search = accountSearchName(acc);
                          showAccountDropdown = false;
                          loadBillsForAccount(acc.id);
                        }}>
                        <span class="jv-opt__tile" style={tint.style} aria-hidden="true">
                          <span class="ms">{tint.icon}</span>
                        </span>

                        <span class="jv-opt__copy">
                          <strong>{accountSearchName(acc)}</strong>
                          <small>
                            {accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}
                          </small>
                        </span>

                        {#if balanceByAccount[acc.id]}
                          <span
                            class="jv-opt__bal"
                            class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                            class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                            class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                            <b dir="rtl">
                              {balanceByAccount[acc.id].amount}
                              <span class="jv-opt__cur">{balanceByAccount[acc.id].symbol}</span>
                            </b>
                          </span>
                        {/if}
                      </button>

                      <button
                        type="button"
                        class="jv-opt__pin"
                        class:is-on={pinnedAccountIds.includes(String(acc.id))}
                        aria-pressed={pinnedAccountIds.includes(String(acc.id))}
                        title={pinnedAccountIds.includes(String(acc.id))
                          ? t('Unpin account')
                          : t('Pin account')}
                        aria-label={pinnedAccountIds.includes(String(acc.id))
                          ? t('Unpin account')
                          : t('Pin account')}
                        on:click|stopPropagation={() => toggleAccountPin(acc.id)}>
                        <span class="ms" aria-hidden="true">keep</span>
                      </button>
                    </div>
                  {/each}

                  {#if filteredAccounts.length === 0}
                    <div class="jv-dd__empty">{t('No accounts found')}</div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

  <AccountModal
    bind:this={modalRefAdd}
    {accountTypes}
    on:saved={async (e) => {
      await loadAccounts();
      first_entry_account = e.detail.account.id;
      first_entry_account_search = '';
      loadBillsForAccount(e.detail.account.id);
    }} />

          {#if hasBillPicker}
            <div class="jv-cell">
              <div
                class="jv-bill"
                class:is-open={showBillDropdown}
                class:is-picked={Boolean(selectedBill)}>
                <span class="ms jv-bill__icon" aria-hidden="true">receipt_long</span>

                {#if selectedBill}
                  <button
                    type="button"
                    class="jv-bill__picked"
                    aria-haspopup="listbox"
                    aria-expanded={showBillDropdown}
                    title="{t('Bill')} {billLabel(selectedBill)} · {t('Remaining')}"
                    on:click={() => (showBillDropdown = !showBillDropdown)}>
                    <span class="jv-bill__stack">
                      <b dir="ltr">{billLabel(selectedBill)}</b>
                      <span class="jv-bill__sub" dir="rtl">
                        {Number(selectedBill._remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span class="jv-bill__cur">{currencySymbol(selectedBill.currency)}</span>
                      </span>
                    </span>
                  </button>
                {:else}
                  <input
                    type="text"
                    class="jv-bill__input"
                    id="journal_bill_search"
                    bind:value={billSearch}
                    placeholder={
                      billLoading
                        ? t('Loading...')
                        : bills.length
                          ? t('Search bills...')
                          : t('No bills')
                    }
                    aria-label={t('Search bills...')}
                    autocomplete="off"
                    on:input={() => {
                      billFilter = billSearch;
                      showBillDropdown = true;
                    }}
                    on:focus={() => {
                      showBillDropdown = true;
                    }}
                    on:blur={() =>
                      setTimeout(() => (showBillDropdown = false), 150)} />

                  {#if bills.length > 0}
                    <span class="jv-bill__count">{bills.length}</span>
                  {/if}
                {/if}
              </div>

              {#if showBillDropdown && bills.length > 0}
                <div class="jv-dd jv-dd--bill" role="listbox" aria-label={t('Bills')}>
                  <button
                    type="button"
                    class="jv-bill-opt jv-bill-opt--clear"
                    on:mousedown|preventDefault={() => {
                      clearBillSelection();
                      showBillDropdown = false;
                    }}>
                    <span class="ms" aria-hidden="true">block</span>
                    <span class="jv-bill-opt__clear">{t('No Bill')}</span>
                  </button>

                  {#each filteredBills as bill (bill.id)}
                    <button
                      type="button"
                      role="option"
                      aria-selected={Boolean(selectedBill && Number(selectedBill.id) === Number(bill.id))}
                      class="jv-bill-opt"
                      class:is-selected={selectedBill && Number(selectedBill.id) === Number(bill.id)}
                      title="{bill._role === 'customer' ? t('Customer Receivable') : t('Supplier Payable')} · {t('Total')} {Number(bill.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}"
                      on:mousedown|preventDefault={() => selectBill(bill)}>
                      <span class="ms jv-bill-opt__icon" aria-hidden="true">receipt_long</span>

                      <span class="jv-bill-opt__copy">
                        <b class="jv-bill-opt__ref" dir="ltr">{billLabel(bill)}</b>
                        <small>
                          {bill._role === 'customer' ? t('Sale') : t('Purchase')}
                          &nbsp;·&nbsp;
                          {@html showDate(bill.invoice_date || bill.bill_date, 'justPersian')}
                        </small>
                      </span>

                      <b class="jv-bill-opt__amt" dir="rtl">
                        {Number(bill._remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span class="jv-bill-opt__cur">{currencySymbol(bill.currency)}</span>
                      </b>
                    </button>
                  {/each}

                  {#if filteredBills.length === 0}
                    <div class="jv-dd__empty">{t('No bills found')}</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="jv-grid jv-grid--amount">
        <div class="jv-cell">
          <label
            class="jv-label"
            for={journalSide === 'dr' ? 'first_entry_debit' : 'first_entry_credit'}>
            {t('Amount')}
            <span class="jv-req" aria-hidden="true">*</span>
          </label>

          <div
            class="jv-amount"
            class:is-invalid={journalSide === 'dr'
              ? second_entry_account == treasury_ID &&
                parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1
              : first_entry_account == treasury_ID &&
                parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1}>
            {#if journalSide === 'dr'}
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="first_entry_debit"
                class="jv-amount__input"
                placeholder="0"
                value={format(toDisplayAmount(first_entry_debit))}
                disabled={isCustomerBill}
                title={isCustomerBill ? t('Disabled for customer bill payment') : ''}
                on:keydown={onlyNumbers}
                on:input={(e) => onFirstDebitInput(normalize(e.target.value))} />
            {:else}
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="first_entry_credit"
                class="jv-amount__input"
                placeholder="0"
                value={format(toDisplayAmount(first_entry_credit))}
                disabled={isSupplierBill}
                title={isSupplierBill ? t('Disabled for supplier bill payment') : ''}
                on:keydown={onlyNumbers}
                on:input={(e) => onFirstCreditInput(normalize(e.target.value))} />
            {/if}

            <div class="journal-currency-picker">
              <button
                id="journalCurrencyDropdown"
                class="journal-currency-picker__btn"
                type="button"
                disabled={isBillCurrencyLocked}
                aria-expanded={currencyMenuFor === amountSide}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                title={isBillCurrencyLocked ? t('Locked to bill currency') : ''}
                on:click|stopPropagation={() => toggleCurrencyMenu(amountSide)}>
                <span>{currencySymbol(currency)}</span>
                <span class="ms" aria-hidden="true">
                  {isBillCurrencyLocked ? 'lock' : 'expand_more'}
                </span>
              </button>

              {#if currencyMenuFor === amountSide}
                <ul class="journal-currency-menu" role="listbox">
                  {#each currencies as cur}
                    <li role="option" aria-selected={currency === cur.code}>
                      <button
                        class="journal-currency-menu__item"
                        class:selected={currency === cur.code}
                        on:click|stopPropagation={() => selectCurrency(cur.code)}
                        type="button">
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

          <!-- The sufficiency error sits under the whole row, not inside the
               cell: inside it would stretch the amount cell and push the
               reference box out of line (the grid aligns on the bottom edge). -->
        </div>
        <label class="jv-cell jv-cell--ref" for="c-reference">
          <span class="jv-label">{t('Reference')}</span>

          <span class="jv-box">
            <span class="ms jv-box__icon" aria-hidden="true">tag</span>

            <input
              id="c-reference"
              class="jv-box__input"
              type="text"
              maxlength="255"
              placeholder={t('Reference')}
              bind:value={reference} />
          </span>
        </label>
      </div>

      {#if journalSide === 'dr' &&
      second_entry_account == treasury_ID &&
      parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1}
        <div class="jv-err">
          {t("Treasury Account doesn't have enough funds.")}
        </div>
      {:else if journalSide === 'cr' &&
      first_entry_account == treasury_ID &&
      parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1}
        <div class="jv-err">
          {t("Treasury Account doesn't have enough funds.")}
        </div>
      {/if}
      {#if conversionHint}
        <div class="jv-hint">
          <span class="ms jv-hint__icon" aria-hidden="true">swap_horiz</span>

          <span class="jv-hint__copy">
            {t('Payment')}:
            <span dir="ltr">{Number(conversionHint.paid).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            {t(conversionHint.paidCurrency)}
            =&nbsp;
            <span dir="ltr">{Number(conversionHint.journal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            {t(conversionHint.journalCurrency)}
          </span>
        </div>
      {/if}

      <div class="jv-row jv-row--ctr">
        <div class="jv-cell">
          <span class="jv-label">
            {counterAccountLabel}
          </span>

          <div class="jv-account-row">
            <button
              id="second_entry_account_search"
              type="button"
              class="jv-account-select"
              class:is-selected={second_entry_account == notrack_ID || selectedSecondAccount}
              aria-label={t('Account')}
              aria-required="true"
              aria-haspopup="dialog"
              aria-expanded={showTrackModal}
              on:click={openSecondAccountPicker}>
              <span class="ms jv-account-select__icon" aria-hidden="true">
                {selectedSecondAccount?.code === 'TREASURY' ? 'savings' : 'account_balance_wallet'}
              </span>

              <strong class="jv-account-select__name">
                {second_entry_account == notrack_ID
                  ? t('No Track')
                  : selectedSecondAccount
                    ? accountSearchName(selectedSecondAccount)
                    : t('Select Account')}
              </strong>
            </button>

            <button
              type="button"
              class="jv-account-toggle"
              class:is-on={showTrackModal}
              aria-label={t('Account')}
              aria-haspopup="dialog"
              aria-expanded={showTrackModal}
              title={t('Account')}
              on:click={openSecondAccountPicker}>
              <span class="ms" aria-hidden="true">person_search</span>
            </button>
          </div>

        </div>

        <div class="jv-cell jv-cell--date">
          <span class="jv-label">{t('Date')}</span>

          <div class="jv-date persianDatePicker">
            <input
              type="date"
              class="jv-date__input"
              data-bind="date"
              bind:value={date} />
            <span class="input-group-text persian-date-text"></span>
          </div>
        </div>
      </div>

      <label class="jv-desc" for="c-description">
        <span class="jv-label">{t('Description')}</span>

        <textarea
          id="c-description"
          class="jv-desc__box"
          rows="3"
          placeholder={t('Description')}
          bind:value={description}></textarea>
      </label>

      <div class="jv-balance">
        <span class="jv-balance__side">
          {t('Lang') === 'fa' ? 'فعلی' : t('Lang') === 'ps' ? 'اوسنی' : t('Current')}
          <span class="jv-balance__value">
            <b dir="ltr" class:has-debt={firstEntryBefore < -0.01} class:has-credit={firstEntryBefore > 0.01} class:is-settled={Math.abs(firstEntryBefore || 0) < 0.01}>
              {Number(firstEntryBefore || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </b>
            <span class="jv-balance__symbol">{currencySymbol(currency)}</span>
            <small>{balanceStatus(firstEntryBefore)}</small>
          </span>
        </span>

        <span class="ms jv-balance__arrow" aria-hidden="true">arrow_back</span>

        <span class="jv-balance__side jv-balance__side--end">
          {t('Lang') === 'fa' ? 'بعد' : t('Lang') === 'ps' ? 'وروسته' : t('New')}
          <span class="jv-balance__value">
            <b dir="ltr" class:has-debt={firstEntryAfter < -0.01} class:has-credit={firstEntryAfter > 0.01} class:is-settled={Math.abs(firstEntryAfter || 0) < 0.01}>
              {Number(firstEntryAfter || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </b>
            <span class="jv-balance__symbol">{currencySymbol(currency)}</span>
            <small>{balanceStatus(firstEntryAfter)}</small>
          </span>
        </span>
      </div>
            {#if showTrackModal}
              <div
                use:portal
                class="jvp-layer"
                role="presentation"
                on:click|self={() => (showTrackModal = false)}>
                <div
                  class="jvp-modal"
                  id="trackModal"
                  role="dialog"
                  aria-label={t('Account')}
                  style={trackPickerStyle}
                  data-lang={_lang}>
                  <div class="jvp-body">
                    <div class="jvp-search">
                      <label class="jvp-search__box" for="jvp-search">
                        <span class="ms" aria-hidden="true">search</span>

                        <input
                          id="jvp-search"
                          type="search"
                          autocomplete="off"
                          placeholder={t('Search accounts...')}
                          bind:value={second_entry_account_search} />
                      </label>

                      <button
                        type="button"
                        class="jvp-new"
                        title={t('Add Account')}
                        aria-label={t('Add Account')}
                        on:click={() => {
                          /*
                           * The account form is an AppModal (10050) nested in
                           * the journal dialog, so it cannot paint over this
                           * portaled layer: the list steps aside while the
                           * form is open and the saved event brings the user
                           * back with the new account already selected.
                           */
                          showTrackModal = false;
                          modalRef?.openModal();
                        }}>
                        <span class="ms" aria-hidden="true">person_add</span>
                        {t('New')}
                      </button>
                    </div>

                    <div class="jvp-list" role="listbox" aria-label={t('Account')}>
                      {#if showPinnedSection}
                        <span class="jvp-sect">
                          <span class="ms f" aria-hidden="true">keep</span>
                          {t('Pinned')}
                        </span>
                      {/if}

                      {#if noTrackVisible}
                        <button
                          type="button"
                          role="option"
                          aria-selected={second_entry_account == notrack_ID}
                          class="jvp-row jvp-row--none"
                          class:is-selected={second_entry_account == notrack_ID}
                          on:click={() => pickSecondAccount(notrack_ID)}>
                          <span class="jvp-row__tile" aria-hidden="true">
                            <span class="ms">block</span>
                          </span>

                          <span class="jvp-row__copy">
                            <strong>{t('No Track')}</strong>
                            <small>{t('One-sided entry · no counter account')}</small>
                          </span>
                        </button>
                      {/if}

                      {#each pinnedSecondAccounts as acc (acc.id)}
                        {@const tint = accountTypeTint(acc)}
                        <div class="jvp-row-wrap">
                          <button
                            type="button"
                            role="option"
                            aria-selected={Number(second_entry_account) === Number(acc.id)}
                            class="jvp-row"
                            class:is-selected={Number(second_entry_account) === Number(acc.id)}
                            on:click={() => pickSecondAccount(acc.id)}>
                            <span class="jvp-row__avatar" style={tint.style} aria-hidden="true">
                              <span class="ms">
                                {acc.code === 'TREASURY' ? 'savings' : tint.icon}
                              </span>
                            </span>

                            <span class="jvp-row__copy">
                              <strong>{accountSearchName(acc)}</strong>
                              <small>
                                {accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}
                              </small>
                            </span>

                            {#if balanceByAccount[acc.id]}
                              <span
                                class="jvp-row__bal"
                                class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                                class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                                class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                                <b dir="rtl">
                                  {balanceByAccount[acc.id].amount}
                                  <span class="jvp-row__cur">{balanceByAccount[acc.id].symbol}</span>
                                </b>
                              </span>
                            {/if}
                          </button>

                          <button
                            type="button"
                            class="jvp-pin"
                            class:is-on={true}
                            title={t('Unpin account')}
                            aria-label={t('Unpin account')}
                            on:click={() => toggleAccountPin(acc.id)}>
                            <span class="ms f" aria-hidden="true">keep</span>
                          </button>
                        </div>
                      {/each}

                      {#if unpinnedSecondAccounts.length > 0}
                        <span class="jvp-sect">{t('All Accounts')}</span>
                      {/if}

                      {#each unpinnedSecondAccounts as acc (acc.id)}
                        {@const tint = accountTypeTint(acc)}
                        <div class="jvp-row-wrap">
                          <button
                            type="button"
                            role="option"
                            aria-selected={Number(second_entry_account) === Number(acc.id)}
                            class="jvp-row"
                            class:is-selected={Number(second_entry_account) === Number(acc.id)}
                            on:click={() => pickSecondAccount(acc.id)}>
                            <span class="jvp-row__avatar" style={tint.style} aria-hidden="true">
                              <span class="ms">
                                {acc.code === 'TREASURY' ? 'savings' : tint.icon}
                              </span>
                            </span>

                            <span class="jvp-row__copy">
                              <strong>{accountSearchName(acc)}</strong>
                              <small>
                                {accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}
                              </small>
                            </span>

                            {#if balanceByAccount[acc.id]}
                              <span
                                class="jvp-row__bal"
                                class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                                class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                                class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                                <b dir="rtl">
                                  {balanceByAccount[acc.id].amount}
                                  <span class="jvp-row__cur">{balanceByAccount[acc.id].symbol}</span>
                                </b>
                              </span>
                            {/if}
                          </button>

                          <button
                            type="button"
                            class="jvp-pin"
                            title={t('Pin account')}
                            aria-label={t('Pin account')}
                            on:click={() => toggleAccountPin(acc.id)}>
                            <span class="ms" aria-hidden="true">keep</span>
                          </button>
                        </div>
                      {/each}

                      {#if matchingSecondAccounts.length === 0}
                        <div class="jvp-empty">{t('No accounts found')}</div>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/if}
            <AccountModal
              bind:this={modalRef}
              {accountTypes}
              on:saved={async (e) => {
                await loadAccounts();
                second_entry_account = e.detail.account.id;
                showTrackModal = false;
                setTimeout(() => {
                  if (window.mdb) {
                    document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                  }
                }, 100);
              }} />
          <div class="d-none">
            <label class="form-label">Debit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_debit}
              on:input={(e) => onSecondDebitInput(e.target.value)} />
          </div>
          <div class="d-none">
            <label class="form-label">Credit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_credit}
              on:input={(e) => onSecondCreditInput(e.target.value)} />
          </div>
    </div>

    <div class="jv-foot">
      <button type="button" class="jv-btn jv-btn--cancel" on:click={cancelJournal}>
        {t('Cancel')}
      </button>

      <button
        type="button"
        class="jv-btn jv-btn--save"
        class:is-cr={journalSide === 'cr'}
        class:is-saving={saving}
        disabled={saving}
        aria-busy={saving}
        on:click={saveJournal}>
        <span class="ms jv-btn__icon" aria-hidden="true">check</span>
        {saving
          ? t('Saving...')
          : journalId
            ? t('Update Journal')
            : t('Add Journal')}
      </button>
    </div>
  </div>
  {#if showReceipt}
    <div use:portal>
      <JournalReceiptModal journal={savedJournal} on:close={closeReceipt} />
    </div>
  {/if}
  {#if showA4Receipt}
    <div use:portal>
      <JournalA4ReceiptModal
        journal={savedJournal}
        on:close={closeReceipt}
        on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
    </div>
  {/if}
{/if}

<style>
  /* =========================================================================
     Add Journal voucher — the visual contract mirrors the reference
     "Create Journal" dialog (Journal.dc.html): 520px shell, 10px stacked
     sections, 40px boxes, 30px direction tabs, 32px footer actions.
     Every value reads from the shared --z-* tokens so dark mode is free.
     ========================================================================= */

  :global(.quick-entry-modal.receipt-open) {
    visibility: hidden;
  }

  .journal-form-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    color: var(--z-text);
    font-family: var(--z-font);
  }

  .jv-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 12px 14px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* ---- direction tabs ---- */
  .jv-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--z-surface-3);
  }

  .jv-tab {
    height: 30px;
    border: 0;
    border-radius: 7px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-tab--dr {
    color: var(--z-debit);
    background: color-mix(in srgb, var(--z-debit) 10%, var(--z-surface));
  }

  .jv-tab--cr {
    color: var(--z-credit);
    background: color-mix(in srgb, var(--z-credit) 10%, var(--z-surface));
  }

  .jv-tab--dr.is-active {
    color: #ffffff;
    font-weight: 800;
    background: var(--z-debit);
    box-shadow: 0 4px 10px -4px var(--z-debit);
  }

  .jv-tab--cr.is-active {
    color: #ffffff;
    font-weight: 800;
    background: var(--z-credit);
    box-shadow: 0 4px 10px -4px var(--z-credit);
  }

  /* ---- field scaffolding ---- */
  .jv-field,
  .jv-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .jv-cell {
    position: relative;
  }

  .jv-labels,
  .jv-grid,
  .jv-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .jv-labels--split,
  .jv-grid--split {
    grid-template-columns: minmax(0, 1fr) 150px;
  }

  .jv-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--z-text);
  }

  .jv-req {
    color: var(--z-danger);
  }

  /* ---- account box ---- */
  .jv-acc {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 9px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-acc.is-empty {
    border-style: dashed;
    border-color: var(--z-border-strong);
    background: var(--z-surface-2);
  }

  .jv-acc.is-open,
  .jv-acc:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  /* Tint and glyph come from the account class (inline style), exactly as
     the reference paints the account avatar. */
  .jv-acc__tile {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 15px;
  }

  .jv-acc__icon,
  .jv-acc__chev {
    flex: 0 0 auto;
    font-size: 18px;
    color: var(--z-subtle);
  }

  .jv-acc__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  .jv-acc__input::placeholder {
    color: var(--z-subtle);
    font-weight: 600;
  }

  .jv-acc__picked {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    line-height: 1.25;
    text-align: start;
    cursor: pointer;
  }

  .jv-acc__name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  /* type · code, exactly the second line of the reference account box. */
  .jv-acc__meta {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    color: var(--z-muted);
  }

  .jv-acc__bal {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    line-height: 1.25;
    text-align: end;
  }

  .jv-acc__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .jv-acc__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .jv-acc__bal small {
    font-size: 9.5px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--z-muted);
  }

  /* Only the amount takes the tone: `--danger-text` for a debit balance,
     `--ok-text` for a credit one and `--muted` once it settles at zero.
     The باقیدار / طلبکار caption stays muted, as in the reference. */
  .jv-acc__bal.is-debit b {
    color: var(--z-danger);
  }

  .jv-acc__bal.is-credit b {
    color: var(--z-ok);
  }

  .jv-acc__bal.is-settled b {
    color: var(--z-muted);
  }

  /* ---- bill box ---- */
  .jv-bill {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 10px;
    border: 1px solid var(--z-border);
    border-radius: 9px;
    background: var(--z-surface);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-bill.is-open,
  .jv-bill:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jv-bill.is-picked {
    border-color: var(--z-link);
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .jv-bill__icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .jv-bill.is-picked .jv-bill__icon {
    color: var(--z-link);
  }

  /* Reference trigger, picked state: the bill number over its remaining amount. */
  .jv-bill__picked {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }

  .jv-bill__stack {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .jv-bill__stack b {
    display: block;
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Reference trigger: the picked bill's remaining amount under the number. */
  .jv-bill__sub {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    color: var(--z-muted);
  }

  .jv-bill__cur {
    font-size: 9.5px;
    font-weight: 600;
    opacity: 0.75;
  }

  /* Reference badge: the bill count while nothing is picked. */
  .jv-bill__count {
    flex: 0 0 auto;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--z-surface-3);
    color: var(--z-muted);
    font-family: var(--z-font-num);
    font-size: 10px;
    font-weight: 800;
    line-height: 16px;
  }

  .jv-bill__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  .jv-bill__input::placeholder {
    color: var(--z-subtle);
  }

  .jv-bill.is-picked .jv-bill__input {
    color: var(--z-link);
  }

  /* ---- dropdowns ---- */
  .jv-dd {
    position: absolute;
    top: 44px;
    inset-inline: 0;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--z-border);
    border-radius: 10px;
    background: var(--z-surface);
    box-shadow: var(--z-sh-pop);
  }

  /* Reference bill panel: anchored to the end edge, 260px wide, tight rows. */
  .jv-dd--bill {
    inset-inline-start: auto;
    inset-inline-end: 0;
    width: 260px;
    max-width: calc(100vw - 32px);
    gap: 1px;
    max-height: 260px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Reference row: plain receipt glyph, ref over "type · date", amount last. */
  .jv-bill-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    font: inherit;
    font-size: 12px;
    color: var(--z-ink);
    text-align: start;
    box-sizing: border-box;
    cursor: pointer;
  }

  .jv-bill-opt:hover {
    background: var(--z-surface-2);
  }

  .jv-bill-opt.is-selected {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .jv-bill-opt__icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .jv-bill-opt.is-selected .jv-bill-opt__icon {
    color: var(--z-link);
  }

  .jv-bill-opt__copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .jv-bill-opt__ref {
    display: block;
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jv-bill-opt__copy small {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--z-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jv-bill-opt.is-selected .jv-bill-opt__copy small {
    color: var(--z-link);
    opacity: 0.8;
  }

  .jv-bill-opt__amt {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
  }

  .jv-bill-opt__cur {
    font-size: 9.5px;
    font-weight: 600;
    color: var(--z-subtle);
  }

  .jv-bill-opt.is-selected .jv-bill-opt__cur {
    color: var(--z-link);
    opacity: 0.75;
  }

  .jv-bill-opt--clear {
    min-height: 32px;
    font-size: 12px;
    font-weight: 600;
    color: var(--z-muted);
  }

  .jv-bill-opt--clear .ms {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .jv-bill-opt__clear {
    flex: 1 1 auto;
    text-align: start;
  }

  .jv-dd__head {
    display: flex;
    gap: 4px;
  }

  /* Reference search row: a soft field with a leading glyph, and the
     brand-soft "new" chip beside it. */
  .jv-dd__search {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--z-border-soft);
    border-radius: 7px;
    background: var(--z-surface-2);
    color: var(--z-subtle);
  }

  .jv-dd__search .ms {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .jv-dd__search input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    color: var(--z-ink);
  }

  .jv-dd__search input::placeholder {
    color: var(--z-subtle);
  }

  .jv-dd__search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .jv-dd__add {
    flex: 0 0 auto;
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .jv-dd__add .ms {
    font-size: 16px;
  }

  .jv-dd__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 220px;
    overflow-y: auto;
  }

  .jv-dd__empty {
    padding: 10px;
    text-align: center;
    font-size: 11.5px;
    color: var(--z-subtle);
  }

  .jv-opt-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .jv-opt {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .jv-opt:hover {
    background: var(--z-surface-2);
  }

  .jv-opt.is-selected {
    background: var(--z-brand-soft);
  }

  /* The tile colour comes from the account class (inline style). */
  .jv-opt__tile {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
  }

  .jv-opt__tile .ms {
    font-size: 15px;
  }

  .jv-opt__copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .jv-opt__copy strong {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  .jv-opt__copy small {
    font-size: 10px;
    color: var(--z-muted);
  }

  /* Customer rows are single-line: a name above code · type. */
  .jv-opt-row .jv-opt__copy strong,
  .jv-opt-row .jv-opt__copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jv-opt__bal {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    line-height: 1.25;
    text-align: end;
  }

  .jv-opt__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .jv-opt__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .jv-opt__bal small {
    font-size: 9.5px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--z-muted);
  }

  .jv-opt__bal.is-debit b {
    color: var(--z-danger);
  }

  .jv-opt__bal.is-credit b {
    color: var(--z-ok);
  }

  .jv-opt__bal.is-settled b {
    color: var(--z-muted);
  }

  .jv-opt__pin {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-inline-end: 2px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-subtle);
    font: inherit;
    font-size: 16px;
    cursor: pointer;
    opacity: 0.75;
  }

  .jv-opt__pin:hover {
    background: var(--z-surface-2);
    color: var(--z-link);
  }

  .jv-opt__pin.is-on {
    color: var(--z-link);
    opacity: 1;
  }

  /* ---- amount ---- */
  .jv-grid--amount {
    grid-template-columns: minmax(0, 1fr) 150px;
    align-items: end;
  }

  .jv-amount {
    display: flex;
    align-items: center;
    height: 40px;
    border: 1.5px solid var(--z-border);
    border-radius: 9px;
    background: var(--z-surface);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-amount:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jv-amount.is-invalid,
  .jv-amount.is-invalid:focus-within {
    border-color: var(--z-danger);
    box-shadow: none;
  }

  .jv-amount__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0 12px;
    border: 0;
    outline: 0;
    background: transparent;
    font-family: var(--z-font-num);
    font-size: 18px;
    font-weight: 800;
    color: var(--z-ink);
    direction: ltr;
    text-align: right;
  }

  .jv-amount__input::placeholder {
    color: var(--z-subtle);
  }

  .jv-amount__input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .jv-err {
    margin-top: 2px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--z-danger);
  }

  /* ---- currency picker (class names kept for the click-outside handler) ---- */
  .journal-currency-picker {
    position: relative;
    flex: 0 0 auto;
    margin-inline-end: 5px;
  }

  .journal-currency-picker__btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 0 4px 0 6px;
    border: 0;
    border-radius: 7px;
    background: var(--z-surface-3);
    font-family: var(--z-font-num);
    font-size: 13px;
    font-weight: 800;
    color: var(--z-ink);
    cursor: pointer;
  }

  .journal-currency-picker__btn .ms {
    font-size: 15px;
    color: var(--z-muted);
  }

  .journal-currency-picker__btn:disabled {
    opacity: 0.85;
    cursor: not-allowed;
  }

  .journal-currency-menu {
    position: absolute;
    top: 32px;
    inset-inline-end: 0;
    z-index: 7;
    width: 150px;
    margin: 0;
    padding: 4px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--z-border);
    border-radius: 10px;
    background: var(--z-surface);
    box-shadow: var(--z-sh-pop);
  }

  .journal-currency-menu__item {
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .journal-currency-menu__item:hover {
    background: var(--z-surface-2);
  }

  .journal-currency-menu__item.selected {
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-weight: 800;
  }

  /* ---- reference ---- */
  .jv-box {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 10px;
    border: 1.5px solid var(--z-border);
    border-radius: 9px;
    background: var(--z-surface);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-box:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jv-box__icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .jv-box__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font-family: var(--z-font-num);
    font-size: 13px;
    font-weight: 700;
    color: var(--z-ink);
    direction: ltr;
    text-align: right;
  }

  .jv-box__input::placeholder {
    color: var(--z-subtle);
    font-weight: 600;
  }

  /* ---- counter account + date ---- */
  .jv-row--ctr {
    grid-template-columns: minmax(0, 1fr) 124px;
    align-items: start;
  }

  /* The reference sizes this row as a 32px chip plus a 34x32 icon button,
     which is what makes it read shorter than the other fields. */
  .jv-account-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .jv-account-select {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px dashed var(--z-border-strong);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-subtle);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      color 0.15s ease;
  }

  .jv-account-select:hover,
  .jv-account-select[aria-expanded='true'] {
    border-color: var(--z-link);
    color: var(--z-link);
  }

  /* Selected state is the reference chip: brand-soft fill, solid brand
     border and brand text instead of the dashed empty-field hint. */
  .jv-account-select.is-selected {
    border-style: solid;
    border-color: currentColor;
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .jv-account-select:focus-visible {
    outline: 2px solid var(--z-link);
    outline-offset: 2px;
  }

  .jv-account-select__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .jv-account-select.is-selected .jv-account-select__icon {
    color: inherit;
  }

  .jv-account-select__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 11.5px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
  }

  .jv-account-toggle {
    flex: 0 0 auto;
    width: 34px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--z-border-strong);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-text);
    font: inherit;
    font-size: 18px;
    cursor: pointer;
  }

  .jv-account-toggle:hover,
  .jv-account-toggle.is-on {
    border-style: solid;
    border-color: var(--z-link);
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .jv-account-toggle:focus-visible {
    outline: 2px solid var(--z-link);
    outline-offset: 2px;
  }

  .jv-cell--date {
    width: 124px;
  }

  .jv-date {
    display: flex;
    align-items: center;
    height: 32px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-date:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jv-date > input[type='date'] {
    display: none;
  }

  .jv-date :global(.legacy-app-date-picker-host) {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .jv-date :global(.app-date-field) {
    display: block;
    width: 100%;
    height: 100%;
    gap: 0;
  }

  .jv-date :global(.app-date-field .date-label) {
    display: none;
  }

  .jv-date :global(.pdp),
  .jv-date :global(.pdp-group) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .jv-row .jv-cell--date .jv-date :global(.persianDatePicker .pdp-input) {
    width: 100%;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 8px !important;
    border: 0 !important;
    border-radius: 8px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
    direction: ltr;
    text-align: right !important;
  }

  /* ---- description ---- */
  .jv-desc {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .jv-desc__box {
    width: 100%;
    min-height: 64px;
    padding: 7px 9px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.7;
    resize: vertical;
    box-sizing: border-box;
    outline: 0;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jv-desc__box:focus {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jv-desc__box::placeholder {
    color: var(--z-subtle);
  }

  /* ---- conversion hint ---- */
  .jv-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 9px;
    border: 1px solid var(--z-border-soft);
    border-radius: 8px;
    background: var(--z-surface-2);
    color: var(--z-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .jv-hint__icon {
    flex: 0 0 auto;
    font-size: 15px;
    color: var(--z-link);
  }

  .jv-hint__copy {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---- before / after balance ---- */
  .jv-balance {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border: 1px solid var(--z-border-soft);
    border-radius: 10px;
    background: var(--z-surface-2);
  }

  .jv-balance__side {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--z-muted);
  }

  .jv-balance__side--end {
    align-items: flex-end;
  }

  .jv-balance__value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--z-font-num);
    color: var(--z-ink);
  }

  .jv-balance__value b {
    font-size: 15px;
    font-weight: 800;
    color: var(--z-ink);
  }

  .jv-balance__value b.has-debt {
    color: var(--z-danger);
  }

  .jv-balance__value b.has-credit {
    color: var(--z-ok);
  }

  /* A zero balance reads muted in the reference bar. */
  .jv-balance__value b.is-settled {
    color: var(--z-muted);
  }

  /* The reference prints the symbol outside the toned amount, so it reads
     muted next to either colour. */
  .jv-balance__symbol {
    font-size: 12px;
    font-weight: 700;
    color: var(--z-muted);
  }

  .jv-balance__value small {
    font-family: var(--z-font);
    font-size: 10px;
    font-weight: 500;
    color: var(--z-muted);
  }

  .jv-balance__arrow {
    font-size: 18px;
    color: var(--z-subtle);
  }

  /* ---- footer ---- */
  .jv-foot {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 9px 14px;
    border-top: 1px solid var(--z-border-soft);
    border-radius: 0 0 14px 14px;
    background: var(--z-surface-2);
  }

  .jv-btn {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 12px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-text);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .jv-btn--cancel:hover {
    border-color: var(--z-border-strong);
    color: var(--z-ink);
  }

  .jv-btn--save {
    padding: 0 14px;
    border: 0;
    color: #ffffff;
    background: var(--z-debit);
  }

  .jv-btn--save.is-cr {
    background: var(--z-credit);
  }

  .jv-btn--save:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  .jv-btn--save:disabled {
    opacity: 0.75;
    cursor: progress;
  }

  .jv-btn__icon {
    font-size: 16px;
  }

  .jv-btn.is-saving .jv-btn__icon {
    animation: jv-spin 0.8s linear infinite;
  }

  @keyframes jv-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ---- counterpart account picker --------------------------------
   * The reference draws this as a floating list under the account field,
   * so the panel is positioned from the field rect (trackPickerStyle) and
   * the full-screen layer only exists to catch clicks outside of it. */
  .jvp-layer {
    position: fixed;
    inset: 0;
    z-index: 10060;
    pointer-events: auto;
  }

  .jvp-modal {
    position: fixed;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--z-border);
    border-radius: 10px;
    background: var(--z-surface);
    box-shadow: 0 16px 40px -14px rgba(11, 21, 48, 0.35);
    pointer-events: auto;
  }

  .jvp-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    padding: 4px;
  }

  .jvp-search {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .jvp-search__box {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--z-border-soft);
    border-radius: 7px;
    background: var(--z-surface-2);
    color: var(--z-subtle);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .jvp-search__box .ms {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .jvp-search__box:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .jvp-search__box input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    color: var(--z-ink);
  }

  .jvp-search__box input::placeholder {
    color: var(--z-subtle);
  }

  .jvp-search__box input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .jvp-new {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    flex: 0 0 auto;
    height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .jvp-new .ms {
    font-size: 16px;
  }

  .jvp-new:hover {
    border-color: var(--z-brand-300);
  }

  .jvp-list {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-height: 0;
    max-height: 220px;
    padding: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .jvp-sect {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    padding: 6px 8px 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--z-subtle);
  }

  .jvp-sect .ms {
    font-size: 12px;
    color: var(--z-link);
  }

  .jvp-row-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .jvp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 34px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .jvp-row:hover {
    background: var(--z-surface-2);
  }

  .jvp-row.is-selected {
    background: var(--z-brand-soft);
  }

  .jvp-row__tile,
  .jvp-row__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--z-surface-3);
    color: var(--z-muted);
    font-size: 11.5px;
    font-weight: 800;
    line-height: 1;
  }

  .jvp-row__avatar .ms,
  .jvp-row__tile .ms {
    font-size: 15px;
  }

  .jvp-row__copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .jvp-row__copy strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--z-ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jvp-row__copy small {
    overflow: hidden;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.25;
    color: var(--z-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jvp-row__bal {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .jvp-row__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .jvp-row__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .jvp-row__bal small {
    font-size: 9.5px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--z-muted);
  }

  .jvp-row__bal.is-debit b {
    color: var(--z-danger);
  }

  .jvp-row__bal.is-credit b {
    color: var(--z-ok);
  }

  .jvp-row__bal.is-settled b {
    color: var(--z-muted);
  }

  .jvp-pin {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-subtle);
    opacity: 0.55;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      opacity 0.15s ease;
  }

  .jvp-pin .ms {
    font-size: 16px;
  }

  .jvp-pin:hover {
    background: var(--z-surface-3);
    opacity: 1;
  }

  .jvp-pin.is-on {
    color: var(--z-link);
    opacity: 1;
  }

  .jvp-pin.is-on:hover {
    background: var(--z-brand-soft);
  }

  .jvp-empty {
    padding: 10px;
    text-align: center;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--z-subtle);
  }

  @media (max-width: 480px) {
    .jvp-row__bal b {
      font-size: 11px;
    }

    .jvp-body {
      gap: 2px;
      padding: 6px;
    }

    .jv-labels--split,
    .jv-grid--split,
    .jv-grid--amount {
      grid-template-columns: minmax(0, 1fr) 118px;
    }

    .jv-row--ctr {
      grid-template-columns: minmax(0, 1fr) 106px;
    }

    .jv-cell--date {
      width: 106px;
    }

    .jv-amount__input {
      font-size: 16px;
      padding: 0 9px;
    }
  }
</style>
