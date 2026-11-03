<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { exchangeApi } from '../../api/exchangeApi.js';
  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import ExchangeReceiptModal from './ExchangeReceiptModal.svelte';
  let showReceipt = false;
  let savedExchange = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let componentRoot;
  import AccountModal from '../accounts/AccountModal.svelte';
  import { showDate, setDatePickers } from '../../calendar.js';
import { currencyApi } from '../../api/currencyApi.js';
import { settingsApi } from '../../api/settingsApi.js';

import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
  let accounts = [];
  /* The same list without the house ledgers: what the two lists offer. */
  let pickableAccounts = [];
  let exchange_account = null;
  let benefit_account = null;
  let benefit_amount = 0;
  let accountTypes = [];
  let currencies = [];
  let exchanges = [];
  let allExchanges = [];
  let enable_notrack = false;
  let loading = true;

  let showTrackModal = false;
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  export let selectedAccountID = null;

  export let exchangeId = null;

  let general = false;

  export async function modalOpened(id) {
    if (typeof id === 'object') {
      await loadAccounts();
      general = true;
      accounts = accounts.filter((a) => a.account_type_id === 7);
      pickableAccounts = [...accounts];
      filteredAccounts = [...accounts]; // new reference triggers reactive updates

      accountTypes = accountTypes.filter((at) => at.id == 7);
      console.log('Filtered accounts:', accounts);

      if (id[1] < 0) {
        first_entry_credit = id[1] * -1;
      } else {
        first_entry_debit = id[1];
      }
      second_entry_account = notrack_ID; // this is reactive since it's `let`
      first_currency = id[0];
      console.log('second_entry_account', second_entry_account);
    } else {
      exchangeId = id;
      await loadExchangeIfEditing();
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
  }

  const dispatch = createEventDispatcher();

  let modalRef; // reference to AccountModal for opening it from exchange form
  let modalRefAdd;
  // Form fields
  let date = new Date().toISOString().slice(0, 10);
  let description = '';
  let currency = '';
  let first_currency = '';
  let second_currency = '';
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
  /* The purchase and sale ledgers: they name the tabs' fields, nothing more. */
  let purchase_ID = 0;
  let sales_ID = 0;
  /* The tab the user picked. It only relabels the form, so the choice has to be
     remembered separately from the accounts themselves. */
  let pickedTab = '';
  let track_ID = 0;
  let account = null;

  if (selectedAccountID) {
    first_entry_account = parseInt(selectedAccountID);
  }

  async function loadExchangeAccount() {
    let existing = (await accountApi.getAll({ status: 1, code: 'EXCHANGE' }))?.data?.[0];

    if (!existing) {
      let newValues = {
        account_type_id: 1,
        code: 'EXCHANGE',
        name: 'Currency Exchange',
        main_acc: 'true',
        name_fa: 'تبادله ارز',
        name_ps: 'تبادله ارز',
        balance: 0,
        currency: 'AFN',
        description: '',
        phone: '',
        phone2: '',
        email: '',
        address: '',
        status: 1,
      };
      let created = await accountApi.create(newValues);
      let exchangeAccountId = created?.data?.id;

      if (exchangeAccountId) {
        console.log('Created Exchange account with id: ' + exchangeAccountId);
      }
    }
    exchange_account = (await accountApi.getAll({ status: 1, code: 'EXCHANGE' }))?.data?.[0];
  }

  let exchangeRateAmount = 1;
  let exchangeRateAmountSystem = 1;
  let exchangeRateMultiple = true;
  /* Six decimals is as much as a rate ever needs on screen; without it the
     derived rate fills the box with a seventeen-digit float. */
  function roundRate(value) {
    const rate = Number(value);

    return Number.isFinite(rate) && rate !== 0 ? Number(rate.toFixed(6)) : 1;
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
  async function loadAccounts() {
    let accountsCount = await ((await accountApi.getAll({ status: 1 }))?.data || []).length;
    if (accountsCount < 10) {
      setTimeout(() => {
        loadAccounts();
      }, 500);
      return null;
    }
    await loadExchangeAccount();

    await loadExchanges();
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

      if (acc.code === 'PURCHASE') {
        purchase_ID = acc.id;
      }

      if (acc.code === 'SALES') {
        sales_ID = acc.id;
      }
    });

    enable_notrack =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_notrack' }))?.data?.[0]
      )?.value == 1;

    // sort accounts by account_type_id;
    accounts.sort((a, b) => {
      if (a.account_type_id === b.account_type_id) {
        return a.name.localeCompare(b.name);
      }
      return b.account_type_id - a.account_type_id;
    });

    if (general) {
      accounts = accounts.filter((a) => a.account_type_id == 7);
    }

    /* The purchase and sale ledgers take part in an exchange now, but they are
       still control accounts: the tabs pick them, nobody picks them by hand. */
    pickableAccounts = accounts.filter(
      (a) =>
        !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE', 'EXCHANGE'].includes(a.code),
    );

    account = accounts.find((a) => a.id === first_entry_account);
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
    applyDefaultCurrencies();
  }

  /* A new voucher opens on a workable pair - the default currency against the
     first other one - so the amount fields are live straight away, the way the
     journal form opens ready to type. An existing exchange keeps its own. */
  function applyDefaultCurrencies() {
    if (exchangeId || first_currency || !currencies.length) return;

    const primary = currencies.find((c) => c.isDefault) || currencies[0];
    const secondary = currencies.find((c) => c.code !== primary?.code) || primary;

    first_currency = primary?.code || '';
    second_currency = secondary?.code || '';

    calculateExchangeAmount();
  }

  async function loadExchanges() {
    loading = true;

    allExchanges = (await exchangeApi.getAll({ status: 1 }))?.data || [];

    exchanges = allExchanges.filter((j) => {
      const firstAccount = accounts.find((a) => a.id === j.first_entry_account);
      const secondAccount = accounts.find((a) => a.id === j.second_entry_account);
      return (
        firstAccount &&
        secondAccount &&
        firstAccount.code !== 'PAYABLE' &&
        firstAccount.code !== 'RECEIVABLE' &&
        secondAccount.code !== 'PAYABLE' &&
        secondAccount.code !== 'RECEIVABLE'
      );
    });
    exchanges = exchanges.reverse(); // show latest first

    loading = false;
  }

  async function loadExchangeIfEditing() {
    if (exchangeId) {
      let exchange = (await exchangeApi.getById(Number(exchangeId)))?.data || null;
      if (exchange) {
        date = exchange.date.slice(0, 10);
        console.log(date);
        description = exchange.description;
        first_currency = exchange.first_currency;
        first_entry_account = exchange.first_entry_account;
        first_entry_debit = exchange.first_entry_debit;
        first_entry_credit = exchange.first_entry_credit;
        second_currency = exchange.second_currency;
        second_entry_account = exchange.second_entry_account;
        second_entry_debit = exchange.second_entry_debit;
        second_entry_credit = exchange.second_entry_credit;
        reference_id = exchange.reference_id;
        reference_type = exchange.reference_type;
        exchangeRateAmount = exchange.rate;
        status = exchange.status;

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
        // Update Persian picker display after setting date

        console.log('loaded', exchange);
      }
    }
  }

  onMount(async () => {
    pinnedAccountIds = readPinnedAccounts();
    loadCurrencies();

    await loadAccounts();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadExchangeIfEditing();
    await tick();
    setDatePickers(handleDateChange, componentRoot); //
  });

  async function saveExchange() {
    if (!first_entry_account || !second_entry_account) {
      toast.error(t('Error'), t('Please select accounts for both entries.'));
      return;
    }

    if (!first_currency || !second_currency) {
      toast.error(t('Error'), t('Please select currencies for both entries.'));
      return;
    }

    if (first_currency == second_currency) {
      toast.error(t('Error'), t('Please select different currencies for both entries.'));
      return;
    }

    if (!first_entry_debit || !second_entry_credit) {
      toast.error(t('Error'), t('Please enter amounts for both entries.'));
      return;
    }

    const data = {
      date,
      description,
      reference_id,
      reference_type,
      first_currency: first_currency,
      first_entry_account,
      first_entry_debit: parseFloat(first_entry_debit) || 0,
      first_entry_credit: parseFloat(first_entry_credit) || 0,
      second_entry_account,
      second_entry_debit: parseFloat(second_entry_debit) || 0,
      second_entry_credit: parseFloat(second_entry_credit) || 0,
      second_currency: second_currency,
      multiple: exchangeRateMultiple,
      rate: exchangeRateAmount,
      system_rate: exchangeRateAmountSystem,
      benefit_amount: benefit_amount,
      benefit_currency: first_currency,
      status: parseInt(status) || 1,
    };

    try {
      if (!exchangeId) {
        const created = await exchangeApi.create(data);
        data.id = created?.data?.id || data.id;

        console.log('Exchange saved with ID:', data);
      } else {
        await exchangeApi.update(exchangeId, data);
        data.id = exchangeId;

        console.log('Exchange Updated with ID:', data);
      }
      resetForm();
      await loadAccounts();

      dispatch('saved', { exchange: data });
      savedExchange = data;
      showReceipt = true;
    } catch (err) {
      console.error('Failed to save exchange:', err);
      toast.error(t('Error'), t('An error occurred while saving the exchange. Please try again.'));
    }
  }

  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    description = '';
    if (!selectedAccountID) {
      first_entry_account = '';
    } else {
      first_entry_account = parseInt(selectedAccountID);
    }
    first_entry_debit = null;
    first_entry_credit = null;
    first_entry_account_search = '';
    pickedTab = '';
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
      }
    });
    first_currency = '';
    second_currency = '';

    currency = currencies.find((c) => c.isDefault)?.code || '';
    second_entry_debit = null;
    second_entry_credit = null;
    status = 1;

    applyDefaultCurrencies();
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

    // remove all non-digits and non-dot
    value = value.toString().replace(/[^0-9.]/g, '');

    // allow only one decimal
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    // split integer and decimal parts
    let [integer, decimal] = value.split('.');

    // remove leading zeros from integer part
    if (integer) {
      integer = integer.replace(/^0+(?=\d)/, '');
      if (integer === '') integer = '0';
    }

    // join integer and decimal back
    return decimal !== undefined ? integer + '.' + decimal : integer;
  }

  function calculateExchangeAmount() {
    if (first_currency && second_currency) {
      if (exchangeRateMultiple) {
        exchangeRateAmount = roundRate(exchangeRate(1, first_currency, second_currency));
        exchangeRateAmountSystem = exchangeRateAmount;
      } else {
        exchangeRateAmount = roundRate(exchangeRate(1, second_currency, first_currency));
        exchangeRateAmountSystem = exchangeRateAmount;
      }
    }
  }

  function calculateAmount() {
    second_entry_credit = !exchangeRateMultiple
      ? first_entry_debit / exchangeRateAmount
      : first_entry_debit * exchangeRateAmount;

    let system_amount = !exchangeRateMultiple
      ? first_entry_debit / exchangeRateAmountSystem
      : first_entry_debit * exchangeRateAmountSystem;

    benefit_amount = exchangeRate(system_amount - second_entry_credit, second_currency, first_currency);
  }

  function onFirstDebitInput(value) {
    const amount = normalize(value);

    first_entry_debit = amount;
    calculateAmount();
  }
  function onFirstCreditInput(value) {
    const amount = normalize(value);

    first_entry_credit = amount;
    second_entry_debit = amount;
  }

  function onSecondDebitInput(value) {
    const amount = normalize(value);

    second_entry_debit = amount;
    first_entry_credit = amount;
  }

  function onSecondCreditInput(value) {
    const amount = normalize(value);

    second_entry_credit = amount;
  }

  function onlyNumbers(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowed.includes(e.key)) return;
    if (/[0-9]/.test(e.key)) return;
    if (e.key === '.' && !e.target.value.includes('.')) return;

    e.preventDefault();
  }

  // --- Computed Data (Filter, Sort, Pagination) ---

  let first_entry_account_search = '';
  let showAccountDropdown = false;
  let filteredAccounts = [];

  let second_entry_account_search = '';
  let trackPickerStyle = '';

  let currencyMenuFor = null; // 'debit' | 'credit'
  let first_entry_account_search_input = null;

  // `accountList` is passed explicitly at call sites so the name also renders
  // after the accounts array finishes loading.
  function getAccountName(id, accountList = accounts) {
    const acc = accountList.find((a) => a.id === id);
    if (!acc) return '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name;
    if (t('Lang') === 'ps') return acc.name_ps || acc.name;
    return acc.name;
  }

  function selectFirstCurrency(code) {
    first_currency = code;
    currencyMenuFor = null;
    calculateExchangeAmount();
  }

  function selectSecondCurrency(code) {
    second_currency = code;
    currencyMenuFor = null;
    calculateExchangeAmount();
  }

  function toggleCurrencyMenu(which) {
    currencyMenuFor = currencyMenuFor === which ? null : which;
  }

  function handleWindowClick(event) {
    if (currencyMenuFor && !event.target.closest('.xe-currency')) {
      currencyMenuFor = null;
    }
  }

  /* ---- account balances ------------------------------------------------
   * Every exchange row moves credit − debit in its own currency, so the map
   * is keyed by account and then currency, exactly like the journal form.
   * The tiles, the field and the picker rows all read from it.
   */
  function buildBalanceMap(list, balances, code) {
    return list.reduce((map, item) => {
      if (!item) return map;

      const bucket = balances?.[item.id] || {};
      const value = Number(bucket[code] || 0);
      const settled = Math.abs(value) < 0.01;

      map[item.id] = {
        /* Symbol and digits stay separate so the row can lay them out from
           the inline start without bidi surprises. */
        symbol: currencySymbol(code),
        amount: Math.abs(value).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        label: settled ? t('Balance') : value < 0 ? t('Debit') : t('Credit'),
        tone: settled ? 'settled' : value < 0 ? 'debit' : 'credit',
      };

      return map;
    }, {});
  }

  /* The symbol the closed pickers and the balance rows print; a currency
     without one falls back to its translated code. */
  function currencySymbol(code) {
    const normalizedCode = String(code ?? '');
    return (
      currencies.find((item) => String(item.code ?? '') === normalizedCode)?.symbol ||
      t(normalizedCode)
    );
  }

  function accountSearchName(selected) {
    if (!selected) return '';
    if (t('Lang') === 'fa') return selected.name_fa || selected.name || selected.name_ps || '';
    if (t('Lang') === 'ps') return selected.name_ps || selected.name || selected.name_fa || '';
    return selected.name || selected.name_fa || selected.name_ps || '';
  }

  function accountTypeLabel(selected) {
    if (!selected) return '';
    const type = accountTypes.find(
      (item) => Number(item.id) === Number(selected.account_type_id),
    );

    if (!type) return 'N/A';

    if (t('Lang') === 'fa') return type.name_fa || type.name || '';
    if (t('Lang') === 'ps') return type.name_ps || type.name || '';

    return type.name || '';
  }

  /* The reference paints each account row from its class: one icon and one
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

  /* The house ledgers carry their own glyph and colour: a cart for the purchase
     side, a till for the sale side, the strongroom for the treasury. */
  const LEDGER_TINTS = {
    TREASURY: ['account_balance', '#7C5CE0'],
    PURCHASE: ['shopping_cart', '#2F6FED'],
    SALES: ['point_of_sale', '#16A34A'],
  };

  function accountTypeTint(selected) {
    const [icon, color] =
      LEDGER_TINTS[selected?.code] ||
      ACCOUNT_TYPE_TINTS[Number(selected?.account_type_id)] || [
        'account_balance_wallet',
        '#64748B',
      ];

    return {
      icon,
      style: `background: color-mix(in srgb, ${color} 13%, transparent); color: ${color};`,
    };
  }

  /* House accounts lead the picker; the party ledgers follow them. */
  function accountRank(selected) {
    const isParty =
      Number(selected?.can_be_customer) === 1 ||
      Number(selected?.can_be_supplier) === 1 ||
      Number(selected?.account_type_id) === 3 ||
      Number(selected?.account_type_id) === 4;

    return isParty ? 1 : 0;
  }

  function filterAccounts() {
    const query = first_entry_account_search.trim().toLowerCase();

    filteredAccounts = pickableAccounts.filter((acc) => {
      if (!query) return true;

      return (
        accountSearchName(acc).toLowerCase().includes(query) ||
        String(acc.code || '').toLowerCase().includes(query)
      );
    });
  }

  /* ---- counterpart account picker -------------------------------------
   * Mirrors the journal form: a search row with a "new account" chip, the
   * pinned accounts (a local preference shared with AddJournal) and every
   * other account with its type and balance in the debit currency.
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
    track_ID = accountId;
    showTrackModal = false;
  }

  /*
   * A tab only renames the two fields: Purchase calls them the purchase and the
   * sale account, Sale swaps the two names. Neither tab touches an account, so
   * both sides are still picked by hand. No Track keeps its old behaviour and
   * points the partner at the No Track ledger.
   */
  function pickMode(mode) {
    if (mode === 'notrack') {
      pickedTab = '';
      second_entry_account = notrack_ID;
      return;
    }

    pickedTab = mode;
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
    const anchor = event.currentTarget.closest('.xe-account-row') || event.currentTarget;
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

  function closeForm() {
    resetForm();
    dispatch('close');
  }

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  /* ---- derived state --------------------------------------------------- */
  $: accountBalances = (() => {
    const map = {};
    const add = (accountId, code, amount) => {
      if (!accountId || !code) return;
      if (!map[accountId]) map[accountId] = {};
      map[accountId][code] = (map[accountId][code] || 0) + amount;
    };

    allExchanges.forEach((row) => {
      add(
        row.first_entry_account,
        row.first_currency,
        Number(row.first_entry_credit || 0) - Number(row.first_entry_debit || 0),
      );
      add(
        row.second_entry_account,
        row.second_currency,
        Number(row.second_entry_credit || 0) - Number(row.second_entry_debit || 0),
      );
    });

    return map;
  })();

  $: treasury_balance = Number(accountBalances?.[treasury_ID]?.[first_currency] || 0);

  $: balanceByAccount = buildBalanceMap(accounts, accountBalances, first_currency, _lang);

  $: selectedFirstAccount = accounts.find(
    (item) => first_entry_account && Number(item.id) === Number(first_entry_account),
  );

  $: selectedSecondAccount = accounts.find(
    (item) => second_entry_account && Number(item.id) === Number(second_entry_account),
  );

  /* A tab stays active only while both of its sides are in place, so choosing
     a different partner by hand drops the form back to a plain tracked entry. */
  $: exchangeMode =
    notrack_ID && Number(second_entry_account) === Number(notrack_ID)
      ? 'notrack'
      : sales_ID &&
          purchase_ID &&
          Number(second_entry_account) === Number(sales_ID) &&
          Number(first_entry_account) === Number(purchase_ID)
        ? 'purchase'
        : sales_ID &&
            purchase_ID &&
            Number(second_entry_account) === Number(purchase_ID) &&
            Number(first_entry_account) === Number(sales_ID)
          ? 'sale'
          : treasury_ID && Number(second_entry_account) === Number(treasury_ID)
            ? 'treasury'
            : 'track';

  /* Sale is the tab the dialog opens on; a saved purchase/sale pair still wins,
     and No Track keeps the plain labels. */
  $: tabMode =
    pickedTab ||
    (exchangeMode === 'purchase' || exchangeMode === 'sale'
      ? exchangeMode
      : exchangeMode === 'notrack'
        ? ''
        : 'sale');

  $: firstAccountLabel =
    tabMode === 'purchase'
      ? t('Purchase Account')
      : tabMode === 'sale'
        ? t('Sale Account')
        : t('Select Account');

  $: secondAccountLabel =
    tabMode === 'purchase'
      ? t('Sale Account')
      : tabMode === 'sale'
        ? t('Purchase Account')
        : t('Account');

  $: secondAccountName =
    exchangeMode === 'notrack'
      ? t('No Track')
      : exchangeMode === 'treasury'
        ? t('Treasury')
        : selectedSecondAccount
          ? accountSearchName(selectedSecondAccount)
          : t('Select Account');

  $: accountQuery = second_entry_account_search.trim().toLowerCase();
  $: matchingSecondAccounts = pickableAccounts.filter((item) =>
    matchesSecondAccount(item, accountQuery),
  );
  $: pinnedSecondAccounts = pinnedAccountIds
    .map((value) => matchingSecondAccounts.find((item) => String(item.id) === value))
    .filter(Boolean)
    .sort((a, b) => accountRank(a) - accountRank(b));
  $: unpinnedSecondAccounts = matchingSecondAccounts
    .filter((item) => !pinnedAccountIds.includes(String(item.id)))
    .sort((a, b) => accountRank(a) - accountRank(b));
  $: showPinnedSection = pinnedSecondAccounts.length > 0;
  $: customerAccountRows = [...filteredAccounts].sort(
    (a, b) =>
      accountRank(a) - accountRank(b) ||
      Number(pinnedAccountIds.includes(String(b.id))) -
        Number(pinnedAccountIds.includes(String(a.id))),
  );
</script>

<svelte:window on:click={handleWindowClick} />

<!-- =========================================================================
     Add Exchange — traced from the Add Journal voucher (Journal.dc.html via
     AddJournal.svelte): 10px stacked sections, 40px boxes, 11px labels,
     32px date/counter row and the same footer actions. Every colour reads
     from the shared --z-* tokens, so dark mode comes for free.
     ========================================================================= -->
<div class="exchange-form-page" bind:this={componentRoot}>
  <div class="xe-body">
    {#if !general}
      <div
        class="xe-tabs"
        class:xe-tabs--two={!enable_notrack}
        role="tablist"
        aria-label={t('Account')}>
        <button
          type="button"
          role="tab"
          aria-selected={tabMode === 'purchase'}
          class="xe-tab"
          class:is-active={tabMode === 'purchase'}
          on:click={() => pickMode('purchase')}>
          <span class="ms" aria-hidden="true">shopping_cart</span>
          <span class="xe-tab__copy">{t('Purchase')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tabMode === 'sale'}
          class="xe-tab"
          class:is-active={tabMode === 'sale'}
          on:click={() => pickMode('sale')}>
          <span class="ms" aria-hidden="true">point_of_sale</span>
          <span class="xe-tab__copy">{t('Sale')}</span>
        </button>

        {#if enable_notrack}
          <button
            type="button"
            role="tab"
            aria-selected={exchangeMode === 'notrack'}
            class="xe-tab"
            class:is-active={exchangeMode === 'notrack'}
            on:click={() => pickMode('notrack')}>
            <span class="ms" aria-hidden="true">block</span>
            <span class="xe-tab__copy">{t('No Track')}</span>
          </button>
        {/if}
      </div>
    {/if}

    <!-- account — the reference account box: tinted icon tile, name over
         type, the running balance and the unfold_more chevron -->
    <div class="xe-field">
      <span class="xe-label">
        {firstAccountLabel}
        <span class="xe-req" aria-hidden="true">*</span>
      </span>

      {#if selectedAccountID}
        {@const lockedTint = accountTypeTint(selectedFirstAccount)}
        <div class="xe-acc is-locked">
          <span class="xe-acc__tile" style={lockedTint.style} aria-hidden="true">
            <span class="ms">
              {lockedTint.icon}
            </span>
          </span>

          <span class="xe-acc__picked">
            <span class="xe-acc__name">{getAccountName(first_entry_account)}</span>
            {#if selectedFirstAccount}
              <span class="xe-acc__meta">{accountTypeLabel(selectedFirstAccount)}</span>
            {/if}
          </span>

          {#if balanceByAccount[first_entry_account]}
            <span
              class="xe-acc__bal"
              class:is-debit={balanceByAccount[first_entry_account].tone === 'debit'}
              class:is-credit={balanceByAccount[first_entry_account].tone === 'credit'}
              class:is-settled={balanceByAccount[first_entry_account].tone === 'settled'}>
              <b dir="rtl">
                {balanceByAccount[first_entry_account].amount}
                <span class="xe-acc__cur">{balanceByAccount[first_entry_account].symbol}</span>
              </b>
              <small>{balanceByAccount[first_entry_account].label}</small>
            </span>
          {/if}
        </div>
      {:else}
        <div class="xe-cell">
          <div
            class="xe-acc"
            class:is-open={showAccountDropdown}
            class:is-empty={!first_entry_account}>
            {#if first_entry_account}
              {@const tint = accountTypeTint(selectedFirstAccount)}
              <span class="xe-acc__tile" style={tint.style} aria-hidden="true">
                <span class="ms">
                  {tint.icon}
                </span>
              </span>

              <button
                type="button"
                class="xe-acc__picked"
                aria-label={firstAccountLabel}
                on:click={async () => {
                  first_entry_account = '';
                  first_entry_account_search = '';
                  showAccountDropdown = true;
                  filteredAccounts = pickableAccounts;

                  await tick();
                  first_entry_account_search_input?.focus();
                }}>
                <span class="xe-acc__name">{getAccountName(first_entry_account)}</span>

                {#if selectedFirstAccount}
                  <span class="xe-acc__meta">{accountTypeLabel(selectedFirstAccount)}</span>
                {/if}
              </button>

              {#if balanceByAccount[first_entry_account]}
                <span
                  class="xe-acc__bal"
                  class:is-debit={balanceByAccount[first_entry_account].tone === 'debit'}
                  class:is-credit={balanceByAccount[first_entry_account].tone === 'credit'}
                  class:is-settled={balanceByAccount[first_entry_account].tone === 'settled'}>
                  <b dir="rtl">
                    {balanceByAccount[first_entry_account].amount}
                    <span class="xe-acc__cur">{balanceByAccount[first_entry_account].symbol}</span>
                  </b>
                  <small>{balanceByAccount[first_entry_account].label}</small>
                </span>
              {/if}
            {:else}
              <span class="ms xe-acc__icon" aria-hidden="true">person</span>

              <input
                type="text"
                class="xe-acc__input"
                id="first_entry_account_search"
                bind:this={first_entry_account_search_input}
                bind:value={first_entry_account_search}
                placeholder={firstAccountLabel}
                aria-label={firstAccountLabel}
                autocomplete="off"
                on:input={() => {
                  showAccountDropdown = true;
                  filterAccounts();
                }}
                on:focus={() => {
                  showAccountDropdown = true;
                  filterAccounts();
                }}
                on:blur={(event) => {
                  /* Focus moving into the panel's own search box keeps it open. */
                  if (event.relatedTarget?.closest?.('.xe-dd')) return;

                  setTimeout(() => (showAccountDropdown = false), 150);
                }} />
            {/if}

            <span class="ms xe-acc__chev" aria-hidden="true">unfold_more</span>
          </div>

          {#if showAccountDropdown}
            <div class="xe-dd" role="listbox">
              <div class="xe-dd__head">
                <label class="xe-dd__search" for="exchange_account_panel_search">
                  <span class="ms" aria-hidden="true">search</span>

                  <input
                    id="exchange_account_panel_search"
                    type="search"
                    autocomplete="off"
                    value={first_entry_account_search}
                    placeholder={t('Search accounts...')}
                    aria-label={t('Search accounts...')}
                    on:input={(event) => {
                      first_entry_account_search = event.currentTarget.value;
                      filterAccounts();
                    }} />
                </label>

                <button
                  type="button"
                  class="xe-dd__add"
                  title={t('Add Account')}
                  aria-label={t('Add Account')}
                  on:click={() => modalRefAdd.openModal()}>
                  <span class="ms" aria-hidden="true">person_add</span>
                  {t('New')}
                </button>
              </div>

              <div class="xe-dd__list">
                {#each customerAccountRows as acc (acc.id)}
                  {@const tint = accountTypeTint(acc)}
                  <div class="xe-opt-row">
                    <button
                      type="button"
                      role="option"
                      aria-selected={first_entry_account === acc.id}
                      class="xe-opt"
                      class:is-selected={first_entry_account === acc.id}
                      on:mousedown|preventDefault={() => {
                        first_entry_account = acc.id;
                        first_entry_account_search = accountSearchName(acc);
                        showAccountDropdown = false;
                      }}>
                      <span class="xe-opt__tile" style={tint.style} aria-hidden="true">
                        <span class="ms">{tint.icon}</span>
                      </span>

                      <span class="xe-opt__copy">
                        <strong>{accountSearchName(acc)}</strong>
                        <small>
                          {accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}
                        </small>
                      </span>

                      {#if balanceByAccount[acc.id]}
                        <span
                          class="xe-opt__bal"
                          class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                          class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                          class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                          <b dir="rtl">
                            {balanceByAccount[acc.id].amount}
                            <span class="xe-opt__cur">{balanceByAccount[acc.id].symbol}</span>
                          </b>
                        </span>
                      {/if}
                    </button>

                    <button
                      type="button"
                      class="xe-opt__pin"
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
                  <div class="xe-dd__empty">{t('No accounts found')}</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <AccountModal
        bind:this={modalRefAdd}
        {accountTypes}
        on:saved={async (e) => {
          await loadAccounts();
          first_entry_account = e.detail.account.id;
          first_entry_account_search = '';
        }} />
    </div>

    <!-- debit + rate -->
    <div class="xe-grid xe-grid--amount">
      <div class="xe-cell">
        <label class="xe-label" for="first_entry_debit">
          {t('Debit')}
          <span class="xe-req" aria-hidden="true">*</span>
        </label>

        <div class="xe-amount">
          <input
            disabled={!first_currency || !second_currency}
            type="text"
            inputmode="numeric"
            pattern="[0-9,]*"
            id="first_entry_debit"
            class="xe-amount__input"
            placeholder="0"
            value={format(first_entry_debit)}
            on:keydown={onlyNumbers}
            on:input={(e) => onFirstDebitInput(normalize(e.target.value))} />

          <div class="xe-currency">
            <button
              class="xe-currency__btn"
              type="button"
              aria-expanded={currencyMenuFor === 'debit'}
              aria-haspopup="listbox"
              aria-label={first_currency ? t(first_currency) : t('Currency')}
              on:click|stopPropagation={() => toggleCurrencyMenu('debit')}>
              <span>{first_currency ? currencySymbol(first_currency) : t('Currency')}</span>
              <span class="ms" aria-hidden="true">expand_more</span>
            </button>

            {#if currencyMenuFor === 'debit'}
              <ul class="xe-menu" role="listbox">
                {#each currencies as cur}
                  <li role="option" aria-selected={first_currency === cur.code}>
                    <button
                      class="xe-menu__item"
                      class:selected={first_currency === cur.code}
                      on:click|stopPropagation={() => selectFirstCurrency(cur.code)}
                      type="button">
                      <span>{t(cur.code)}</span>
                      <small>{cur.symbol}</small>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>

      <div class="xe-cell">
        <span class="xe-label">{t('Rate')}</span>

        <div class="xe-box">
          <span class="ms xe-box__icon" aria-hidden="true">swap_horiz</span>

          <input
            disabled={!first_currency || !second_currency}
            type="text"
            inputmode="numeric"
            pattern="[0-9,]*"
            id="exrate"
            class="xe-box__input"
            placeholder="1"
            bind:value={exchangeRateAmount}
            on:keydown={onlyNumbers}
            on:input={() => calculateAmount()} />

          <button
            class="xe-rate-toggle"
            class:is-divide={!exchangeRateMultiple}
            type="button"
            title={exchangeRateMultiple ? t('Multiply') : t('Divide')}
            aria-label={exchangeRateMultiple ? t('Multiply') : t('Divide')}
            on:click={() => {
              exchangeRateMultiple = !exchangeRateMultiple;
              calculateExchangeAmount();
              calculateAmount();
            }}>
            {exchangeRateMultiple ? '×' : '÷'}
          </button>
        </div>

        {#if exchangeRateAmount != exchangeRateAmountSystem}
          <span class="xe-note">
            {t('System Rate')}: <span dir="ltr">{Number(exchangeRateAmountSystem || 0).toFixed(4)}</span>
          </span>
        {/if}
      </div>
    </div>

    <!-- credit + benefit -->
    <div class="xe-grid xe-grid--amount">
      <div class="xe-cell">
        <label class="xe-label" for="second_entry_credit">
          {t('Credit')}
          <span class="xe-req" aria-hidden="true">*</span>
        </label>

        <div class="xe-amount">
          <input
            disabled={!first_currency || !second_currency}
            type="text"
            inputmode="numeric"
            pattern="[0-9,]*"
            id="second_entry_credit"
            class="xe-amount__input"
            placeholder="0"
            value={format(second_entry_credit)}
            on:keydown={onlyNumbers}
            on:input={(e) => onFirstCreditInput(normalize(e.target.value))} />

          <div class="xe-currency">
            <button
              class="xe-currency__btn"
              type="button"
              aria-expanded={currencyMenuFor === 'credit'}
              aria-haspopup="listbox"
              aria-label={second_currency ? t(second_currency) : t('Currency')}
              on:click|stopPropagation={() => toggleCurrencyMenu('credit')}>
              <span>{second_currency ? currencySymbol(second_currency) : t('Currency')}</span>
              <span class="ms" aria-hidden="true">expand_more</span>
            </button>

            {#if currencyMenuFor === 'credit'}
              <ul class="xe-menu" role="listbox">
                {#each currencies as cur}
                  <li role="option" aria-selected={second_currency === cur.code}>
                    <button
                      class="xe-menu__item"
                      class:selected={second_currency === cur.code}
                      on:click|stopPropagation={() => selectSecondCurrency(cur.code)}
                      type="button">
                      <span>{t(cur.code)}</span>
                      <small>{cur.symbol}</small>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>

      <div class="xe-cell">
        <span class="xe-label">{t('Benefit')}</span>

        <div class="xe-box is-readonly" class:is-negative={Number(benefit_amount) < 0}>
          <span class="ms xe-box__icon" aria-hidden="true">
            {Number(benefit_amount) < 0 ? 'trending_down' : 'trending_up'}
          </span>

          <b class="xe-box__value" dir="ltr">
            {Number(benefit_amount || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 6,
            })}
          </b>

          <span class="xe-box__cur">{first_currency ? currencySymbol(first_currency) : ''}</span>
        </div>
      </div>
    </div>

    <!-- counterpart account + date -->
    <div class="xe-grid xe-grid--meta">
      <div class="xe-cell">
        <span class="xe-label">{secondAccountLabel}</span>

        {#if general}
          <span class="xe-chip is-static">
            <span class="ms" aria-hidden="true">block</span>
            <b>{t('No Track')}</b>
          </span>
        {:else}
          <div class="xe-account-row">
            <button
              type="button"
              class="xe-account-select"
              class:is-selected={exchangeMode !== 'notrack'}
              aria-label={secondAccountLabel}
              aria-haspopup="dialog"
              aria-expanded={showTrackModal}
              on:click={openSecondAccountPicker}>
              <span class="ms xe-account-select__icon" aria-hidden="true">
                {exchangeMode === 'notrack'
                  ? 'block'
                  : accountTypeTint(selectedSecondAccount).icon}
              </span>

              <strong class="xe-account-select__name">{secondAccountName}</strong>
            </button>

            <button
              type="button"
              class="xe-account-toggle"
              class:is-on={showTrackModal}
              aria-label={t('Account')}
              aria-haspopup="dialog"
              aria-expanded={showTrackModal}
              title={t('Account')}
              on:click={openSecondAccountPicker}>
              <span class="ms" aria-hidden="true">person_search</span>
            </button>
          </div>
        {/if}
      </div>

      <div class="xe-cell xe-cell--date">
        <span class="xe-label">{t('Date')}</span>

        <div class="xe-date persianDatePicker">
          <input type="date" class="xe-date__input" data-bind="date" bind:value={date} />
          <span class="input-group-text persian-date-text"></span>
        </div>
      </div>
    </div>

    <label class="xe-desc" for="c-description">
      <span class="xe-label">{t('Description')}</span>

      <textarea
        id="c-description"
        class="xe-desc__box"
        rows="2"
        placeholder={t('Description')}
        bind:value={description}></textarea>
    </label>
  </div>

  <div class="xe-foot">
    <button type="button" class="xe-btn xe-btn--cancel" on:click={closeForm}>
      {t('Cancel')}
    </button>

    <button type="button" class="xe-btn xe-btn--save" on:click={saveExchange}>
      <span class="ms xe-btn__icon" aria-hidden="true">check</span>
      {exchangeId ? t('Update Exchange') : t('Add Exchange')}
    </button>
  </div>

  {#if showTrackModal}
    <!-- The reference draws this as a floating list under the account field,
         so the panel is positioned from the field rect (trackPickerStyle) and
         the full-screen layer only exists to catch clicks outside of it. -->
    <div
      use:portal
      class="xe-picker-layer"
      role="presentation"
      on:click|self={() => (showTrackModal = false)}>
      <div
        class="xe-picker"
        id="trackModal"
        role="dialog"
        aria-label={t('Account')}
        style={trackPickerStyle}>
        <div class="xe-picker__body">
          <div class="xe-picker__search">
            <label class="xe-picker__box" for="exchange_picker_search">
              <span class="ms" aria-hidden="true">search</span>

              <input
                id="exchange_picker_search"
                type="search"
                autocomplete="off"
                placeholder={t('Search accounts...')}
                bind:value={second_entry_account_search} />
            </label>

            <button
              type="button"
              class="xe-picker__new"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => {
                /* The account form is an AppModal nested in this dialog, so
                   the list steps aside while it is open; its saved event
                   brings the user back with the new account selected. */
                showTrackModal = false;
                modalRef?.openModal();
              }}>
              <span class="ms" aria-hidden="true">person_add</span>
              {t('New')}
            </button>
          </div>

          <div class="xe-picker__list" role="listbox" aria-label={t('Account')}>
            {#if showPinnedSection}
              <span class="xe-picker__sect">
                <span class="ms" aria-hidden="true">keep</span>
                {t('Pinned')}
              </span>
            {/if}

            {#each pinnedSecondAccounts as acc (acc.id)}
              {@const tint = accountTypeTint(acc)}
              <div class="xe-picker__row-wrap">
                <button
                  type="button"
                  role="option"
                  aria-selected={Number(second_entry_account) === Number(acc.id)}
                  class="xe-picker__row"
                  class:is-selected={Number(second_entry_account) === Number(acc.id)}
                  on:click={() => pickSecondAccount(acc.id)}>
                  <span class="xe-picker__avatar" style={tint.style} aria-hidden="true">
                    <span class="ms">
                      {tint.icon}
                    </span>
                  </span>

                  <span class="xe-picker__copy">
                    <strong>{accountSearchName(acc)}</strong>
                    <small>{accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}</small>
                  </span>

                  {#if balanceByAccount[acc.id]}
                    <span
                      class="xe-picker__bal"
                      class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                      class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                      class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                      <b dir="rtl">
                        {balanceByAccount[acc.id].amount}
                        <span class="xe-picker__cur">{balanceByAccount[acc.id].symbol}</span>
                      </b>
                    </span>
                  {/if}
                </button>

                <button
                  type="button"
                  class="xe-picker__pin"
                  class:is-on={true}
                  title={t('Unpin account')}
                  aria-label={t('Unpin account')}
                  on:click={() => toggleAccountPin(acc.id)}>
                  <span class="ms" aria-hidden="true">keep</span>
                </button>
              </div>
            {/each}

            {#if unpinnedSecondAccounts.length > 0}
              <span class="xe-picker__sect">{t('All Accounts')}</span>
            {/if}

            {#each unpinnedSecondAccounts as acc (acc.id)}
              {@const tint = accountTypeTint(acc)}
              <div class="xe-picker__row-wrap">
                <button
                  type="button"
                  role="option"
                  aria-selected={Number(second_entry_account) === Number(acc.id)}
                  class="xe-picker__row"
                  class:is-selected={Number(second_entry_account) === Number(acc.id)}
                  on:click={() => pickSecondAccount(acc.id)}>
                  <span class="xe-picker__avatar" style={tint.style} aria-hidden="true">
                    <span class="ms">
                      {tint.icon}
                    </span>
                  </span>

                  <span class="xe-picker__copy">
                    <strong>{accountSearchName(acc)}</strong>
                    <small>{accountTypeLabel(acc) === 'N/A' ? '' : accountTypeLabel(acc)}</small>
                  </span>

                  {#if balanceByAccount[acc.id]}
                    <span
                      class="xe-picker__bal"
                      class:is-debit={balanceByAccount[acc.id].tone === 'debit'}
                      class:is-credit={balanceByAccount[acc.id].tone === 'credit'}
                      class:is-settled={balanceByAccount[acc.id].tone === 'settled'}>
                      <b dir="rtl">
                        {balanceByAccount[acc.id].amount}
                        <span class="xe-picker__cur">{balanceByAccount[acc.id].symbol}</span>
                      </b>
                    </span>
                  {/if}
                </button>

                <button
                  type="button"
                  class="xe-picker__pin"
                  title={t('Pin account')}
                  aria-label={t('Pin account')}
                  on:click={() => toggleAccountPin(acc.id)}>
                  <span class="ms" aria-hidden="true">keep</span>
                </button>
              </div>
            {/each}

            {#if matchingSecondAccounts.length === 0}
              <div class="xe-picker__empty">{t('No accounts found')}</div>
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
      track_ID = e.detail.account.id;
      showTrackModal = false;
    }} />
</div>

{#if showReceipt}
  <ExchangeReceiptModal exchange={savedExchange} on:close={() => (showReceipt = false)} />
{/if}

<style>
  /* =========================================================================
     Add Exchange — the visual contract mirrors the reference "Create Journal"
     dialog (Journal.dc.html) through AddJournal.svelte: 10px stacked
     sections, 40px boxes, 30px segmented tabs, 32px date / counter row and
     32px footer actions. Every value reads from the shared --z-* tokens, so
     dark mode is free.
     ========================================================================= */

  .exchange-form-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    color: var(--z-text);
    font-family: var(--z-font);
  }

  .xe-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 12px 14px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  /* ---- mode tabs (track / treasury / no track) ---- */
  .xe-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--z-surface-3);
  }

  .xe-tabs--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .xe-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 30px;
    padding: 0 6px;
    border: 0;
    border-radius: 7px;
    background: var(--z-surface);
    color: var(--z-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .xe-tab .ms {
    flex: 0 0 auto;
    font-size: 15px;
  }

  .xe-tab__copy {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .xe-tab:hover {
    color: var(--z-ink);
  }

  .xe-tab.is-active {
    color: #ffffff;
    font-weight: 800;
    background: var(--z-link);
    box-shadow: 0 4px 10px -4px var(--z-link);
  }

  /* --z-link turns pale in dark mode, so the ink on top of it has to flip. */
  :global(html.dark) .xe-tab.is-active {
    color: #0b1530;
  }

  /* ---- field scaffolding ---- */
  .xe-field,
  .xe-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .xe-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .xe-grid--amount,
  .xe-grid--meta {
    grid-template-columns: minmax(0, 1fr) 150px;
    align-items: end;
  }

  .xe-grid--meta {
    grid-template-columns: minmax(0, 1fr) 124px;
    align-items: start;
  }

  .xe-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--z-text);
  }

  .xe-req {
    color: var(--z-danger);
  }

  /* ---- account box ---- */
  .xe-acc {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 9px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .xe-acc.is-empty {
    border-style: dashed;
    border-color: var(--z-border-strong);
    background: var(--z-surface-2);
  }

  .xe-acc.is-open,
  .xe-acc:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-acc.is-locked {
    background: var(--z-surface-2);
  }

  /* Tint and glyph come from the account class (inline style), exactly as
     the reference paints the account avatar. */
  .xe-acc__tile {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 15px;
  }

  .xe-acc__icon,
  .xe-acc__chev {
    flex: 0 0 auto;
    font-size: 18px;
    color: var(--z-subtle);
  }

  .xe-acc__input {
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

  .xe-acc__input::placeholder {
    color: var(--z-subtle);
    font-weight: 600;
  }

  .xe-acc__picked {
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

  .xe-acc.is-locked .xe-acc__picked {
    cursor: default;
  }

  .xe-acc__name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  .xe-acc__meta {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    color: var(--z-muted);
  }

  .xe-acc__bal {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    line-height: 1.25;
    text-align: end;
  }

  .xe-acc__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .xe-acc__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .xe-acc__bal small {
    font-size: 9.5px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--z-muted);
  }

  /* Only the amount takes the tone: a debit balance is red, a credit one
     green and a settled balance muted — the caption stays muted. */
  .xe-acc__bal.is-debit b {
    color: var(--z-danger);
  }

  .xe-acc__bal.is-credit b {
    color: var(--z-ok);
  }

  .xe-acc__bal.is-settled b {
    color: var(--z-muted);
  }

  /* ---- dropdowns ---- */
  .xe-dd {
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

  .xe-dd__head {
    display: flex;
    gap: 4px;
  }

  .xe-dd__search {
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

  .xe-dd__search .ms {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .xe-dd__search input {
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

  .xe-dd__search input::placeholder {
    color: var(--z-subtle);
  }

  .xe-dd__search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .xe-dd__add {
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

  .xe-dd__add .ms {
    font-size: 16px;
  }

  .xe-dd__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    /* 220px of rows, but never more than the viewport can show under the
       field - the list drops down and has no room to flip. */
    max-height: min(220px, 40vh);
    overflow-y: auto;
  }

  .xe-dd__empty {
    padding: 10px;
    text-align: center;
    font-size: 11.5px;
    color: var(--z-subtle);
  }

  .xe-opt-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .xe-opt {
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

  .xe-opt:hover {
    background: var(--z-surface-2);
  }

  .xe-opt.is-selected {
    background: var(--z-brand-soft);
  }

  .xe-opt__tile {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
  }

  .xe-opt__tile .ms {
    font-size: 15px;
  }

  .xe-opt__copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .xe-opt__copy strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
    color: var(--z-ink);
  }

  .xe-opt__copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--z-muted);
  }

  .xe-opt__bal {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .xe-opt__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .xe-opt__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .xe-opt__bal.is-debit b {
    color: var(--z-danger);
  }

  .xe-opt__bal.is-credit b {
    color: var(--z-ok);
  }

  .xe-opt__bal.is-settled b {
    color: var(--z-muted);
  }

  .xe-opt__pin {
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

  .xe-opt__pin:hover {
    background: var(--z-surface-2);
    color: var(--z-link);
  }

  .xe-opt__pin.is-on {
    color: var(--z-link);
    opacity: 1;
  }

  /* ---- amount ---- */
  .xe-amount {
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

  .xe-amount:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-amount__input {
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

  .xe-amount__input::placeholder {
    color: var(--z-subtle);
  }

  .xe-amount__input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* ---- currency picker ---- */
  .xe-currency {
    position: relative;
    flex: 0 0 auto;
    margin-inline-end: 5px;
  }

  .xe-currency__btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 0 4px 0 7px;
    border: 0;
    border-radius: 7px;
    background: var(--z-surface-3);
    font-family: var(--z-font-num);
    font-size: 12px;
    font-weight: 800;
    color: var(--z-ink);
    cursor: pointer;
  }

  .xe-currency__btn .ms {
    font-size: 15px;
    color: var(--z-muted);
  }

  .xe-menu {
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

  .xe-menu__item {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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

  .xe-menu__item small {
    font-family: var(--z-font-num);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--z-muted);
  }

  .xe-menu__item:hover {
    background: var(--z-surface-2);
  }

  .xe-menu__item.selected {
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-weight: 800;
  }

  .xe-menu__item.selected small {
    color: var(--z-link);
    opacity: 0.75;
  }

  /* ---- rate / benefit box ---- */
  .xe-box {
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

  .xe-box:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-box.is-readonly {
    border-width: 1px;
    border-color: var(--z-border-soft);
    background: var(--z-surface-2);
  }

  .xe-box__icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .xe-box__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0;
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

  .xe-box__input::placeholder {
    color: var(--z-subtle);
    font-weight: 600;
  }

  .xe-box__input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .xe-box__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--z-font-num);
    font-size: 13px;
    font-weight: 800;
    color: var(--z-ok);
    text-align: right;
  }

  .xe-box__cur {
    flex: 0 0 auto;
    font-family: var(--z-font);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--z-muted);
  }

  .xe-box.is-readonly .xe-box__icon {
    color: var(--z-ok);
  }

  /* A loss flips the whole benefit box to the danger tone. */
  .xe-box.is-negative .xe-box__value,
  .xe-box.is-negative .xe-box__icon {
    color: var(--z-danger);
  }

  .xe-rate-toggle {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--z-surface-3);
    color: var(--z-link);
    font-family: var(--z-font-num);
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .xe-rate-toggle:hover {
    background: var(--z-brand-soft);
  }

  .xe-rate-toggle.is-divide {
    color: var(--z-danger);
  }

  .xe-note {
    font-family: var(--z-font-num);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--z-muted);
  }

  /* ---- counterpart account + date ---- */
  .xe-account-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .xe-account-select {
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

  .xe-account-select:hover,
  .xe-account-select[aria-expanded='true'] {
    border-color: var(--z-link);
    color: var(--z-link);
  }

  /* Selected state is the reference chip: brand-soft fill, solid brand
     border and brand text instead of the dashed empty-field hint. */
  .xe-account-select.is-selected {
    border-style: solid;
    border-color: currentColor;
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .xe-account-select__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--z-subtle);
  }

  .xe-account-select.is-selected .xe-account-select__icon {
    color: inherit;
  }

  .xe-account-select__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 11.5px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
  }

  .xe-account-toggle {
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

  .xe-account-toggle:hover,
  .xe-account-toggle.is-on {
    border-style: solid;
    border-color: var(--z-link);
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .xe-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 9px;
    border: 1px solid var(--z-border-soft);
    border-radius: 8px;
    background: var(--z-surface-2);
    color: var(--z-muted);
    font-size: 11.5px;
  }

  .xe-chip .ms {
    font-size: 16px;
    color: var(--z-subtle);
  }

  .xe-chip b {
    font-weight: 700;
    color: var(--z-text);
  }

  .xe-cell--date {
    width: 124px;
  }

  .xe-date {
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

  .xe-date:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-date > input[type='date'] {
    display: none;
  }

  .xe-date :global(.legacy-app-date-picker-host) {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .xe-date :global(.app-date-field) {
    display: block;
    width: 100%;
    height: 100%;
    gap: 0;
  }

  .xe-date :global(.app-date-field .date-label) {
    display: none;
  }

  .xe-date :global(.pdp),
  .xe-date :global(.pdp-group) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .xe-date :global(.pdp-input) {
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
  .xe-desc {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .xe-desc__box {
    width: 100%;
    min-height: 52px;
    padding: 7px 9px;
    border: 1px solid var(--z-border);
    border-radius: 8px;
    background: var(--z-surface);
    color: var(--z-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.6;
    resize: vertical;
    box-sizing: border-box;
    outline: 0;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .xe-desc__box:focus {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-desc__box::placeholder {
    color: var(--z-subtle);
  }

  /* ---- footer ---- */
  .xe-foot {
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

  .xe-btn {
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

  .xe-btn--cancel:hover {
    border-color: var(--z-border-strong);
    color: var(--z-ink);
  }

  .xe-btn--save {
    padding: 0 14px;
    border: 0;
    color: #ffffff;
    background: var(--z-link);
  }

  :global(html.dark) .xe-btn--save {
    color: #0b1530;
  }

  .xe-btn--save:hover {
    filter: brightness(1.06);
  }

  .xe-btn__icon {
    font-size: 16px;
  }

  /* ---- counterpart account picker --------------------------------
   * The reference draws this as a floating list under the account field,
   * so the panel is positioned from the field rect (trackPickerStyle) and
   * the full-screen layer only exists to catch clicks outside of it. */
  .xe-picker-layer {
    position: fixed;
    inset: 0;
    z-index: 10060;
    pointer-events: auto;
  }

  .xe-picker {
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

  .xe-picker__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    padding: 4px;
  }

  .xe-picker__search {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
  }

  .xe-picker__box {
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

  .xe-picker__box .ms {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .xe-picker__box:focus-within {
    border-color: var(--z-link);
    box-shadow: var(--z-ring);
  }

  .xe-picker__box input {
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

  .xe-picker__box input::placeholder {
    color: var(--z-subtle);
  }

  .xe-picker__box input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .xe-picker__new {
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

  .xe-picker__new .ms {
    font-size: 16px;
  }

  .xe-picker__new:hover {
    border-color: var(--z-brand-300);
  }

  .xe-picker__list {
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

  .xe-picker__sect {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    padding: 6px 8px 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--z-subtle);
  }

  .xe-picker__sect .ms {
    font-size: 12px;
    color: var(--z-link);
  }

  .xe-picker__row-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .xe-picker__row {
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

  .xe-picker__row:hover {
    background: var(--z-surface-2);
  }

  .xe-picker__row.is-selected {
    background: var(--z-brand-soft);
  }

  .xe-picker__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--z-surface-3);
    color: var(--z-muted);
  }

  .xe-picker__avatar .ms {
    font-size: 15px;
  }

  .xe-picker__copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .xe-picker__copy strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--z-ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .xe-picker__copy small {
    overflow: hidden;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.25;
    color: var(--z-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .xe-picker__bal {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .xe-picker__bal b {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-family: var(--z-font-num);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-ink);
  }

  .xe-picker__cur {
    font-family: var(--z-font);
    font-weight: 700;
  }

  .xe-picker__bal.is-debit b {
    color: var(--z-danger);
  }

  .xe-picker__bal.is-credit b {
    color: var(--z-ok);
  }

  .xe-picker__bal.is-settled b {
    color: var(--z-muted);
  }

  .xe-picker__pin {
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

  .xe-picker__pin .ms {
    font-size: 16px;
  }

  .xe-picker__pin:hover {
    background: var(--z-surface-3);
    opacity: 1;
  }

  .xe-picker__pin.is-on {
    color: var(--z-link);
    opacity: 1;
  }

  .xe-picker__pin.is-on:hover {
    background: var(--z-brand-soft);
  }

  .xe-picker__empty {
    padding: 10px;
    text-align: center;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--z-subtle);
  }

  @media (max-width: 480px) {
    .xe-grid--amount {
      grid-template-columns: minmax(0, 1fr) 118px;
    }

    .xe-grid--meta {
      grid-template-columns: minmax(0, 1fr) 106px;
    }

    .xe-cell--date {
      width: 106px;
    }

    .xe-amount__input {
      font-size: 16px;
      padding: 0 9px;
    }

    .xe-picker__body {
      gap: 2px;
      padding: 6px;
    }
  }
</style>
