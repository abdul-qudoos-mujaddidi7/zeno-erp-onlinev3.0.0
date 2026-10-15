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
  let enable_notrack = false;

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
  let track_ID = 0;
  let account = null;

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
    enable_notrack =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_notrack' }))?.data?.[0]
      )?.value == 1;
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

    applySelectedAccount();
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
        if (second_entry_account != treasury_ID && second_entry_account != notrack_ID) {
          track_ID = second_entry_account;
          console.log('Track', second_entry_account);
        }
        console.log('loaded', journal);
      }
    }
  }

  onMount(async () => {
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
  let filteredSecondAccounts = [];
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

  /*
   * This also handles a selectedAccountID that changes after the
   * component has mounted.
   */
  $: if (
    !journalId &&
    selectedAccountID &&
    accounts.length > 0
  ) {
    applySelectedAccount();
  }

  function selectCurrency(code) {
    currency = code;
    currencyMenuFor = null;
  }

  function toggleCurrencyMenu(which) {
    if (isBillCurrencyLocked) return;
    currencyMenuFor = currencyMenuFor === which ? null : which;
  }

  function handleWindowClick(event) {
    if (currencyMenuFor && !event.target.closest('.journal-currency-picker')) {
      currencyMenuFor = null;
    }
  }
  function calculateAccountBalance(accountId, targetCurrency) {
    const balance = accountBalances?.[accountId] || {};

    const amount = Number(balance[targetCurrency] || 0);

    if (accounts.find((a) => a.id === accountId)?.code === 'TREASURY') {
      // Real balance for the selected journal currency only — no conversion.
      treasury_balance = amount;
    }

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
import { settingsApi } from '../../api/settingsApi.js';
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
</script>

<svelte:window on:click={handleWindowClick} />

{#if !permissions?.some((p) => p.code === 'Journals' && p.create)}
  <!-- <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3> -->
{:else}
  <div class="journal-form-page" bind:this={componentRoot}>
    <div class="card shadow-sm journal-form-card">
      <div class="card-body journal-form-fields">
        <div class="row g-2 journal-form-row">
        <div class="col-12 col-sm-7 col-lg-4 journal-customer-field">
  <label class="journal-field-label">{t('Select Customer')}</label>

  <div class="journal-customer-anchor">
    <div
      class="journal-customer-control"
      class:is-open={showAccountDropdown}>
      <span class="journal-customer-control__icon" aria-hidden="true">
        <i class="bi bi-person"></i>
      </span>

      {#if first_entry_account}
        <button
          type="button"
          class="journal-selected-account"
          aria-label={t('Select Customer')}
          on:click={async () => {
            if (selectedAccountID) return;

            first_entry_account = '';
            first_entry_account_search = '';
            showAccountDropdown = true;
            filteredAccounts = accounts;

            await tick();
            first_entry_account_search_input?.focus();
          }}>
          <span class="journal-selected-account__content">
            <span class="journal-selected-account__name">
              {getAccountName(first_entry_account)}
            </span>

            <span
              class="journal-selected-account__divider"
              aria-hidden="true">
              |
            </span>

            <span class="journal-selected-account__balance">
              {@html calculateAccountBalance(first_entry_account, currency)}
            </span>
          </span>

        </button>
      {:else}
        <input
          type="text"
          class="journal-account-search-input"
          id="form_account_search"
          bind:this={first_entry_account_search_input}
          bind:value={first_entry_account_search}
          placeholder={t('Select Customer')}
          aria-label={t('Select Customer')}
          autocomplete="off"
          on:input={() => {
            showAccountDropdown = true;

            filteredAccounts = accounts.filter((acc) => {
              const name =
                t('Lang') === 'en'
                  ? acc.name
                  : t('Lang') === 'fa'
                    ? acc.name_fa
                    : t('Lang') === 'ps'
                      ? acc.name_ps
                      : acc.name;

              return (
                name &&
                name
                  .toLowerCase()
                  .includes(first_entry_account_search.trim().toLowerCase())
              );
            });
          }}
          on:focus={() => {
            showAccountDropdown = true;

            if (first_entry_account_search.trim()) {
              filteredAccounts = accounts.filter((acc) => {
                const name =
                  t('Lang') === 'en'
                    ? acc.name
                    : t('Lang') === 'fa'
                      ? acc.name_fa
                      : t('Lang') === 'ps'
                        ? acc.name_ps
                        : acc.name;

                return (
                  name &&
                  name
                    .toLowerCase()
                    .includes(first_entry_account_search.trim().toLowerCase())
                );
              });
            } else {
              filteredAccounts = accounts;
            }
          }}
          on:blur={() =>
            setTimeout(() => (showAccountDropdown = false), 150)} />
      {/if}

      <button
        type="button"
        class="journal-account-add"
        title={t('Add Account')}
        aria-label={t('Add Account')}
        on:click={() => modalRefAdd.openModal()}>
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        <span>{t('Add')}</span>
      </button>
    </div>

    {#if showAccountDropdown && filteredAccounts.length > 0}
      <ul class="journal-account-dropdown">
        {#each filteredAccounts as acc (acc.id)}
          <li>
            <button
              type="button"
              class="journal-account-option"
              class:is-selected={first_entry_account === acc.id}
              on:mousedown|preventDefault={() => {
                first_entry_account = acc.id;
                first_entry_account_search =
                  t('Lang') === 'en'
                    ? acc.name
                    : t('Lang') === 'fa'
                      ? acc.name_fa
                      : t('Lang') === 'ps'
                        ? acc.name_ps
                        : acc.name;

                showAccountDropdown = false;
                loadBillsForAccount(acc.id);
              }}>
              <span class="journal-account-option__avatar" aria-hidden="true">
                <i class="bi bi-person"></i>
              </span>

              <span class="journal-account-option__copy">
                <strong>
                  {#if t('Lang') === 'en' && acc.name}
                    {acc.name}
                  {:else if t('Lang') === 'fa' && acc.name_fa}
                    {acc.name_fa}
                  {:else if t('Lang') === 'ps' && acc.name_ps}
                    {acc.name_ps}
                  {:else}
                    {acc.name}
                  {/if}
                </strong>

                <small>
                  {#if accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                    {t('Lang') === 'en'
                      ? accountTypes.find((at) => at.id === acc.account_type_id)?.name
                      : t('Lang') === 'fa'
                        ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                        : t('Lang') === 'ps'
                          ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                          : accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                  {:else}
                    N/A
                  {/if}
                </small>
              </span>

              <i
                class="bi bi-chevron-right journal-account-option__arrow"
                aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>
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

</div>

          <div class="col-12 col-sm-5 col-lg-2 journal-date-field">
            <label class="journal-field-label">{t('Date')}</label>
            <div class="input-group input-group-sm persianDatePicker journal-unified-input-group">
              <input type="date" class="form-control form-control-sm" data-bind="date" bind:value={date} />
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>

          {#if canBeCustomer(first_entry_account) || canBeSupplier(first_entry_account)}
          <div class="col-12 journal-bill-field">
            <label class="journal-field-label">{t('Select Bill')}</label>
            <div class="journal-customer-anchor">
              <div class="journal-customer-control" class:is-open={showBillDropdown}>
                <span class="journal-customer-control__icon" aria-hidden="true">
                  <i class="bi bi-receipt"></i>
                </span>

                <input
                  type="text"
                  class="journal-account-search-input"
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

                {#if selectedBill}
                  <span class="journal-bill-input-meta">
                    <span dir="ltr">{Number(selectedBill._remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    {t(selectedBill.currency)} {t('Remaining')}
                  </span>
                {/if}
              </div>

              {#if showBillDropdown && bills.length > 0}
                <ul class="journal-account-dropdown journal-bill-dropdown">
                  {#each filteredBills as bill (bill.id)}
                    <li>
                      <button
                        type="button"
                        class="journal-account-option"
                        class:is-selected={selectedBill && Number(selectedBill.id) === Number(bill.id)}
                        on:mousedown|preventDefault={() => selectBill(bill)}>
                        <span class="journal-account-option__avatar" aria-hidden="true">
                          <i class="bi bi-receipt"></i>
                        </span>
                        <span class="journal-account-option__copy">
                          <strong>
                            <span dir="ltr">{billLabel(bill)}</span>
                            <span
                              class="journal-bill-role-badge"
                              class:journal-bill-role-badge--sale={bill._role === 'customer'}
                              class:journal-bill-role-badge--purchase={bill._role === 'supplier'}>
                              <i class="bi {bill._role === 'customer' ? 'bi-cart-check' : 'bi-bag-check'}" aria-hidden="true"></i>
                              {bill._role === 'customer' ? t('Sale') : t('Purchase')}
                            </span>
                            <span
                              class="journal-bill-badge"
                              class:journal-bill-badge--paid={Number(bill._remaining) <= 0}
                              class:journal-bill-badge--unpaid={Number(bill._remaining) > 0}>
                              {Number(bill._remaining) <= 0 ? t('Paid') : t('Unpaid')}
                            </span>
                          </strong>
                          <small>
                            {bill._role === 'customer' ? t('Customer Receivable') : t('Supplier Payable')}
                            &nbsp;·&nbsp;
                            {@html showDate(bill.invoice_date || bill.bill_date)} &nbsp;·&nbsp;
                            <span dir="ltr">{Number(bill.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            {t(bill.currency)}
                            {#if Number(bill._remaining) > 0}
                              &nbsp;·&nbsp; <span dir="ltr">{Number(bill._remaining).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              {t(bill.currency)} {t('Remaining')}
                            {/if}
                          </small>
                        </span>
                        <i class="bi bi-chevron-right journal-account-option__arrow" aria-hidden="true"></i>
                      </button>
                    </li>
                  {/each}
                  {#if filteredBills.length === 0}
                    <li class="journal-bill-dropdown__empty">{t('No bills found')}</li>
                  {/if}
                </ul>
              {/if}
            </div>
          </div>
          {/if}

          <div class="col-md-3 journal-debit-field">
            <label class="journal-field-label">{t('Debit')}</label>
            <div
              class="journal-amount-row journal-amount-row--debit"
              style="border-color: var(--journal-modal-border, #e2e8f0) !important; box-shadow: none !important; outline: none !important;">
              <div
                class="input-group input-group-sm journal-unified-input-group journal-unified-input-group--inline"
                style="border-color: transparent !important; box-shadow: none !important; outline: none !important;">
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9,]*"
                  id="first_entry_debit"
                  class="form-control form-control-sm {second_entry_account == treasury_ID &&
                  parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1
                    ? 'is-invalid'
                    : ''}"
                  style="background: #feecec !important; background-color: #feecec !important; color: #b91c1c; border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                  placeholder={t('Debit')}
                  value={format(toDisplayAmount(first_entry_debit))}
                  disabled={isCustomerBill}
                  title={isCustomerBill ? t('Disabled for customer bill payment') : ''}
                  on:keydown={onlyNumbers}
                  on:input={(e) => onFirstDebitInput(normalize(e.target.value))} />
              </div>
              <div class="journal-currency-picker">
                <button
                  id="journalCurrencyDropdown"
                  class="journal-currency-picker__btn"
                  type="button"
                  disabled={isBillCurrencyLocked}
                  aria-expanded={currencyMenuFor === 'debit'}
                  aria-haspopup="listbox"
                  aria-label={t('Currency')}
                  title={isBillCurrencyLocked ? t('Locked to bill currency') : ''}
                  on:click|stopPropagation={() => toggleCurrencyMenu('debit')}>
                  {t(currency)}
                  {#if isBillCurrencyLocked}
                    <i class="bi bi-lock-fill journal-bill-lock" aria-hidden="true"></i>
                  {:else}
                    <i class="bi bi-chevron-down" aria-hidden="true"></i>
                  {/if}
                </button>
                {#if currencyMenuFor === 'debit'}
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
            {#if second_entry_account == treasury_ID &&
            parseFloat(treasury_balance) > parseFloat(first_entry_debit) * -1}
              <div class="journal-invalid-feedback">
                {t("Treasury Account doesn't have enough funds.")}
              </div>
            {/if}
          </div>
          <div class="col-md-3 journal-credit-field">
            <label class="journal-field-label">{t('Credit')}</label>
            <div
              class="journal-amount-row journal-amount-row--credit"
              style="border-color: var(--journal-modal-border, #e2e8f0) !important; box-shadow: none !important; outline: none !important;">
              <div
                class="input-group input-group-sm journal-unified-input-group journal-unified-input-group--inline"
                style="border-color: transparent !important; box-shadow: none !important; outline: none !important;">
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9,]*"
                  id="first_entry_credit"
                  class="form-control form-control-sm {first_entry_account == treasury_ID &&
                  parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1
                    ? 'is-invalid'
                    : ''}"
                  style="background: #e9f9ef !important; background-color: #e9f9ef !important; color: #047857; border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                  placeholder={t('Credit')}
                  value={format(toDisplayAmount(first_entry_credit))}
                  disabled={isSupplierBill}
                  title={isSupplierBill ? t('Disabled for supplier bill payment') : ''}
                  on:keydown={onlyNumbers}
                  on:input={(e) => onFirstCreditInput(normalize(e.target.value))} />
              </div>
              <div class="journal-currency-picker">
                <button
                  class="journal-currency-picker__btn"
                  type="button"
                  disabled={isBillCurrencyLocked}
                  aria-expanded={currencyMenuFor === 'credit'}
                  aria-haspopup="listbox"
                  aria-label={t('Currency')}
                  title={isBillCurrencyLocked ? t('Locked to bill currency') : ''}
                  on:click|stopPropagation={() => toggleCurrencyMenu('credit')}>
                  {t(currency)}
                  {#if isBillCurrencyLocked}
                    <i class="bi bi-lock-fill journal-bill-lock" aria-hidden="true"></i>
                  {:else}
                    <i class="bi bi-chevron-down" aria-hidden="true"></i>
                  {/if}
                </button>
                {#if currencyMenuFor === 'credit'}
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
            {#if first_entry_account == treasury_ID &&
            parseFloat(treasury_balance) > parseFloat(first_entry_credit) * -1}
              <div class="journal-invalid-feedback">
                {t("Treasury Account doesn't have enough funds.")}
              </div>
            {/if}
          </div>
          {#if conversionHint}
            <div class="col-12 journal-conversion-hint">
              <i class="bi bi-arrow-repeat"></i>
              {t('Payment')}:
              <span dir="ltr">{Number(conversionHint.paid).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              {t(conversionHint.paidCurrency)}
              =&nbsp;
              <span dir="ltr">{Number(conversionHint.journal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              {t(conversionHint.journalCurrency)}
            </div>
          {/if}

          <div class="col-md-4 journal-description-field">
            <label class="journal-field-label">{t('Description')}</label>
            <div class="journal-unified-input-group">
              <input
                id="c-description"
                class="form-control form-control-sm"
                placeholder={t('Description')}
                bind:value={description} />
            </div>
          </div>
          <div class="col-md-3 journal-reference-field">
            <label class="journal-field-label">{t('Reference')}</label>
            <div class="journal-unified-input-group">
              <input
                id="c-reference"
                class="form-control form-control-sm"
                type="text"
                maxlength="255"
                placeholder={t('Reference')}
                bind:value={reference} />
            </div>
          </div>
          <div class="col-md-5 journal-submit-field">
            <div class="journal-footer-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm journal-submit-btn"
                disabled={saving}
                aria-busy={saving}
                on:click={saveJournal}>
                <i class="bi {saving ? 'bi-arrow-repeat journal-submit-spinner' : 'bi-check-circle'}"></i>
                {saving
                  ? t('Saving...')
                  : journalId
                    ? t('Update Journal')
                    : t('Add Journal')}
              </button>
              <div class="journal-mode-group">
                <div class="journal-mode-actions">
                  {#if !general}
                    <button
                      id="second_entry_account_search"
                      class="journal-mode-btn"
                      class:journal-mode-btn--active={second_entry_account == track_ID}
                      class:journal-mode-btn--track={second_entry_account == track_ID}
                      type="button"
                      on:click={() => {
                        filteredSecondAccounts = accounts;
                        showTrackModal = true;
                      }}>
                      <i class="bi bi-check-circle"></i>
                      {#if second_entry_account == track_ID}
                        {getAccountName(track_ID)}
                      {:else}
                        {t('Track')}
                      {/if}
                    </button>
                  {/if}
                  {#if enable_notrack || general}
                    <button
                      class="journal-mode-btn"
                      class:journal-mode-btn--active={second_entry_account == notrack_ID}
                      class:journal-mode-btn--notrack={second_entry_account == notrack_ID}
                      type="button"
                      on:click={() => {
                        second_entry_account = notrack_ID;
                      }}>
                      <i class="bi bi-x-circle"></i>
                      {t('No Track')}
                    </button>
                  {/if}
                  {#if !general}
                    <button
                      class="journal-mode-btn"
                      class:journal-mode-btn--active={second_entry_account == treasury_ID}
                      class:journal-mode-btn--treasury={second_entry_account == treasury_ID}
                      type="button"
                      on:click={() => {
                        second_entry_account = treasury_ID;
                      }}>
                      <i class="bi bi-box"></i>
                      {t('Treasury')}
                    </button>
                  {/if}
                </div>
                <div class="form-text mt-0 text-end journal-balance-text">
                  {@html second_entry_account != notrack_ID ? calculateAccountBalance(second_entry_account, currency) : ''}
                </div>
              </div>
            </div>
            {#if showTrackModal}
              <div
                use:portal
                class="modal fade show d-block track-picker-layer"
                id="trackModal"
                tabindex="-1"
                role="dialog"
                aria-modal="true"
                aria-labelledby="trackModalLabel"
                on:click|self={() => (showTrackModal = false)}>
                <div class="modal-dialog modal-dialog-centered track-picker-dialog">
                  <div class="modal-content track-picker-modal">
                    <div class="modal-header track-picker-header">
                      <div class="track-picker-heading">
                        <span><i class="bi bi-person-check"></i></span>
                        <div><small>{t('Account')}</small><h5 class="modal-title" id="trackModalLabel">{t('Track')}</h5></div>
                      </div>
                      <button
                        type="button"
                        class="track-picker-close"
                        aria-label="Close"
                        on:click={() => (showTrackModal = false)}><i class="bi bi-x-lg"></i></button>
                    </div>
                    <div class="modal-body track-picker-body">
                      <div class="mb-3">
                        <div class="input-group track-search-group">
                          <input
                            type="text"
                            class="form-control"
                            placeholder={t('Search accounts...')}
                            bind:value={second_entry_account_search}
                            on:input={() => {
                              filteredSecondAccounts = accounts.filter((acc) => {
                                const name =
                                  t('Lang') === 'en'
                                    ? acc.name
                                    : t('Lang') === 'fa'
                                      ? acc.name_fa
                                      : t('Lang') === 'ps'
                                        ? acc.name_ps
                                        : acc.name;
                                return name && name.toLowerCase().includes(second_entry_account_search.toLowerCase());
                              });
                            }} />
                          <button class="btn btn-outline-primary" on:click={() => modalRef?.openModal()}>
                            <i class="bi bi-plus"></i>
                          </button>
                        </div>
                        <div class="mt-3 track-account-list">
                          {#each filteredSecondAccounts as acc}
                            <div class="list-group mt-1 track-account-group">
                              <button
                                type="button"
                                class="list-group-item list-group-item-action track-account-row"
                                on:click={() => {
                                  second_entry_account = acc.id;
                                  track_ID = acc.id;
                                  showTrackModal = false;
                                }}>
                                {getAccountName(acc.id)}
                                <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                                  {#if accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                    {t('Lang') === 'en'
                                      ? accountTypes.find((at) => at.id === acc.account_type_id)?.name
                                      : t('Lang') === 'fa'
                                        ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                                        : t('Lang') === 'ps'
                                          ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                                          : accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                  {:else}
                                    N/A
                                  {/if}
                                </span>
                              </button>
                            </div>
                            {#if filteredSecondAccounts.length === 0}
                              <div class="track-empty">
                                <i class="bi bi-person-x"></i><span>{t('No accounts found')}</span>
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    </div>
                    <div class="modal-footer track-picker-footer">
                      <button type="button" class="track-cancel-btn" on:click={() => (showTrackModal = false)}
                        ><i class="bi bi-x-lg"></i>
                        {t('Close')}</button>
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
                track_ID = e.detail.account.id;
                showTrackModal = false;
                setTimeout(() => {
                  if (window.mdb) {
                    document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                  }
                }, 100);
              }} />
          </div>
          <div class="col-md-3 d-none">
            <label class="form-label">Debit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_debit}
              on:input={(e) => onSecondDebitInput(e.target.value)} />
          </div>
          <div class="col-md-3 d-none">
            <label class="form-label">Credit</label>
            <input
              readonly
              type="number"
              class="form-control"
              bind:value={second_entry_credit}
              on:input={(e) => onSecondCreditInput(e.target.value)} />
          </div>
        </div>
      </div>
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
  .journal-submit-spinner {
    display: inline-block;
    animation: journal-submit-spin 0.8s linear infinite;
  }

  @keyframes journal-submit-spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.quick-entry-modal.receipt-open) {
    visibility: hidden;
  }

  .journal-form-page {
    --journal-control-height: 2rem;
    --journal-label-offset: 1.05rem;
    background: transparent;
    padding-bottom: 0;
    color: #0f172a;
  }

  .journal-form-card {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.045) !important;
    overflow: hidden;
    background: #ffffff;
  }

  .journal-form-card :global(.card-body) {
    padding: 0.85rem 1rem;
    overflow: visible;
  }

  .journal-field-label {
    display: block;
    margin-bottom: 0.25rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .journal-form-fields :global(.form-control),
  .journal-form-fields :global(.form-select),
  .journal-form-page :global(.form-control),
  .journal-form-page :global(.form-select) {
    border-color: #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #334155;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .journal-form-fields :global(.form-control-sm),
  .journal-form-page :global(.form-control-sm) {
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
    font-size: 0.8125rem;
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
  }

  .journal-form-fields :global(.form-control:focus),
  .journal-form-fields :global(.form-select:focus),
  .journal-form-page :global(.form-control:focus),
  .journal-form-page :global(.form-select:focus) {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-unified-input-group.persianDatePicker {
    flex-direction: row !important;
    align-items: stretch !important;
  }

  .journal-unified-input-group.persianDatePicker :global(.persian-date-text) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-bottom: 0;
    justify-content: center;
    text-align: center;
    background: var(--erp-bg) !important;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0 0.45rem;
  }

  .journal-unified-input-group.persianDatePicker :global(.input-group-text.badge-warning) {
    flex: 0 0 auto;
    width: auto;
    border-inline-start: 0 !important;
    border-bottom: 0;
    border-inline-end: 1px solid #e2e8f0;
    justify-content: center;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
  }

  .journal-unified-input-group.persianDatePicker :global(.form-control) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-top: 0;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
    font-size: 0.78rem;
    line-height: 1.2;
    padding: 0.25rem 0.45rem;
  }

  .journal-unified-input-group {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    min-height: var(--journal-control-height);
  }

  .journal-amount-row {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: visible;
    background: #ffffff;
    min-height: var(--journal-control-height);
  }

  .journal-amount-row:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-amount-row--debit {
    border-color: #fecaca;
    background: #feecec;
  }

  .journal-amount-row--debit:focus-within {
    border-color: #f87171;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1);
  }

  .journal-amount-row--credit {
    border-color: #bbf7d0;
    background: #e9f9ef;
  }

  .journal-amount-row--credit:focus-within {
    border-color: #4ade80;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.1);
  }

  .journal-amount-row--debit:hover,
  .journal-amount-row--credit:hover {
    border-color: #e2e8f0;
  }

  .journal-amount-row--debit :global(.form-control),
  .journal-amount-row--debit :global(.form-control:focus),
  .journal-amount-row--debit .journal-currency-picker__btn {
    background: #feecec !important;
    color: #b91c1c;
  }

  .journal-amount-row--credit :global(.form-control),
  .journal-amount-row--credit :global(.form-control:focus),
  .journal-amount-row--credit .journal-currency-picker__btn {
    background: #e9f9ef !important;
    color: #047857;
  }

  .journal-amount-row--debit .journal-currency-picker {
    border-inline-start-color: #fecaca;
  }

  .journal-amount-row--credit .journal-currency-picker {
    border-inline-start-color: #bbf7d0;
  }

  .journal-unified-input-group--inline {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 0;
    overflow: hidden;
  }

  .journal-currency-picker {
    position: relative;
    flex-shrink: 0;
    border-inline-start: 1px solid #e2e8f0;
  }

  .journal-currency-picker__btn {
    height: 100%;
    min-height: var(--journal-control-height);
    border: 0;
    background: #ffffff;
    padding: 0 0.55rem;
    font-weight: 700;
    font-size: 0.75rem;
    color: #475569;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .journal-currency-picker__btn:hover {
    background: #f8fafc;
  }

  .journal-currency-picker__btn:disabled {
    cursor: not-allowed;
    opacity: 1;
  }

  .journal-currency-menu {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-end: 0;
    z-index: 1050;
    min-width: 130px;
    margin: 0;
    padding: 0.35rem 0;
    list-style: none;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  }

  .journal-currency-menu__item {
    display: block;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 0.45rem 0.85rem;
    text-align: start;
    font-size: 0.82rem;
    font-weight: 600;
    color: #334155;
    cursor: pointer;
  }

  .journal-currency-menu__item:hover,
  .journal-currency-menu__item.selected {
    background: #eff6ff;
    color: #0f6efd;
  }

  .journal-unified-input-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .journal-unified-input-group :global(.form-control) {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-width: 0;
    background: #ffffff !important;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
  }

  .journal-unified-input-group :global(.form-control:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .journal-amount-row--debit .journal-unified-input-group :global(.form-control),
  .journal-amount-row--debit .journal-unified-input-group :global(.form-control:hover),
  .journal-amount-row--debit .journal-unified-input-group :global(.form-control:focus),
  .journal-amount-row--debit .journal-currency-picker__btn,
  .journal-amount-row--debit .journal-currency-picker__btn:hover {
    background-color: #feecec !important;
    color: #b91c1c;
  }

  .journal-amount-row--credit .journal-unified-input-group :global(.form-control),
  .journal-amount-row--credit .journal-unified-input-group :global(.form-control:hover),
  .journal-amount-row--credit .journal-unified-input-group :global(.form-control:focus),
  .journal-amount-row--credit .journal-currency-picker__btn,
  .journal-amount-row--credit .journal-currency-picker__btn:hover {
    background-color: #e9f9ef !important;
    color: #047857;
  }

  .journal-amount-row--debit,
  .journal-amount-row--debit:hover,
  .journal-amount-row--debit:focus-within,
  .journal-amount-row--credit,
  .journal-amount-row--credit:hover,
  .journal-amount-row--credit:focus-within {
    border-color: #e2e8f0 !important;
    box-shadow: none !important;
  }

  .journal-amount-row--debit .journal-unified-input-group,
  .journal-amount-row--debit .journal-unified-input-group:focus-within,
  .journal-amount-row--credit .journal-unified-input-group,
  .journal-amount-row--credit .journal-unified-input-group:focus-within {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  .journal-amount-row--debit :global(.form-control:focus),
  .journal-amount-row--credit :global(.form-control:focus) {
    outline: none !important;
    box-shadow: none !important;
  }

  .journal-unified-input-group :global(.input-group-text) {
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff;
  }

  .journal-unified-input-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .journal-unified-input-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .journal-unified-input-group :global(.journal-input-addon-btn),
  .journal-unified-input-group :global(.btn-info) {
    border: 0 !important;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-radius: 0 !important;
    padding: 0 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: stretch;
    box-shadow: none !important;
    min-height: var(--journal-control-height);
  }

  .journal-unified-input-group :global(.btn-info) {
    background: #eff6ff !important;
    color: #0f6efd;
  }

  .journal-unified-input-group :global(.journal-input-addon-btn:first-child),
  .journal-unified-input-group :global(.btn-info.journal-input-addon-btn:first-child) {
    border-inline-start: 0 !important;
  }

  .journal-unified-input-group--account {
    direction: ltr;
  }

  .journal-unified-input-group--account :global(.journal-account-search-input),
  .journal-unified-input-group--account .journal-account-selected-name {
    direction: rtl;
    text-align: right;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
  }

  .journal-unified-input-group--account :global(.journal-account-quick-btn) {
    border-inline-start: 0 !important;
    border-inline-end: 1px solid #e2e8f0 !important;
    flex-shrink: 0;
    background: #0f6efd !important;
    color: #ffffff !important;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
    min-width: var(--journal-control-height);
    width: var(--journal-control-height);
    padding: 0;
  }

  .journal-unified-input-group--account :global(.journal-account-quick-btn:hover),
  .journal-unified-input-group--account :global(.journal-account-quick-btn:focus) {
    background: #1d4ed8 !important;
    color: #ffffff !important;
  }

  .journal-account-selected-name {
    display: flex;
    align-items: center;
    padding: 0 0.625rem;
    font-weight: 650;
    font-size: 0.8125rem;
    color: #334155;
    cursor: pointer;
    min-height: var(--journal-control-height);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .journal-account-selected-name:hover {
    background: #f8fafc !important;
  }

  .journal-form-dropdown {
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
    z-index: 1050;
  }

  .journal-form-dropdown :global(.list-group-item) {
    border: 0;
    font-weight: 600;
    font-size: 0.82rem;
  }

  .journal-form-dropdown :global(.list-group-item:hover) {
    background: #eff6ff;
    color: #0f6efd;
  }

  .journal-form-page :global(.btn) {
    min-height: var(--journal-control-height);
  }

  .journal-form-page :global(.form-control::placeholder) {
    color: #94a3b8;
    font-weight: 500;
  }

  .journal-invalid-feedback {
    margin-top: 4px;
    font-size: 0.7rem;
    color: #dc2626;
    font-weight: 600;
  }

  .journal-balance-text {
    font-size: 0.68rem !important;
    line-height: 1.25;
  }

  .journal-mode-field,
  .journal-submit-field {
    padding-top: var(--journal-label-offset);
  }

  .journal-submit-field {
    margin-right: auto;
  }

  .journal-footer-actions {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 0.75rem;
    direction: ltr;
    /*
     * Fill the field it sits in. The field is a flex row whose start is the
     * right in RTL, so a content-sized footer would be packed against that
     * right edge; filling it lets `justify-content: flex-start` put the mode
     * controls and the submit button together at the left edge instead.
     */
    width: 100%;
  }

  .journal-mode-group {
    min-width: 0;
    flex: 0 1 auto;
    order: -1;
    direction: rtl;
  }

  .journal-mode-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .journal-mode-btn {
    min-height: var(--journal-control-height);
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    box-shadow: none;
    font-size: 0.72rem;
    font-weight: 750;
    color: #475569;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .journal-mode-btn:hover {
    background: #f8fafc;
  }

  .journal-mode-btn--active.journal-mode-btn--track {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .journal-mode-btn--active.journal-mode-btn--notrack {
    background: #1e293b;
    border-color: #1e293b;
    color: #ffffff;
  }

  .journal-mode-btn--active.journal-mode-btn--treasury {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #059669;
  }

  .journal-submit-btn {
    min-height: var(--journal-control-height);
    padding: 0.25rem 0.75rem;
    border-radius: 8px;
    border-color: #2f6fed !important;
    background: #2f6fed !important;
    color: #fff !important;
    box-shadow: 0 4px 10px rgba(47, 111, 237, 0.18);
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.2;
  }

   .journal-customer-field {
    position: relative;
    min-width: 0;
    overflow: visible;
  }

  /*
   * Force the customer/date ratio inside the modal.
   *
   * Some global/modal responsive rules assign 50% to every child of
   * `.journal-form-row`, which overrides Bootstrap's `col-*` widths.
   * These selectors are intentionally more specific and use `!important`
   * so the customer remains wider than the date picker.
   */
  @media (min-width: 576px) and (max-width: 991.98px) {
    .journal-form-row > .journal-customer-field {
      flex: 0 0 58.333333% !important;
      width: 58.333333% !important;
      max-width: 58.333333% !important;
    }

    .journal-form-row > .journal-date-field {
      flex: 0 0 41.666667% !important;
      width: 41.666667% !important;
      max-width: 41.666667% !important;
    }
  }

  @media (min-width: 992px) {
    .journal-form-row > .journal-customer-field {
      flex: 0 0 33.333333% !important;
      width: 33.333333% !important;
      max-width: 33.333333% !important;
    }

    .journal-form-row > .journal-date-field {
      flex: 0 0 16.666667% !important;
      width: 16.666667% !important;
      max-width: 16.666667% !important;
    }
  }

  @media (max-width: 575.98px) {
    .journal-form-row > .journal-customer-field,
    .journal-form-row > .journal-date-field {
      flex: 0 0 100% !important;
      width: 100% !important;
      max-width: 100% !important;
    }
  }

  .journal-customer-anchor {
    position: relative;
    z-index: 120;
    width: 100%;
    min-width: 0;
    overflow: visible;
  }

  .journal-customer-control {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: 2.375rem;
    min-height: 2.375rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .journal-customer-control:hover {
    border-color: #bcc9db;
  }

  .journal-customer-control:focus-within,
  .journal-customer-control.is-open {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .journal-customer-control__icon {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    place-items: center;
    background: #ffffff;
    color: #8c9aad;
  }

  .journal-account-search-input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 650;
    text-align: start;
    box-shadow: none;
  }

  .journal-account-search-input:focus {
    border: 0;
    outline: 0;
    box-shadow: none;
  }

  .journal-account-search-input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .journal-selected-account {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    height: 100%;
    padding-inline: 0.15rem 0.65rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 750;
    text-align: start;
    cursor: pointer;
  }

  .journal-selected-account:hover {
    color: #1d4ed8;
  }

  .journal-selected-account__content {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    gap: 0.18rem;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap !important;
  }

  .journal-selected-account__name {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 45%;
    overflow: hidden;
    color: #1e293b;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }

  .journal-selected-account__divider {
    flex: 0 0 auto;
    margin-inline: 0.02rem;
    color: #cbd5e1;
    font-size: 0.7rem;
    font-weight: 500;
    white-space: nowrap !important;
  }

  .journal-selected-account__balance {
    display: inline-flex;
    flex: 0 1 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.1rem;
    min-width: 0;
    max-width: 55%;
    overflow: hidden;
    color: var(--bs-primary, #2f6fed);
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }

  /*
   * calculateAccountBalance() returns HTML that may contain <br>,
   * block elements, or component styles. Force every generated part
   * onto one line so the currency cannot move below the field.
   */
  .journal-selected-account__balance :global(br) {
    display: none !important;
  }

  .journal-selected-account__balance :global(*) {
    display: inline !important;
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  .journal-selected-account > i {
    flex: 0 0 auto;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .journal-account-add {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.2rem;
    height: 100%;
    padding-inline: 0.65rem;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: var(--bs-primary, #2f6fed);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .journal-account-add:hover,
  .journal-account-add:focus-visible {
    background: #1d4ed8;
    color: #ffffff;
  }

  .journal-account-dropdown {
    position: absolute;
    top: calc(100% + 0.35rem);
    bottom: auto;
    inset-inline-start: 0;
    inset-inline-end: 0;
    z-index: 9999;
    width: 100%;
    min-width: 100%;
    max-height: 18rem;
    margin: 0;
    padding: 0.3rem;
    overflow-x: hidden;
    overflow-y: auto;
    list-style: none;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .journal-account-dropdown::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .journal-account-dropdown > li {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .journal-account-option {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-height: 3rem;
    padding: 0.4rem 0.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #26364b;
    text-align: start;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .journal-account-option:hover,
  .journal-account-option:focus-visible,
  .journal-account-option.is-selected {
    background: #f0f6ff;
  }

  .journal-account-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--bs-primary, #2f6fed);
  }

  .journal-account-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .journal-account-option__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-account-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .journal-account-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .journal-account-option.is-selected
    .journal-account-option__arrow {
    color: var(--bs-primary, #2f6fed);
  }

  /* Ensure parent containers do not clip the account dropdown. */
  .journal-form-page,
  .journal-form-card,
  .journal-form-card :global(.card-body),
  .journal-form-fields,
  .journal-customer-field,
  .journal-customer-anchor {
    overflow: visible !important;
  }

  :global(html[dir='rtl']) .journal-account-option__arrow {
    transform: scaleX(-1);
  }

  @media (max-width: 480px) {
    .journal-account-add {
      width: 2.65rem;
      min-width: 2.65rem;
      padding: 0;
    }

    .journal-account-add span {
      display: none;
    }

    .journal-customer-control__icon {
      flex-basis: 2rem;
      width: 2rem;
    }

    .journal-selected-account__name {
      max-width: 42%;
    }

    .journal-selected-account__balance {
      max-width: 58%;
      font-size: 0.64rem;
    }
  }

  @media (max-width: 767px) {
    .journal-mode-field,
    .journal-submit-field {
      padding-top: 0;
    }

    .journal-submit-field {
      margin-right: 0;
    }

    .journal-footer-actions {
      flex-wrap: wrap;
    }

    .journal-footer-actions .journal-submit-btn {
      flex: 1 1 100%;
    }
  }

  .journal-bill-field {
    min-width: 0;
  }

  .journal-conversion-hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.4rem 0.7rem;
    background: #f0f7ff;
    border: 1px solid #d7e7fb;
    border-radius: 8px;
    color: #1d4ed8;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .journal-amount-row :global(.form-control:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .journal-bill-input-meta {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.25rem;
    padding-inline: 0.55rem;
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 650;
    white-space: nowrap;
    border-inline-start: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .journal-bill-lock {
    margin-inline-start: 0.35rem;
    color: #0f6efd;
    font-size: 0.7rem;
  }

  .journal-selected-account--placeholder {
    color: #94a3b8;
  }

  .journal-selected-account--placeholder:disabled {
    cursor: not-allowed;
    opacity: 0.75;
  }

  .journal-bill-badge {
    display: inline-block;
    margin-inline-start: 0.45rem;
    padding: 0.08rem 0.45rem;
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 750;
    line-height: 1.4;
    vertical-align: 1px;
  }

  .journal-bill-badge--paid {
    background: #e7f8ef;
    color: #067a46;
  }

  .journal-bill-badge--unpaid {
    background: #fef1e7;
    color: #b45309;
  }

  .journal-bill-role-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-start: 0.45rem;
    padding: 0.08rem 0.45rem;
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 750;
    line-height: 1.4;
    vertical-align: 1px;
  }

  .journal-bill-role-badge--sale {
    background: #e8f3ff;
    color: #0b63ce;
  }

  .journal-bill-role-badge--purchase {
    background: #fff2df;
    color: #a45b00;
  }

  .journal-bill-dropdown {
    width: 22rem;
    max-width: calc(100vw - 2rem);
    max-height: 20rem;
    overflow-y: auto;
  }

  .journal-bill-dropdown__search {
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid #eef2f7;
  }

  .journal-bill-dropdown__search :global(.form-control) {
    min-height: 1.9rem;
    font-size: 0.78rem;
    border-radius: 8px;
    border-color: #e2e8f0;
  }

  .journal-bill-dropdown__empty {
    padding: 0.6rem 0.85rem;
    color: #94a3b8;
    font-size: 0.78rem;
    text-align: center;
  }
</style>
