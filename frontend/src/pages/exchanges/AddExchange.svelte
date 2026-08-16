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
    });

    accounts = accounts.filter(
      (a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE', 'EXCHANGE'].includes(a.code),
    );
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

    account = accounts.find((a) => a.id === first_entry_account);
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
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
        exchangeRateAmount = exchangeRate(1, first_currency, second_currency);
        exchangeRateAmountSystem = exchangeRateAmount;
        // if (first_entry_debit) {
        //   onFirstDebitInput(exchangeRate(first_entry_debit, first_currency, second_currency));
        // }
        // if (first_entry_credit) {
        //   onFirstCreditInput(exchangeRate(first_entry_credit, first_currency, second_currency));
        // }
      } else {
        exchangeRateAmount = exchangeRate(1, second_currency, first_currency);
        exchangeRateAmountSystem = exchangeRateAmount;
        // if (first_entry_debit) {
        //   onFirstDebitInput(exchangeRate(first_entry_debit, second_currency, first_currency));
        // }
        // if (first_entry_credit) {
        //   onFirstCreditInput(exchangeRate(first_entry_credit, second_currency, first_currency));
        // }
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
    // first_entry_credit = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }

  function onFirstDebitInput(value) {
    const amount = normalize(value);

    first_entry_debit = amount;
    // first_entry_credit = null;
    calculateAmount();

    // second_entry_credit = amount;
    // second_entry_debit = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }
  function onFirstCreditInput(value) {
    const amount = normalize(value);

    first_entry_credit = amount;
    // first_entry_debit = null;

    second_entry_debit = amount;
    // second_entry_credit = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }

  function onSecondDebitInput(value) {
    const amount = normalize(value);

    second_entry_debit = amount;
    // second_entry_credit = null;

    first_entry_credit = amount;
    // first_entry_debit = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }

  function onSecondCreditInput(value) {
    const amount = normalize(value);

    second_entry_credit = amount;
    // second_entry_debit = null;

    // first_entry_debit = amount;
    // first_entry_credit = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
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
  let filteredSecondAccounts = [];

  let currencyMenuFor = null; // 'debit' | 'credit'
  let first_entry_account_search_input = null;

  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id);
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
    if (currencyMenuFor && !event.target.closest('.exchange-currency-picker')) {
      currencyMenuFor = null;
    }
  }

  function calculateAccountBalance(accountId, currency) {
    let balance = {};
    // is treasury account, show balance of all linked accounts

    allExchanges.forEach((j) => {
      if (j.first_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.first_entry_credit || 0) - Number(j.first_entry_debit || 0));
      }
      if (j.second_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.second_entry_credit || 0) - Number(j.second_entry_debit || 0));
      }
    });

    if (accounts.find((a) => a.id === accountId)?.code === 'TREASURY') {
      treasury_balance = balance[currency] || 0;
    }

    console.log('Calculated balance for account', accountId, accounts.length, balance, allExchanges.length);
    return balance.toString
      ? Object.entries(balance)
          .map(([cur, amt]) =>
            cur == currency
              ? t('Balance') +
                `: <span dir='ltr' class='text-${amt > 0 ? 'success' : 'danger'}'>${amt.toFixed(2)}</span> ${t(cur)}`
              : '',
          )
          .join('')
      : '';
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="exchange-form-page" bind:this={componentRoot}>
  <div class="card shadow-sm exchange-form-card">
    <div class="card-body exchange-form-fields">
      <div class="row g-2 exchange-form-row">
        

        {#if selectedAccountID}
          <div class="col-md-3 exchange-account-field">
            <label class="exchange-field-label">{t('Select Account')}</label>
            <div class="exchange-unified-input-group">
              <span class="form-control form-control-sm exchange-account-selected-name">
                {getAccountName(first_entry_account)}
              </span>
            </div>
          </div>
        {:else}
          <div class="col-md-3 exchange-account-field">
  <label class="exchange-field-label">{t('Select Account')}</label>

  <div class="exchange-account-anchor">
    <div class="exchange-account-control" class:is-open={showAccountDropdown}>
      <span class="exchange-account-control__icon" aria-hidden="true">
        <i class="bi bi-person"></i>
      </span>

      {#if first_entry_account}
        <button
          type="button"
          class="exchange-selected-account"
          aria-label={t('Select Account')}
          aria-haspopup="listbox"
          aria-expanded={showAccountDropdown}
          aria-controls="exchange-account-listbox"
          on:click={async () => {
            first_entry_account = '';
            first_entry_account_search = '';
            showAccountDropdown = true;
            filteredAccounts = accounts;
            await tick();
            first_entry_account_search_input?.focus();
          }}>
          <span class="exchange-selected-account__name">
            {getAccountName(first_entry_account)}
          </span>
          <i class="bi bi-pencil-square" aria-hidden="true"></i>
        </button>
      {:else}
        <input
          type="text"
          class="exchange-account-search-input"
          id="first_entry_account_search"
          bind:this={first_entry_account_search_input}
          bind:value={first_entry_account_search}
          placeholder={t('Select Account')}
          aria-label={t('Select Account')}
          aria-autocomplete="list"
          aria-controls="exchange-account-listbox"
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
                name.toLowerCase().includes(
                  first_entry_account_search.trim().toLowerCase(),
                )
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
                  name.toLowerCase().includes(
                    first_entry_account_search.trim().toLowerCase(),
                  )
                );
              });
            } else {
              filteredAccounts = accounts;
            }
          }}
          on:blur={() =>
            setTimeout(() => {
              showAccountDropdown = false;
            }, 150)} />
      {/if}

      <button
        type="button"
        class="exchange-account-add"
        title={t('Add Account')}
        aria-label={t('Add Account')}
        on:click={() => modalRefAdd.openModal()}>
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        <span>{t('Add')}</span>
      </button>
    </div>

    <input type="hidden" bind:value={first_entry_account} />

    {#if showAccountDropdown && filteredAccounts.length > 0}
      <ul
        id="exchange-account-listbox"
        class="exchange-account-dropdown"
        role="listbox">
        {#each filteredAccounts as acc (acc.id)}
          <li role="option" aria-selected={first_entry_account === acc.id}>
            <button
              type="button"
              class="exchange-account-option"
              class:is-selected={first_entry_account === acc.id}
              on:mousedown|preventDefault={() => {
                first_entry_account = acc.id;
                first_entry_account_search = getAccountName(acc.id);
                showAccountDropdown = false;
              }}>
              <span class="exchange-account-option__avatar" aria-hidden="true">
                <i class="bi bi-person"></i>
              </span>

              <span class="exchange-account-option__copy">
                <strong>{getAccountName(acc.id)}</strong>
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
                class="bi bi-chevron-right exchange-account-option__arrow"
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
    }} />

  {#if first_entry_account}
    <div class="exchange-account-balance">
      <i class="bi bi-wallet2" aria-hidden="true"></i>
      <span>
        {@html first_currency
          ? calculateAccountBalance(first_entry_account, first_currency)
          : ''}
      </span>
    </div>
  {/if}
</div>

        {/if}
        <div class="col-md-3 exchange-date-field">
          <label class="exchange-field-label">{t('Date')}</label>
          <div class="input-group input-group-sm persianDatePicker exchange-unified-input-group">
            <input type="date" class="form-control form-control-sm" data-bind="date" bind:value={date} />
            <span class="input-group-text persian-date-text"></span>
          </div>
        </div>
        

        <div class="col-md-2 exchange-amount-field">
          <label class="exchange-field-label">{t('Debit')}</label>
          <div
            class="exchange-amount-row exchange-amount-row--debit"
            style="border-color: var(--exchange-debit-border, #e2e8f0) !important; background: var(--exchange-debit-bg, #feecec); box-shadow: none !important; outline: none !important;">
            <div
              class="input-group input-group-sm exchange-unified-input-group exchange-unified-input-group--inline"
              style="border-color: transparent !important; background: var(--exchange-debit-bg, #feecec); box-shadow: none !important; outline: none !important;">
              <input
                disabled={!first_currency || !second_currency}
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="first_entry_debit"
                class="form-control form-control-sm"
                style="background: var(--exchange-debit-bg, #feecec) !important; background-color: var(--exchange-debit-bg, #feecec) !important; color: var(--exchange-debit-color, #b91c1c); border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                placeholder={t('Debit')}
                value={format(first_entry_debit)}
                on:keydown={onlyNumbers}
                on:input={(e) => onFirstDebitInput(normalize(e.target.value))} />
            </div>
            <div class="exchange-currency-picker" style="border-inline-start-color: var(--exchange-debit-border, #fecaca);">
              <button
                class="exchange-currency-picker__btn"
                style="background: var(--exchange-debit-bg, #feecec) !important; color: var(--exchange-debit-color, #b91c1c);"
                type="button"
                aria-expanded={currencyMenuFor === 'debit'}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                on:click|stopPropagation={() => toggleCurrencyMenu('debit')}>
                {first_currency ? t(first_currency) : t('Currency')}
                <i class="bi bi-chevron-down" aria-hidden="true"></i>
              </button>
              {#if currencyMenuFor === 'debit'}
                <ul class="exchange-currency-menu" role="listbox">
                  {#each currencies as cur}
                    <li role="option" aria-selected={first_currency === cur.code}>
                      <button
                        class="exchange-currency-menu__item"
                        class:selected={first_currency === cur.code}
                        on:click|stopPropagation={() => selectFirstCurrency(cur.code)}
                        type="button">
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        </div>

        <div class="col-md-2 exchange-rate-field">
          <label class="exchange-field-label">{t('Rate')}</label>
          <div class="exchange-unified-input-group">
            <input
              disabled={!first_currency || !second_currency}
              type="text"
              inputmode="numeric"
              pattern="[0-9,]*"
              id="exrate"
              class="form-control form-control-sm"
              placeholder={t('Rate')}
              bind:value={exchangeRateAmount}
              on:keydown={onlyNumbers}
              on:input={(e) => {
                normalize(e.target.value);
                calculateAmount();
              }} />
            <button
              class="exchange-rate-toggle {exchangeRateMultiple ? 'text-success' : 'text-danger'}"
              type="button"
              on:click={() => {
                exchangeRateMultiple = !exchangeRateMultiple;
                calculateExchangeAmount();
                calculateAmount();
              }}>
              {@html exchangeRateMultiple ? '&times;' : '&divide;'}
            </button>
          </div>
          <div class="form-text mt-0 exchange-balance-text">
            {#if exchangeRateAmount != exchangeRateAmountSystem}
              {@html exchangeRateAmountSystem
                ? t('System Rate') +
                  `: <span dir='ltr' class='text-${exchangeRateAmountSystem > 1 ? 'success' : 'danger'}'>${exchangeRateAmountSystem.toFixed(4)}</span>`
                : ''}
            {/if}
          </div>
        </div>

        <div class="col-md-2 exchange-amount-field">
          <label class="exchange-field-label">{t('Credit')}</label>
          <div
            class="exchange-amount-row exchange-amount-row--credit"
            style="border-color: var(--exchange-credit-border, #e2e8f0) !important; background: var(--exchange-credit-bg, #e9f9ef); box-shadow: none !important; outline: none !important;">
            <div
              class="input-group input-group-sm exchange-unified-input-group exchange-unified-input-group--inline"
              style="border-color: transparent !important; background: var(--exchange-credit-bg, #e9f9ef); box-shadow: none !important; outline: none !important;">
              <input
                disabled={!first_currency || !second_currency}
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="second_entry_credit"
                class="form-control form-control-sm"
                style="background: var(--exchange-credit-bg, #e9f9ef) !important; background-color: var(--exchange-credit-bg, #e9f9ef) !important; color: var(--exchange-credit-color, #047857); border-color: transparent !important; box-shadow: none !important; outline: none !important;"
                placeholder={t('Credit')}
                value={format(second_entry_credit)}
                on:keydown={onlyNumbers}
                on:input={(e) => onFirstCreditInput(normalize(e.target.value))} />
            </div>
            <div class="exchange-currency-picker" style="border-inline-start-color: var(--exchange-credit-border, #bbf7d0);">
              <button
                class="exchange-currency-picker__btn"
                style="background: var(--exchange-credit-bg, #e9f9ef) !important; color: var(--exchange-credit-color, #047857);"
                type="button"
                aria-expanded={currencyMenuFor === 'credit'}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                on:click|stopPropagation={() => toggleCurrencyMenu('credit')}>
                {second_currency ? t(second_currency) : t('Currency')}
                <i class="bi bi-chevron-down" aria-hidden="true"></i>
              </button>
              {#if currencyMenuFor === 'credit'}
                <ul class="exchange-currency-menu" role="listbox">
                  {#each currencies as cur}
                    <li role="option" aria-selected={second_currency === cur.code}>
                      <button
                        class="exchange-currency-menu__item"
                        class:selected={second_currency === cur.code}
                        on:click|stopPropagation={() => selectSecondCurrency(cur.code)}
                        type="button">
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        </div>

        <div class="col-md-2 exchange-benefit-field">
          <label class="exchange-field-label">{t('Benefit')}</label>
          <div class="exchange-benefit-row">
            <div class="badge badge-{benefit_amount < 0 ? 'danger' : 'success'}">
              <span dir="ltr"
                >{benefit_amount.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}</span
              >{' '}
              {t(first_currency)}
            </div>
          </div>
        </div>

        <div class="col-md-3 exchange-description-field">
          <label class="exchange-field-label">{t('Description')}</label>
          <div class="exchange-unified-input-group">
            <input
              id="c-description"
              class="form-control form-control-sm"
              placeholder={t('Description')}
              bind:value={description} />
          </div>
        </div>

        <div class="col-md-4 exchange-mode-field">
          <div class="exchange-mode-actions">
            {#if !general}
              <button
                id="second_entry_account_search"
                class="exchange-mode-btn"
                class:exchange-mode-btn--active={second_entry_account == track_ID}
                class:exchange-mode-btn--track={second_entry_account == track_ID}
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
                class="exchange-mode-btn"
                class:exchange-mode-btn--active={second_entry_account == notrack_ID}
                class:exchange-mode-btn--notrack={second_entry_account == notrack_ID}
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
                class="exchange-mode-btn"
                class:exchange-mode-btn--active={second_entry_account == treasury_ID}
                class:exchange-mode-btn--treasury={second_entry_account == treasury_ID}
                type="button"
                on:click={() => {
                  second_entry_account = treasury_ID;
                }}>
                <i class="bi bi-box"></i>
                {t('Treasury')}
              </button>
            {/if}
          </div>
          <div class="form-text mt-0 text-end exchange-balance-text">
            {@html second_entry_account != notrack_ID
              ? second_currency
                ? calculateAccountBalance(second_entry_account, second_currency)
                : ''
              : ''}
          </div>
          {#if showTrackModal}
            <div
              use:portal
              class="track-picker-layer"
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
                    <button type="button" class="track-picker-close" aria-label={t('Close')} on:click={() => (showTrackModal = false)}><i class="bi bi-x-lg"></i></button>
                  </div>
                  <div class="modal-body track-picker-body">
                    <div class="mb-3">
                      <div class="exchange-unified-input-group track-search-group">
                        <span class="track-search-icon"><i class="bi bi-search"></i></span>
                        <input
                          type="text"
                          class="form-control form-control-sm"
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
                        <button
                          class="btn exchange-input-addon-btn"
                          type="button"
                          on:click={() => modalRef?.openModal()}>
                          <i class="bi bi-plus"></i>
                        </button>
                      </div>
                      <div class="track-account-list">
                        {#each filteredSecondAccounts as acc}
                          <div class="list-group track-account-group">
                            <button
                              type="button"
                              class="list-group-item list-group-item-action track-account-row"
                              on:click={() => {
                                second_entry_account = acc.id;
                                track_ID = acc.id;
                                showTrackModal = false;
                              }}>
                              <span class="track-account-avatar">{getAccountName(acc.id)?.trim()?.charAt(0) || '?'}</span>
                              <span class="track-account-name">{getAccountName(acc.id)}</span>
                              <span class="track-account-type">
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
                              <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'} track-row-arrow"></i>
                            </button>
                          </div>
                        {/each}
                        {#if filteredSecondAccounts.length === 0}
                          <div class="track-empty"><i class="bi bi-person-x"></i><span>{t('No accounts found')}</span></div>
                        {/if}
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

        <div class="col-md-3 d-flex align-items-start gap-2 exchange-submit-field">
          <button class="btn btn-primary btn-sm w-100 exchange-submit-btn" on:click={saveExchange}>
            <i class="bi bi-check-circle"></i>
            {exchangeId ? t('Update Exchange') : t('Add Exchange')}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

{#if showReceipt}
  <ExchangeReceiptModal exchange={savedExchange} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .exchange-form-page {
    --exchange-control-height: 2rem;
    --exchange-label-offset: 1.05rem;
    background: transparent;
    padding-bottom: 0;
    color: #0f172a;
  }

  .exchange-form-card {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.045) !important;
    overflow: hidden;
    background: #ffffff;
  }

  .exchange-form-card :global(.card-body) {
    padding: 0.85rem 1rem;
    overflow: visible;
  }

  .exchange-field-label {
    display: block;
    margin-bottom: 0.25rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .exchange-form-fields :global(.form-control),
  .exchange-form-fields :global(.form-select),
  .exchange-form-page :global(.form-control),
  .exchange-form-page :global(.form-select) {
    border-color: #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #334155;
    min-height: var(--exchange-control-height) !important;
    height: var(--exchange-control-height);
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .exchange-form-fields :global(.form-control-sm),
  .exchange-form-page :global(.form-control-sm) {
    min-height: var(--exchange-control-height) !important;
    height: var(--exchange-control-height);
    font-size: 0.8125rem;
    padding-block: 0.25rem;
    padding-inline: 0.625rem;
  }

  .exchange-form-fields :global(.form-control:focus),
  .exchange-form-fields :global(.form-select:focus),
  .exchange-form-page :global(.form-control:focus),
  .exchange-form-page :global(.form-select:focus) {
    border-color: #93c5fd;
    background: #ffffff;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .exchange-unified-input-group.persianDatePicker {
    flex-direction: row !important;
    align-items: stretch !important;
  }

  .exchange-unified-input-group.persianDatePicker :global(.persian-date-text) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-inline-start: 1px solid #e2e8f0 !important;
    border-bottom: 0;
    justify-content: center;
    text-align: center;
    background: var(--erp-bg) !important;
    height: var(--exchange-control-height);
    min-height: var(--exchange-control-height);
    max-height: var(--exchange-control-height);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0 0.45rem;
  }

  .exchange-unified-input-group.persianDatePicker :global(.input-group-text.badge-warning) {
    flex: 0 0 auto;
    width: auto;
    border-inline-start: 0 !important;
    border-bottom: 0;
    border-inline-end: 1px solid #e2e8f0;
    justify-content: center;
    height: var(--exchange-control-height);
    min-height: var(--exchange-control-height);
    max-height: var(--exchange-control-height);
  }

  .exchange-unified-input-group.persianDatePicker :global(.form-control) {
    flex: 1 1 50%;
    min-width: 0;
    width: auto;
    border-top: 0;
    height: var(--exchange-control-height);
    min-height: var(--exchange-control-height);
    max-height: var(--exchange-control-height);
    font-size: 0.78rem;
    line-height: 1.2;
    padding: 0.25rem 0.45rem;
  }

  .exchange-unified-input-group {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    min-height: var(--exchange-control-height);
  }

  .exchange-amount-row {
    display: flex;
    align-items: stretch;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: visible;
    background: #ffffff;
    min-height: var(--exchange-control-height);
  }

  .exchange-amount-row:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .exchange-unified-input-group--inline {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 0;
    overflow: hidden;
  }

  .exchange-currency-picker {
    position: relative;
    flex-shrink: 0;
    border-inline-start: 1px solid #e2e8f0;
  }

  .exchange-currency-picker__btn {
    height: 100%;
    min-height: var(--exchange-control-height);
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

  .exchange-currency-picker__btn:hover {
    background: #f8fafc;
  }

  .exchange-currency-menu {
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

  .exchange-currency-menu__item {
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

  .exchange-currency-menu__item:hover,
  .exchange-currency-menu__item.selected {
    background: #eff6ff;
    color: #0f6efd;
  }

  .exchange-unified-input-group:focus-within {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.1);
  }

  .exchange-unified-input-group :global(.form-control) {
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    flex: 1 1 auto;
    min-width: 0;
    background: #ffffff !important;
    min-height: var(--exchange-control-height) !important;
    height: var(--exchange-control-height);
  }

  .exchange-unified-input-group :global(.form-control:focus) {
    border: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .exchange-unified-input-group :global(.input-group-text) {
    border: 0 !important;
    border-radius: 0 !important;
    background: #ffffff;
  }

  .exchange-unified-input-group :global(.input-group-text:not(:first-child)) {
    border-inline-start: 1px solid #e2e8f0 !important;
  }

  .exchange-unified-input-group :global(.input-group-text:first-child:not(:last-child)) {
    border-inline-end: 1px solid #e2e8f0 !important;
  }

  .exchange-unified-input-group :global(.exchange-input-addon-btn),
  .exchange-unified-input-group :global(.btn-info) {
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
    min-height: var(--exchange-control-height);
  }

  .exchange-unified-input-group :global(.btn-info) {
    background: #eff6ff !important;
    color: #0f6efd;
  }

  .exchange-unified-input-group :global(.exchange-input-addon-btn:first-child),
  .exchange-unified-input-group :global(.btn-info.exchange-input-addon-btn:first-child) {
    border-inline-start: 0 !important;
  }

  .exchange-unified-input-group--account {
    direction: ltr;
  }

  .exchange-unified-input-group--account :global(.exchange-account-search-input),
  .exchange-unified-input-group--account .exchange-account-selected-name {
    direction: rtl;
    text-align: right;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
    min-height: var(--exchange-control-height) !important;
    height: var(--exchange-control-height);
  }

  .exchange-unified-input-group--account :global(.exchange-account-quick-btn) {
    border-inline-start: 0 !important;
    border-inline-end: 1px solid #e2e8f0 !important;
    flex-shrink: 0;
    background: #0f6efd !important;
    color: #ffffff !important;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
    min-width: var(--exchange-control-height);
    width: var(--exchange-control-height);
    padding: 0;
  }

  .exchange-unified-input-group--account :global(.exchange-account-quick-btn:hover),
  .exchange-unified-input-group--account :global(.exchange-account-quick-btn:focus) {
    background: #1d4ed8 !important;
    color: #ffffff !important;
  }

  .exchange-account-selected-name {
    display: flex;
    align-items: center;
    padding: 0 0.625rem;
    font-weight: 650;
    font-size: 0.8125rem;
    color: #334155;
    cursor: pointer;
    min-height: var(--exchange-control-height);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exchange-account-selected-name:hover {
    background: #f8fafc !important;
  }

  .exchange-form-dropdown {
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
    z-index: 1050;
  }

  .exchange-form-dropdown :global(.list-group-item) {
    border: 0;
    font-weight: 600;
    font-size: 0.82rem;
  }

  .exchange-form-dropdown :global(.list-group-item:hover) {
    background: #eff6ff;
    color: #0f6efd;
  }

  .exchange-form-page :global(.btn) {
    min-height: var(--exchange-control-height);
  }

  .exchange-form-page :global(.form-control::placeholder) {
    color: #94a3b8;
    font-weight: 500;
  }

  .exchange-invalid-feedback {
    margin-top: 4px;
    font-size: 0.7rem;
    color: #dc2626;
    font-weight: 600;
  }

  .exchange-balance-text {
    font-size: 0.68rem !important;
    line-height: 1.25;
  }

  .exchange-rate-toggle {
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
    min-height: var(--exchange-control-height);
    min-width: var(--exchange-control-height);
    background: #ffffff;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
  }

  .exchange-rate-toggle:hover {
    background: #f8fafc;
  }

  .exchange-benefit-row {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--exchange-control-height);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  }

  .exchange-benefit-row :global(.badge) {
    display: flex;
    width: 100%;
    min-height: var(--exchange-control-height);
    align-items: center;
    justify-content: center;
    border-radius: 0;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .exchange-mode-field,
  .exchange-submit-field {
    padding-top: var(--exchange-label-offset);
  }

  .exchange-mode-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .exchange-mode-btn {
    min-height: var(--exchange-control-height);
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

  .exchange-mode-btn:hover {
    background: #f8fafc;
  }

  .exchange-mode-btn--active.exchange-mode-btn--track {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .exchange-mode-btn--active.exchange-mode-btn--notrack {
    background: #1e293b;
    border-color: #1e293b;
    color: #ffffff;
  }

  .exchange-mode-btn--active.exchange-mode-btn--treasury {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #059669;
  }

  .exchange-submit-btn {
    min-height: var(--exchange-control-height);
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

   .exchange-account-field {
    position: relative;
    min-width: 0;
    overflow: visible;
  }

  .exchange-account-anchor {
    position: relative;
    z-index: 120;
    width: 100%;
    min-width: 0;
    overflow: visible;
  }

  .exchange-account-control {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: 2.375rem;
    min-height: 2.375rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #fff;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .exchange-account-control:hover {
    border-color: #bcc9db;
  }

  .exchange-account-control:focus-within,
  .exchange-account-control.is-open {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .exchange-account-control__icon {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    place-items: center;
    background: #fff;
    color: #8c9aad;
  }

  .exchange-account-search-input {
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
    line-height: 1.2;
    text-align: start;
    box-shadow: none;
  }

  .exchange-account-search-input:focus {
    border: 0;
    outline: 0;
    box-shadow: none;
  }

  .exchange-account-search-input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .exchange-selected-account {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
    height: 100%;
    padding-inline: 0.1rem 0.65rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 750;
    text-align: start;
    cursor: pointer;
  }

  .exchange-selected-account:hover {
    color: #1d4ed8;
  }

  .exchange-selected-account__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exchange-selected-account > i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .exchange-account-add {
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
    color: #fff;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .exchange-account-add:hover,
  .exchange-account-add:focus-visible {
    background: #1d4ed8;
    color: #fff;
  }

  .exchange-account-dropdown {
    position: absolute;
    top: calc(100% + 0.35rem);
    bottom: auto;
    inset-inline: 0;
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
    background: #fff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    scrollbar-width: none;
  }

  .exchange-account-dropdown::-webkit-scrollbar {
    display: none;
  }

  .exchange-account-dropdown > li {
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .exchange-account-option {
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
  }

  .exchange-account-option:hover,
  .exchange-account-option:focus-visible,
  .exchange-account-option.is-selected {
    background: #f0f6ff;
  }

  .exchange-account-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--bs-primary, #2f6fed);
  }

  .exchange-account-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .exchange-account-option__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exchange-account-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .exchange-account-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .exchange-account-option.is-selected .exchange-account-option__arrow {
    color: var(--bs-primary, #2f6fed);
  }

  .exchange-account-balance {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.2rem;
    margin-top: 0.25rem;
    color: #718096;
    font-size: 0.66rem;
    font-weight: 650;
    line-height: 1.25;
    text-align: start;
  }

  .exchange-account-balance > i {
    flex-shrink: 0;
    color: var(--bs-primary, #2f6fed);
    font-size: 0.68rem;
  }

  .exchange-account-field,
  .exchange-account-anchor,
  .exchange-form-page,
  .exchange-form-card,
  .exchange-form-fields {
    overflow: visible !important;
  }

  :global(html[dir='rtl']) .exchange-account-option__arrow {
    transform: scaleX(-1);
  }

  @media (max-width: 480px) {
    .exchange-account-add {
      width: 2.65rem;
      min-width: 2.65rem;
      padding: 0;
    }

    .exchange-account-add span {
      display: none;
    }

    .exchange-account-control__icon {
      flex-basis: 2rem;
      width: 2rem;
    }
  }

  .track-picker-layer{position:fixed;z-index:100000;inset:0;display:grid;place-items:center;padding:1rem;background:rgba(15,23,42,.16);backdrop-filter:blur(1px)}
  .track-picker-dialog{width:min(100%,380px);max-width:380px;min-height:0!important;margin:0!important;transform:none!important}.track-picker-modal{display:flex;max-height:calc(100vh - 2rem);overflow:hidden;flex-direction:column;border:1px solid #dce4ef;border-radius:15px;background:var(--mdb-body-bg,#fff);box-shadow:0 20px 55px rgba(15,23,42,.24)}
  .track-picker-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #e5eaf2;background:#fbfcfe}.track-picker-heading{display:flex;align-items:center;gap:10px}.track-picker-heading>span{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#eaf1ff;color:#0f6efd;font-size:16px}.track-picker-heading div{display:flex;flex-direction:column}.track-picker-heading small{color:#8491a5;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.track-picker-heading h5{margin:0;color:#18243a;font-size:15px;font-weight:800}.track-picker-close{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:#7b8798}.track-picker-close:hover{background:#eef2f7;color:#df3f4c}
  .track-picker-body{min-height:0;padding:14px 16px 8px;overflow:hidden}.track-picker-body>.mb-3{display:flex;min-height:0;height:100%;margin-bottom:0!important;flex-direction:column}.track-search-group{flex:0 0 auto;overflow:hidden;border:1px solid #dbe4ef!important;border-radius:10px!important;background:#fff!important;box-shadow:0 2px 8px rgba(31,55,90,.04)}.track-search-icon{display:grid;place-items:center;padding-inline-start:11px;color:#8b9ab0}.track-search-group input{height:40px!important;border:0!important;background:transparent!important;box-shadow:none!important;font-size:12px}.track-search-group .exchange-input-addon-btn{width:38px;border:0!important;border-inline-start:1px solid #edf1f6!important;background:transparent!important;color:#0f6efd!important}
  .track-account-list{min-height:0;max-height:min(260px,calc(100vh - 230px));margin-top:10px;padding-inline-end:3px;overflow:auto;scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent}.track-account-group{margin-bottom:4px}.track-account-row{display:flex;align-items:center;gap:8px;min-height:42px;padding:5px 7px!important;border:1px solid #e3e8f0!important;border-radius:9px!important;background:#fff!important;color:#273449!important;text-align:start;transition:border-color .15s ease,background .15s ease,transform .15s ease}.track-account-row:hover{z-index:1;border-color:#b9cdf4!important;background:#f7faff!important;transform:translateY(-1px)}.track-account-avatar{display:grid;place-items:center;flex:0 0 27px;width:27px;height:27px;border-radius:8px;background:#edf3ff;color:#2f63cc;font-size:11px;font-weight:850}.track-account-name{min-width:0;flex:1;overflow:hidden;font-size:11px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.track-account-type{flex:0 0 auto;padding:3px 6px;border-radius:999px;background:#eef7fa;color:#24718a;font-size:8px;font-weight:750}.track-row-arrow{flex:0 0 auto;color:#a6b0bf;font-size:9px}.track-empty{display:flex;min-height:110px;align-items:center;justify-content:center;flex-direction:column;gap:7px;color:#8a97aa;font-size:11px}.track-empty i{font-size:22px}
  .track-picker-footer{padding:9px 16px 13px;border-top:0;background:#fff}.track-cancel-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid #dce3ec;border-radius:8px;background:#fff;color:#526177;font-size:11px;font-weight:750}.track-cancel-btn:hover{background:#f5f7fa}
  .track-picker-header{padding:9px 12px}.track-picker-heading>span{width:32px;height:32px}.track-picker-body{padding:9px 12px 5px}.track-search-group input{height:34px!important}.track-account-list{max-height:min(190px,calc(100vh - 210px));margin-top:7px}.track-account-row{min-height:37px;padding:4px 6px!important}.track-picker-footer{padding:6px 12px 9px}.track-cancel-btn{padding:5px 9px}

  @media (max-width: 767px) {
    .exchange-mode-field,
    .exchange-submit-field {
      padding-top: 0;
    }
    .track-picker-dialog{margin:.65rem}.track-picker-body{padding:12px}.track-account-list{max-height:55vh}
  }
</style>
