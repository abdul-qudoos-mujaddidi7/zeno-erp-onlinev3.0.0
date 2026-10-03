<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, tick } from 'svelte';
  import SaleItemsTable from './SaleItemsTable.svelte';
  import SaleReceiptModal from './SaleReceiptModal.svelte';
  import SaleA4ReceiptModal from './SaleA4ReceiptModal.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import FilterSelect from '../../components/common/FilterSelect.svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';
  import TiptapEditor from '../../TiptapEditor.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { push } from 'svelte-spa-router';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate, setDatePickers, getKabulDate } from '../../calendar.js';
  let accountModalRef;

  import { calculateRemainingAndBenefit, resolveCostCurrency } from './SalesHelper.js';
  import { repriceSaleItem } from './saleCurrencyPrices.js';
  import {
    mergeById,
    lookupAccounts,
    lookupAccountByCode,
    lookupBalances,
    balanceAmount,
    availableCashAmount,
  } from '../../lib/formLookups.js';

  const CUSTOMER_TYPE_ID = 4;

  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;
  $: enable_visitor = $settings_all.find((s) => s.key === 'enable_visitor')?.value == 1;
  $: enable_batch_setting = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_a4_default_print_mode =
    $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;

  $: default_sale_description = $settings_all.find((s) => s.key === 'default_sale_description')?.value || '';
  $: enable_smart_description = $settings_all.find((s) => s.key === 'enable_smart_description')?.value == 1;

  let date = getKabulDate();
  let due_date = null;

  $: if (enable_due_date && !due_date) {
    due_date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
    if (inputName === 'due_date') due_date = value;
  }

  export let saleId = null;
  export let accountId = null;

  $: saleId = saleId == 0 ? null : saleId;

  /*
   * Product quick-create return flow.
   *
   * SaleItemsTable still calls productModal.openModal(). ProductModal detects
   * that it was opened from a Sale form and navigates to the full Product page.
   * This Sale form stores its current unsaved state in sessionStorage so it can
   * be restored after the Product is saved or the Product page is cancelled.
   */
  const SALE_FORM_DRAFT_PREFIX = 'saleFormDraft:';
  let saleDraftReady = false;

  function getCurrentSaleFormRoute() {
    if (saleId) return `/dashboard/sale-form/${saleId}`;
    if (accountId) return `/dashboard/account-sale-form/${accountId}`;
    return '/dashboard/sale-form/new';
  }

  function getSaleDraftStorageKey() {
    return `${SALE_FORM_DRAFT_PREFIX}${getCurrentSaleFormRoute()}`;
  }

  function saveSaleFormDraft() {
    if (!saleDraftReady || typeof sessionStorage === 'undefined') return;

    const draft = {
      version: 1,
      route: getCurrentSaleFormRoute(),
      savedAt: Date.now(),
      form: { ...form },
      items: Array.isArray(items) ? items : [],
      date,
      due_date,
      discount_amount,
      discount_type,
      expense_amount,
      paymentAmount,
      paymentDescription,
      paymentCurrency,
      selectedCurrencyId,
      second_entry_account,
    };

    try {
      sessionStorage.setItem(getSaleDraftStorageKey(), JSON.stringify(draft));
    } catch (error) {
      console.error('Could not save the temporary Sale form draft:', error);
    }
  }

  function restoreSaleFormDraft() {
    if (typeof sessionStorage === 'undefined') return false;

    const storageKey = getSaleDraftStorageKey();
    const rawDraft = sessionStorage.getItem(storageKey);
    if (!rawDraft) return false;

    try {
      const draft = JSON.parse(rawDraft);
      const maximumAge = 2 * 60 * 60 * 1000;

      if (
        !draft ||
        draft.route !== getCurrentSaleFormRoute() ||
        (draft.savedAt && Date.now() - Number(draft.savedAt) > maximumAge)
      ) {
        sessionStorage.removeItem(storageKey);
        return false;
      }

      if (draft.selectedCurrencyId !== undefined && draft.selectedCurrencyId !== null) {
        selectedCurrencyId = draft.selectedCurrencyId;
      }

      if (draft.form && typeof draft.form === 'object') {
        form = { ...form, ...draft.form };
      }

      if (Array.isArray(draft.items)) items = draft.items;
      if (draft.date !== undefined) date = draft.date;
      if (draft.due_date !== undefined) due_date = draft.due_date;
      if (draft.discount_amount !== undefined) discount_amount = Number(draft.discount_amount || 0);
      if (draft.discount_type) discount_type = draft.discount_type;
      if (draft.expense_amount !== undefined) expense_amount = Number(draft.expense_amount || 0);
      if (draft.paymentAmount !== undefined) paymentAmount = draft.paymentAmount;
      if (draft.paymentDescription !== undefined) paymentDescription = draft.paymentDescription;
      if (draft.paymentCurrency) paymentCurrency = draft.paymentCurrency;
      if (draft.second_entry_account !== undefined && draft.second_entry_account !== null) {
        second_entry_account = draft.second_entry_account;
      }

      return true;
    } catch (error) {
      console.error('Could not restore the temporary Sale form draft:', error);
      sessionStorage.removeItem(storageKey);
      return false;
    }
  }

  function clearSaleFormDraft() {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(getSaleDraftStorageKey());
  }

  let showAccountModal = false;

  let warehouses = [];
  let customers = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];

  let selected_account_id;

  $: if (form.account_id) {
    selected_account_id = form.account_id;
  }

  let journals = [];

  let items = [];

  let form = {
    warehouse_id: '',
    account_id: '',
    /*
     * Optional visitor: the account that receives an agreed share of this
     * sale's benefit. Empty means the sale behaves exactly as before and the
     * whole benefit stays with the company.
     */
    visitor_account_id: '',
    sale_type: '',
    invoice_number: '',
    invoice_date: getKabulDate(),
    due_date: null,
    description: $settings_all.find((s) => s.key === 'default_sale_description')?.value || '',
    currency: '',
    invoice_status: 'draft',
    status: 1,
  };

  $: if (accountId) {
    form.account_id = Number(accountId);
  }

  $: form.invoice_date = date;
  $: form.due_date = due_date;

  let treasury_balance = {};
  let accountBalanceMap = {};
  const loadedBalanceIds = new Set();

  async function ensureAccountBalance(accountId) {
    const id = Number(accountId);
    if (!id || loadedBalanceIds.has(id)) return;

    loadedBalanceIds.add(id);
    const data = await lookupBalances([id]);
    accountBalanceMap = { ...accountBalanceMap, ...data };
  }

  $: treasury_balance =
    accountBalanceMap[treasury_ID] ||
    accountBalanceMap[String(treasury_ID)] ||
    {};

  /*
   * Available cash for the selected payment currency. Inlined arguments
   * (instead of a helper call) so Svelte 5 tracks accountBalanceMap and
   * recomputes this after the async balance loads — mirroring PurchaseForm.
   */
  $: treasuryAvailableCash = availableCashAmount(
    accountBalanceMap,
    treasury_ID,
    paymentCurrency || form.currency || 'AFN',
  );

  let loading = false;

  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';
  let existingPaymentIds = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let receiptSale = null;
  let receiptItems = [];
  let receiptPayments = [];
  let receiptCustomer = {};

  let modalRef;
  let accounts = [];
  let visitors = [];
  let originalVisitorAccountId = null;
  let products = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;

  $: if (form?.account_id) ensureAccountBalance(form.account_id);
  $: if (second_entry_account) ensureAccountBalance(second_entry_account);
  $: if (track_ID) ensureAccountBalance(track_ID);

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  function getAccountName(id) {
    const acc =
      accounts.find((a) => Number(a.id) === Number(id)) ||
      customers.find((a) => Number(a.id) === Number(id)) ||
      {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  /*
   * The rate is shown next to each name because it is what decides the share,
   * and it is the one thing that tells one visitor account from another.
   */
  function visitorOptionLabel(visitor) {
    const lang = t('Lang');
    const name =
      lang === 'fa'
        ? visitor.name_fa || visitor.name
        : lang === 'ps'
          ? visitor.name_ps || visitor.name
          : visitor.name;

    const rate = Number(visitor.percentage);

    return Number.isFinite(rate) && rate > 0
      ? `${name || ''} (${rate}%)`
      : name || '';
  }

  $: selectedVisitor =
    visitors.find(
      (visitor) => String(visitor.id) === String(form.visitor_account_id),
    ) || null;
  let WALKIN = null;
  let units = [];

  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  // Get full unit chain recursively
  function getUnitHierarchy(unitId) {
    const result = [];

    function traverse(id, multiplier = 1) {
      const unit = unitMap[id];
      if (!unit) return;

      result.push({
        ...unit,
        multiplier,
      });

      if (unit.subunit_id) {
        traverse(unit.subunit_id, multiplier / (unit.subunit_multiple || 1));
      }
    }

    traverse(unitId);
    return result;
  }

  let partySearchTimer;

  let defaultCurrency = 'AFN';
  onMount(async () => {
    const [
      treasuryAccount,
      notrackAccount,
      walkinAccount,
      customerRows,
      visitorRows,
      accountTypesResponse,
      warehousesResponse,
      currenciesResponse,
    ] = await Promise.all([
      lookupAccountByCode('TREASURY'),
      lookupAccountByCode('NOTRACK'),
      lookupAccountByCode('WALKIN'),
      lookupAccounts({ role: 'customer' }),
      /*
       * Visitors are their own role, not customers: they are offered here as
       * an optional share of the sale's benefit.
       */
      enable_visitor ? lookupAccounts({ role: 'visitor' }) : Promise.resolve([]),
      accountTypeApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
    ]);

    treasury_ID = treasuryAccount?.id || 0;
    notrack_ID = notrackAccount?.id || 0;
    accounts = [treasuryAccount, notrackAccount].filter(Boolean);
    allAccountTypes = accountTypesResponse?.data || [];
    warehouses = warehousesResponse?.data || [];
    customers = mergeById(customerRows, walkinAccount ? [walkinAccount] : []);
    visitors = visitorRows || [];
    WALKIN = customers.find((customer) => customer.code === 'WALKIN') || walkinAccount || null;
    if (accountId) {
      form.account_id = Number(accountId);
    } else {
      form.account_id = WALKIN ? WALKIN.id : '';
    }
    form.warehouse_id = warehouses.length > 0 ? warehouses[0].id : '';
    currencies = currenciesResponse?.data || [];
    accountTypes = allAccountTypes.filter((at) => at.id == CUSTOMER_TYPE_ID && at.status === 1);
    defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    if (currencies.length) selectedCurrencyId = currencies.find((c) => c.isDefault)?.id || currencies[0].id;

    paymentCurrency = form.currency;

    if (saleId) {
      units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
      await loadSale(saleId);
    } else {
      restoreSaleFormDraft();
      /*
       * The invoice number is stamped by the backend when a sale is
       * confirmed, so the form asks for the number the next confirmed sale
       * will receive instead of reading a cached counter that drifts behind.
       * Refreshed after a restored draft, which may hold yesterday's number.
       */
      await refreshInvoiceNumberPreview();
    }

    saleDraftReady = true;
    saveSaleFormDraft();

    if (treasury_ID) ensureAccountBalance(treasury_ID);

    if (!second_entry_account && treasury_ID) {
      second_entry_account = treasury_ID;
    }

    setDatePickers(handleDateChange, componentRoot);
    await tick();
    initDropdowns();
  });
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { saleApi } from '../../api/saleApi.js';
import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';
  let componentRoot;
  async function loadSale(id) {
    try {
      /*
       * Load any active sale for editing.
       *
       * Previously this query required invoice_status === 'draft'.
       * Clicking Edit on a confirmed sale therefore returned no record
       * and immediately redirected to /dashboard/sales, which caused the
       * edit page to blink and disappear.
       */
      const saleResponse = await saleApi.getById(Number(id));
      const sale = saleResponse?.data;

      if (!sale) {
        toast.error(
          t('Error'),
          t('Sale not found.'),
        );
        push('/dashboard/sales');
        return;
      }

      form = {
        warehouse_id: sale.warehouse_id,
        account_id: sale.account_id,
        visitor_account_id: sale.visitor_account_id || '',
        sale_type: sale.sale_type,
        invoice_number: sale.invoice_number,
        due_date: sale.due_date,
        invoice_date: sale.invoice_date.slice(0, 10),
        description: sale.description,
        currency: sale.currency,
        invoice_status: sale.invoice_status,
        status: sale.status,
      };
      originalVisitorAccountId = sale.visitor_account_id || null;

      date = sale.invoice_date.slice(0, 10);
      form.invoice_date = date;
      discount_amount = Number(sale.discount_amount || 0);
      discount_type = sale.discount_type || 'fixed';
      expense_amount = Number(sale.expense_amount || 0);

      
    selectedCurrency = currencies.find((c) => c.code === sale.currency) || currencies.find((c) => c.isDefault == 1);
    selectedCurrencyId = selectedCurrency?.id;
      paymentCurrency = sale.currency || paymentCurrency;

      if (sale.account_id) {
        const knownCustomer = customers.find(
          (customer) => Number(customer.id) === Number(sale.account_id),
        );
        if (!knownCustomer) {
          const extra = (await accountApi.getById(sale.account_id))?.data;
          if (extra) customers = mergeById(customers, [extra]);
        }
      }

      const saleItems = (sale.items || [])
        .filter((item) => Number(item.status) === 1)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const productIds = saleItems.map((i) => i.product_id);
      products = await fetchProductsByIds(productIds);
      items = saleItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        const unitHierarchy = getUnitHierarchy(product.product_unit_id);
        return {
          type: i.type || 'good',
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          stock_batch_id: i.stock_batch_id || null,
          batch: i.batch || product?.batch || null,
          manufacturing_date: i.manufacturing_date || product?.manufacturing_date || null,
          expiry_date: i.expiry_date || product?.expiry_date || null,
          quantity: Number(i.quantity || 0),
          unit_price: Number(i.unit_price || 0),
          buy_price: Number(i.buy_price || 0),
          buy_price_currency: resolveCostCurrency(i, product, form.currency),
          calculated_price: Number(i.unit_price || 0),
          currency: i.currency,
          subtotal: Number(i.quantity || 0) * Number(i.unit_price || 0),
          availableUnits: unitHierarchy,
        };
      });

      const payments = (sale.payments || []).filter(
        (payment) => Number(payment.status) === 1,
      );

      existingPaymentIds = payments.map((payment) => Number(payment.id)).filter(Boolean);

      if (payments && payments.length > 0) {
        paymentAmount = payments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        );
        paymentCurrency = payments[0].currency || form.currency;
        paymentDescription = payments
          .map((payment) =>
            extractUserPaymentDescription(payment.description),
          )
          .filter(Boolean)
          .join(' / ');
        second_entry_account = payments[0].account_id || second_entry_account;
      } else {
        existingPaymentIds = [];
      }

      setTimeout(() => {
        if (window.mdb) {
          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        }
      }, 100);
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to load sale. Please try again.'));
    }
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

  let discount_amount = 0;
  let discount_type = 'fixed';
  let expense_amount = 0;

  $: total_amount = items.reduce((s, i) => {
    if (i.currency && form.currency && i.currency !== form.currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, form.currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${form.currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  $: payableAmount =
    total_amount -
    Number((discount_type == 'fixed' ? discount_amount : (total_amount * discount_amount) / 100) || 0) +
    Number(expense_amount || 0);

  let showPaymentCurrencyMenu = false;

  let quickPaymentExchangeRate = 1;
  let quickPaymentRateEditing = false;
  let quickPaymentRateSaving = false;
  let quickPaymentRateInput = null;

  /*
   * These currencies belong only to the quick exchange-rate editor.
   * They do not follow form.currency from Sale Details.
   */
  let quickPaymentFromCurrency = '';
  let quickPaymentToCurrency = '';

  function initializeQuickPaymentCurrencyPair(force = false) {
    if (!currencies.length) return;

    if (
      !force &&
      quickPaymentFromCurrency &&
      quickPaymentToCurrency
    ) {
      return;
    }

    const defaultCode =
      currencies.find((currency) => Number(currency.isDefault) === 1)?.code ||
      currencies[0]?.code ||
      'AFN';

    const foreignCode =
      currencies.find((currency) => currency.code !== defaultCode)?.code ||
      defaultCode;

    quickPaymentFromCurrency = foreignCode;
    quickPaymentToCurrency = defaultCode;

    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      quickPaymentFromCurrency,
      quickPaymentToCurrency,
      currencies,
    );
  }

  function getQuickPaymentExchangeRate(
    fromCurrencyCode = quickPaymentFromCurrency,
    toCurrencyCode = quickPaymentToCurrency,
    currencyRows = currencies,
  ) {
    if (
      !fromCurrencyCode ||
      !toCurrencyCode ||
      fromCurrencyCode === toCurrencyCode
    ) {
      return 1;
    }

    const fromCurrency = currencyRows.find(
      (currency) => currency.code === fromCurrencyCode,
    );

    const toCurrency = currencyRows.find(
      (currency) => currency.code === toCurrencyCode,
    );

    if (!fromCurrency || !toCurrency) return 1;

    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);

    if (
      !Number.isFinite(fromRate) ||
      !Number.isFinite(toRate) ||
      toRate <= 0
    ) {
      return 1;
    }

    return Number((fromRate / toRate).toFixed(6));
  }

  $: if (
    currencies.length &&
    (!quickPaymentFromCurrency || !quickPaymentToCurrency)
  ) {
    initializeQuickPaymentCurrencyPair();
  }

  $: {
    quickPaymentFromCurrency;
    quickPaymentToCurrency;
    currencies;

    if (
      !quickPaymentRateEditing &&
      quickPaymentFromCurrency &&
      quickPaymentToCurrency
    ) {
      quickPaymentExchangeRate = getQuickPaymentExchangeRate(
        quickPaymentFromCurrency,
        quickPaymentToCurrency,
        currencies,
      );
    }
  }

  function selectQuickPaymentCurrency(side, code) {
    quickPaymentRateEditing = false;

    if (side === 'from') {
      const previousFrom = quickPaymentFromCurrency;

      if (code === quickPaymentToCurrency) {
        quickPaymentToCurrency = previousFrom;
      }

      quickPaymentFromCurrency = code;
    }

    if (side === 'to') {
      const previousTo = quickPaymentToCurrency;

      if (code === quickPaymentFromCurrency) {
        quickPaymentFromCurrency = previousTo;
      }

      quickPaymentToCurrency = code;
    }

    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      quickPaymentFromCurrency,
      quickPaymentToCurrency,
      currencies,
    );
  }

  async function startQuickPaymentRateEdit() {
    const selectedPaymentCurrency =
      paymentCurrency ||
      form.currency ||
      currencies.find((currency) => Number(currency.isDefault) === 1)?.code ||
      currencies[0]?.code ||
      'AFN';

    quickPaymentFromCurrency = selectedPaymentCurrency;

    if (
      !quickPaymentToCurrency ||
      quickPaymentToCurrency === quickPaymentFromCurrency
    ) {
      quickPaymentToCurrency =
        currencies.find(
          (currency) =>
            currency.code !== quickPaymentFromCurrency &&
            Number(currency.isDefault) === 1,
        )?.code ||
        currencies.find(
          (currency) => currency.code !== quickPaymentFromCurrency,
        )?.code ||
        quickPaymentFromCurrency;
    }

    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      quickPaymentFromCurrency,
      quickPaymentToCurrency,
      currencies,
    );

    quickPaymentRateEditing = true;

    await tick();

    quickPaymentRateInput?.focus();
    quickPaymentRateInput?.select();
  }

  function cancelQuickPaymentRateEdit() {
    quickPaymentRateEditing = false;

    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      quickPaymentFromCurrency,
      quickPaymentToCurrency,
      currencies,
    );
  }

  async function saveQuickPaymentExchangeRate() {
    if (
      !quickPaymentFromCurrency ||
      !quickPaymentToCurrency ||
      quickPaymentFromCurrency === quickPaymentToCurrency
    ) {
      quickPaymentExchangeRate = 1;
      return;
    }

    const enteredRate = Number(quickPaymentExchangeRate);

    if (!Number.isFinite(enteredRate) || enteredRate <= 0) {
      quickPaymentExchangeRate = getQuickPaymentExchangeRate(
        quickPaymentFromCurrency,
        quickPaymentToCurrency,
        currencies,
      );

      toast.error(
        t('Validation Error'),
        t('Exchange rate must be greater than zero.'),
      );

      await tick();
      quickPaymentRateInput?.focus();
      quickPaymentRateInput?.select();
      return;
    }

    const fromCurrencyRow = currencies.find(
      (currency) => currency.code === quickPaymentFromCurrency,
    );

    const toCurrencyRow = currencies.find(
      (currency) => currency.code === quickPaymentToCurrency,
    );

    if (!fromCurrencyRow || !toCurrencyRow) {
      toast.error(t('Error'), t('Currency not found.'));
      return;
    }

    const toCurrencyBaseRate = Number(toCurrencyRow.exchangeRate || 1);

    const nextFromBaseRate =
      enteredRate *
      (Number.isFinite(toCurrencyBaseRate) && toCurrencyBaseRate > 0
        ? toCurrencyBaseRate
        : 1);

    quickPaymentRateSaving = true;

    try {
      await currencyApi.update(fromCurrencyRow.id, {
        name: fromCurrencyRow.name,
        code: fromCurrencyRow.code,
        symbol: fromCurrencyRow.symbol,
        isDefault: fromCurrencyRow.isDefault,
        exchangeRate: nextFromBaseRate,
        exchangeRateDate: fromCurrencyRow.exchangeRateDate,
        status: 1,
      });

      currencies = currencies.map((currency) =>
        currency.id === fromCurrencyRow.id
          ? {
              ...currency,
              exchangeRate: nextFromBaseRate,
            }
          : currency,
      );

      quickPaymentExchangeRate = enteredRate;
      quickPaymentRateEditing = false;

      const changedCurrencyAffectsPayment =
        quickPaymentFromCurrency === paymentCurrency ||
        quickPaymentToCurrency === paymentCurrency ||
        quickPaymentFromCurrency === form.currency ||
        quickPaymentToCurrency === form.currency;

      if (changedCurrencyAffectsPayment) {
        const maximumPayment = Math.max(
          0,
          Number(getMaxPaymentAmount() || 0),
        );

        if (isWalkInCustomer) {
          paymentAmount = maximumPayment;
        } else if (
          paymentAmount !== null &&
          paymentAmount !== '' &&
          Number(paymentAmount) > maximumPayment
        ) {
          paymentAmount = maximumPayment;
        }
      }
    } catch (error) {
      console.error('Could not update the quick exchange rate:', error);

      quickPaymentExchangeRate = getQuickPaymentExchangeRate(
        quickPaymentFromCurrency,
        quickPaymentToCurrency,
        currencies,
      );

      toast.error(t('Error'), t('Failed to update exchange rate.'));
    } finally {
      quickPaymentRateSaving = false;
    }
  }

  function handleQuickPaymentRateKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      saveQuickPaymentExchangeRate();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelQuickPaymentRateEdit();
    }
  }

  function selectPaymentCurrency(code) {
    const previousPaymentCurrency = paymentCurrency;
    paymentCurrency = code;
    showPaymentCurrencyMenu = false;

    if (isWalkInCustomer) {
      paymentAmount = Math.max(0, Number(getMaxPaymentAmount() || 0));
    } else if (
      previousPaymentCurrency &&
      previousPaymentCurrency !== code &&
      paymentAmount !== null &&
      paymentAmount !== '' &&
      !isNaN(Number(paymentAmount))
    ) {
      paymentAmount =
        Math.round(
          exchangeRate(
            Number(paymentAmount),
            previousPaymentCurrency,
            code,
          ) * 100,
        ) / 100;
    }
  }

  function handleWindowClick(event) {
    if (showPaymentCurrencyMenu && !event.target.closest('.payment-currency-picker')) {
      showPaymentCurrencyMenu = false;
    }
  }

  const salePaymentFieldOrder = [
    'discount',
    'expenses',
    'payment',
    'description',
  ];

  function focusSalePaymentField(field) {
    const element = componentRoot?.querySelector(
      `[data-sale-payment-field="${field}"]`,
    );

    if (!element) return;

    element.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
    element.focus();

    if (typeof element.select === 'function') {
      element.select();
    }
  }

  function handleSalePaymentEnter(event, currentField) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();

    const currentIndex = salePaymentFieldOrder.indexOf(currentField);
    const nextField = salePaymentFieldOrder[currentIndex + 1];

    if (nextField) {
      focusSalePaymentField(nextField);
    }
  }

  function getMaxPaymentAmount() {
    if (!payableAmount) return 0;
    if (!paymentCurrency || !form.currency || paymentCurrency === form.currency) {
      return payableAmount;
    }
    return exchangeRate(payableAmount, form.currency, paymentCurrency);
  }

  function formatPaymentDescriptionMoney(value, currency) {
    const amount = Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });

    return `${amount} ${t(currency || 'AFN')}`;
  }

  function getPaymentDescriptionLabels() {
    const currentLanguage = t('Lang');

    if (currentLanguage === 'fa') {
      return {
        totalSale: 'مجموع فروش',
        paid: 'پرداخت',
        note: 'توضیحات',
      };
    }

    if (currentLanguage === 'ps') {
      return {
        totalSale: 'ټول پلور',
        paid: 'تادیه',
        note: 'یادونه',
      };
    }

    return {
      totalSale: 'Total sale',
      paid: 'Paid',
      note: 'Note',
    };
  }

  function buildDefaultPaymentDescription() {
    const labels = getPaymentDescriptionLabels();

    const saleCurrency =
      form.currency ||
      defaultCurrency?.code ||
      'AFN';

    const currentPaymentCurrency =
      paymentCurrency ||
      saleCurrency;

    const saleTotal = Math.max(0, Number(payableAmount || 0));
    const paidAmount = Math.max(0, Number(paymentAmount || 0));

    const totalText = formatPaymentDescriptionMoney(saleTotal, saleCurrency);
    const paidText = formatPaymentDescriptionMoney(
      paidAmount,
      currentPaymentCurrency,
    );

    let paidSummary = `${labels.paid}: ${paidText}`;

    if (currentPaymentCurrency !== saleCurrency) {
      const equivalentAmount = exchangeRate(
        paidAmount,
        currentPaymentCurrency,
        saleCurrency,
      );

      paidSummary += ` = ${formatPaymentDescriptionMoney(
        equivalentAmount,
        saleCurrency,
      )}`;
    }

    return `${labels.totalSale}: ${totalText} | ${paidSummary}`;
  }

  function buildFinalPaymentDescription() {
    const labels = getPaymentDescriptionLabels();
    const defaultDescription = buildDefaultPaymentDescription();
    const userDescription = String(paymentDescription || '').trim();

    if (!userDescription) {
      return defaultDescription;
    }

    return `${defaultDescription} | ${labels.note}: ${userDescription}`;
  }

  function extractUserPaymentDescription(value = '') {
    const description = String(value || '').trim();

    if (!description) return '';

    const noteMarkers = [
      ' | توضیحات: ',
      ' | یادونه: ',
      ' | Note: ',
    ];

    for (const marker of noteMarkers) {
      const markerIndex = description.lastIndexOf(marker);

      if (markerIndex >= 0) {
        return description.slice(markerIndex + marker.length).trim();
      }
    }

    return description;
  }

  function initDropdowns() {
    if (!window.mdb || !componentRoot) return;
    componentRoot.querySelectorAll('.dropdown-toggle').forEach((el) => {
      const existing = window.mdb.Dropdown.getInstance(el);
      if (existing) existing.dispose();
      new window.mdb.Dropdown(el);
    });
  }

  /*
   * Walk-in customer payment behavior:
   *
   * - WALKIN:
   *   The amount always follows the full payable amount and is read-only.
   *
   * - Any other customer:
   *   The amount is cleared only when the customer changes, then the user
   *   can enter a partial payment or 0 manually.
   */
  let previousPaymentAccountKey = null;

  $: isWalkInCustomer = Boolean(
    WALKIN?.id &&
      form.account_id &&
      Number(form.account_id) === Number(WALKIN.id),
  );

  // Sale details currency and payment currency stay independent.
  // paymentCurrency is only initialized on mount/reset/load — not when form.currency changes.

  $: {
    const currentPaymentAccountKey = form.account_id
      ? String(form.account_id)
      : '';

    if (currentPaymentAccountKey !== previousPaymentAccountKey) {
      previousPaymentAccountKey = currentPaymentAccountKey;

      paymentAmount = isWalkInCustomer
        ? Math.max(0, Number(getMaxPaymentAmount() || 0))
        : null;
    }
  }

  /*
   * Keep the Walk-in amount synchronized when items, discount,
   * expenses, or the payable total changes. The amount is expressed in
   * the selected payment currency via getMaxPaymentAmount().
   */
  $: if (isWalkInCustomer) {
    paymentCurrency;
    form.currency;
    payableAmount;
    paymentAmount = Math.max(0, Number(getMaxPaymentAmount() || 0));
  }

  function getPaidAmountInSaleCurrency(amount, fromCurrency) {
    const paid = Number(amount || 0);
    if (!paid) return 0;
    const saleCurrency = form.currency;
    const paymentCode =
      fromCurrency || paymentCurrency || saleCurrency || defaultCurrency?.code || 'AFN';
    if (!saleCurrency || paymentCode === saleCurrency) {
      return paid;
    }
    return Number(exchangeRate(paid, paymentCode, saleCurrency) || 0);
  }

  function buildReceiptItemsSnapshot(sourceItems) {
    const saleCurrency = form.currency;
    const saleCurrencySymbol =
      currencies.find((currency) => currency.code === saleCurrency)?.symbol || '';

    return (sourceItems || []).map((item) => {
      const product = products.find((row) => Number(row.id) === Number(item.product_id));
      /*
       * The table edits calculated_price; unit_price can keep the product's
       * original sell price. The receipt must show the price actually
       * charged, so re-sync unit_price before rendering the receipt.
       */
      const effectiveUnitPrice =
        item.calculated_price != null && item.calculated_price !== ''
          ? Number(item.calculated_price)
          : Number(item.unit_price || 0);
      const effectiveSubtotal =
        item.subtotal != null && item.subtotal !== ''
          ? Number(item.subtotal)
          : effectiveUnitPrice * Number(item.quantity || 0);
      return {
        ...item,
        unit_price: effectiveUnitPrice,
        subtotal: effectiveSubtotal,
        product_name: item.product_name || product?.name || 'Unknown',
        unit_name:
          item.unit_name ||
          item.availableUnits?.find((unit) => Number(unit.id) === Number(item.product_unit_id))?.name ||
          units.find((unit) => Number(unit.id) === Number(item.product_unit_id))?.name ||
          '',
        currency_symbol:
          item.currency_symbol ||
          currencies.find((currency) => currency.code === (item.currency || saleCurrency))?.symbol ||
          saleCurrencySymbol,
        status: 1,
      };
    });
  }

  function openConfirmedSaleReceipt({ saved, savedId, snapshotItems, snapshotPayments, snapshotCustomer }) {
    receiptSale = {
      ...(saved || {}),
      id: savedId,
      warehouse_id: saved?.warehouse_id || form.warehouse_id,
      account_id: saved?.account_id || form.account_id,
      invoice_number: saved?.invoice_number || form.invoice_number,
      invoice_date: saved?.invoice_date || form.invoice_date,
      description: saved?.description ?? form.description,
      discount_amount: saved?.discount_amount ?? discount_amount,
      discount_type: saved?.discount_type || discount_type,
      expense_amount: saved?.expense_amount ?? expense_amount,
      currency: saved?.currency || form.currency,
      invoice_status: 'confirmed',
      total_amount: saved?.total_amount ?? payableAmount,
      remaining: saved?.remaining,
      items: snapshotItems,
      payments: snapshotPayments,
    };
    receiptItems = snapshotItems;
    receiptPayments = snapshotPayments;
    receiptCustomer = snapshotCustomer || {};

    if (enable_a4_default_print_mode) {
      showA4Receipt = true;
      showReceipt = false;
    } else {
      showReceipt = true;
      showA4Receipt = false;
    }
  }

  async function saveSale(confirm = false) {
    if (!form.warehouse_id || !form.account_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Warehouse, Customer and at least one Item are required.'));
      return;
    }

    if (confirm && (paymentAmount === null || paymentAmount === '')) {
      toast.error(t('Validation Error'), t('Payment amount cannot be empty. Enter 0 if no payment.'));
      return;
    }

    loading = true;
    let savedId = null;
    try {
      const payloadItems = [];

      for (let item of items) {
        payloadItems.push({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: Number(item.quantity || 0),
          buy_price: Number(item.buy_price || 0),
          buy_price_currency: resolveCostCurrency(
            item,
            products.find((p) => Number(p.id) === Number(item.product_id)),
            form.currency,
          ),
          unit_price: Number(item.calculated_price ?? item.unit_price ?? 0),
          currency: item.currency,
          discount_type: 'fixed',
          discount_amount: 0,
          subtotal: Number(item.subtotal || 0),
          fifo_cost: 0,
          profit: 0,
          status: 1,
        });
      }

      const isEditing = Boolean(Number(saleId));
      const nextPaymentAmount = confirm ? Number(paymentAmount || 0) : 0;
      const paidInSaleCurrency = confirm
        ? getPaidAmountInSaleCurrency(nextPaymentAmount, paymentCurrency)
        : 0;
      const remainingAmount = confirm
        ? Number(payableAmount || 0) - paidInSaleCurrency
        : payableAmount;

      const paymentPayload =
        confirm && nextPaymentAmount > 0
          ? {
              account_id: second_entry_account,
              amount: nextPaymentAmount,
              currency: paymentCurrency,
              /* the business accounting day, not a UTC instant */
              payment_date: getKabulDate(),
              description: buildFinalPaymentDescription(),
              status: 1,
            }
          : null;

      const payload = {
        warehouse_id: form.warehouse_id,
        account_id: form.account_id,
        /*
         * Sent as null when nobody is selected, which is what keeps an
         * ordinary sale free of any visitor journal.
         */
        visitor_account_id: enable_visitor
          ? form.visitor_account_id || null
          : originalVisitorAccountId,
        sale_type: form.sale_type,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        description: form.description,
        discount_amount: discount_amount || 0,
        discount_type: discount_type || 'fixed',
        expense_amount: expense_amount || 0,
        currency: form.currency,
        invoice_status: confirm ? 'confirmed' : 'draft',
        status: form.status,
        total_amount: payableAmount,
        remaining: remainingAmount,
        items_count: items.length,
        items: payloadItems,
      };

      /*
       * New confirmed sales send the payment with the sale so the
       * bill can open after a single request. Edits still replace
       * payment rows separately.
       */
      if (paymentPayload && !isEditing) {
        payload.payment = paymentPayload;
      }

      const snapshotItems = confirm ? buildReceiptItemsSnapshot(items) : [];
      const snapshotCustomer = confirm
        ? customers.find((customer) => Number(customer.id) === Number(form.account_id)) ||
          accounts.find((account) => Number(account.id) === Number(form.account_id)) ||
          { id: form.account_id }
        : {};

      let saved;
      let createdPayment = null;

      if (isEditing) {
        savedId = Number(saleId);
        const response = await saleApi.update(savedId, payload);
        saved = response?.data;
      } else {
        const response = await saleApi.create(payload);
        saved = response?.data;
        savedId = saved?.id;
        createdPayment =
          (saved?.payments || []).find((payment) => Number(payment.status) !== 0) || null;
      }

      /*
       * Payment process: a confirmed sale with a payment posts
       * the payment through the backend, which writes the
       * sale_payment row and the SALES/RECEIVABLE + customer/
       * treasury journals atomically.
       *
       * On edit, replace existing payment rows instead of adding
       * another payment on top of the old one.
       */
      if (confirm && isEditing && existingPaymentIds.length > 0) {
        await Promise.all(
          existingPaymentIds.map((paymentId) => saleApi.removePayment(paymentId)),
        );
        existingPaymentIds = [];
      }

      if (confirm && paymentPayload && !createdPayment) {
        const paymentResponse = await saleApi.addPayment(savedId, paymentPayload);
        createdPayment = paymentResponse?.data || null;
      }

      if (createdPayment?.id) {
        existingPaymentIds = [Number(createdPayment.id)];
      }

      const snapshotPayments =
        confirm && nextPaymentAmount > 0
          ? [
              {
                ...(createdPayment || {}),
                amount: nextPaymentAmount,
                currency: paymentCurrency,
                account_id: second_entry_account,
                status: 1,
              },
            ]
          : [];

      form.invoice_status = confirm ? 'confirmed' : 'draft';
      clearSaleFormDraft();
      saleDraftReady = false;

      if (confirm && savedId) {
        openConfirmedSaleReceipt({
          saved,
          savedId,
          snapshotItems,
          snapshotPayments,
          snapshotCustomer,
        });
        resetForm();
        await refreshInvoiceNumberPreview();
        toast.success(t('Success'), t('Sale Confirmed.'));
        calculateRemainingAndBenefit(savedId).catch((error) => {
          console.warn('Failed to recalculate sale totals:', error);
        });
      } else {
        resetForm();
        toast.success(t('Success'), t('Draft Saved.'));
        if (savedId) {
          calculateRemainingAndBenefit(savedId).catch((error) => {
            console.warn('Failed to recalculate sale totals:', error);
          });
        }
        push('/dashboard/sales');
      }
    } catch (err) {
      console.error(err);
      /*
       * Surface the backend reason (e.g. a FIFO/LIFO sale refused with
       * INSUFFICIENT_BATCH_STOCK because the layers cannot cover it).
       */
      toast.error(
        t('Error'),
        err?.message || t('Failed to save sale. Please try again.'),
      );
    }

    loading = false;
  }

  /*
   * Asks the backend which invoice number the next confirmed sale will get.
   * Read-only: the counter only moves when a confirmed sale is stored.
   */
  async function refreshInvoiceNumberPreview() {
    if (saleId) return;

    try {
      const response = await saleApi.getNextNumber({
        sale_type: form.sale_type,
      });

      form.invoice_number = response?.data?.invoice_number || '';
    } catch (error) {
      console.warn('Could not load the next invoice number:', error);
    }
  }

  function resetForm() {
    date = getKabulDate();
    due_date = null;
    form = {
      ...form,
      warehouse_id: '',
      account_id: '',
      visitor_account_id: '',
      sale_type: '',
      invoice_number: '',
      invoice_date: getKabulDate(),
      due_date: null,
      description: $settings_all.find((s) => s.key === 'default_sale_description')?.value || '',
    };
    originalVisitorAccountId = null;
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
    existingPaymentIds = [];
  }

  let calculatedBalance = null;
  $: calculatedBalance =
    form.account_id && form.currency
      ? {
          amount: balanceAmount(accountBalanceMap, form.account_id, form.currency),
          currency: form.currency,
        }
      : null;

  function getPaymentCurrencyCode() {
    return paymentCurrency || form.currency || defaultCurrency?.code || 'AFN';
  }

  function getCurrencyLabel(code) {
    return code === 'AFN' ? '؋' : t(code || 'AFN');
  }

  function getPaymentAccountBalance(
    accountId,
    currentPaymentCurrency = paymentCurrency,
    currentFormCurrency = form.currency,
    balanceMap = accountBalanceMap,
  ) {
    const currency =
      currentPaymentCurrency ||
      currentFormCurrency ||
      defaultCurrency?.code ||
      'AFN';

    if (!accountId) {
      return {
        amount: 0,
        currency,
      };
    }

    return {
      amount: balanceAmount(balanceMap, accountId, currency),
      currency,
    };
  }

  let selectedPaymentAccountBalance = {
    amount: 0,
    currency: 'AFN',
  };

  // Explicit dependencies make the displayed value update when the async
  // balance calculation, payment currency, or selected account changes.
  $: selectedPaymentAccountBalance = getPaymentAccountBalance(
    second_entry_account,
    paymentCurrency,
    form.currency,
    accountBalanceMap,
  );

  function formatBalanceAmount(amount) {
    return Number(amount || 0).toLocaleString(undefined, {
      maximumFractionDigits: 3,
    });
  }
  let form_account_search = '';
  let form_account_search_input = null;
  let filteredAccounts = [];
  let showAccountDropdown = false;
  let accountDropdownStyle = '';

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionAccountDropdown() {
    if (!form_account_search_input) return;
    const rect =
      form_account_search_input.closest('.sale-customer-input')?.getBoundingClientRect() ||
      form_account_search_input.getBoundingClientRect();
    const maxHeight = Math.min(220, window.innerHeight * .4);
    const openUp = window.innerHeight - rect.bottom < maxHeight + 10;
    accountDropdownStyle = openUp
      ? `position:fixed;left:${rect.left}px;width:${rect.width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`
      : `position:fixed;left:${rect.left}px;width:${rect.width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;overflow:auto;z-index:100000;`;
  }

  $: if (showAccountDropdown) tick().then(positionAccountDropdown);

  function accountDisplayName(acc) {
    if (t('Lang') === 'en') return acc?.name || '';
    if (t('Lang') === 'fa') return acc?.name_fa || acc?.name || '';
    if (t('Lang') === 'ps') return acc?.name_ps || acc?.name || '';
    return acc?.name || '';
  }

  function handleCustomerSearchInput() {
    showAccountDropdown = true;
    const term = form_account_search.trim();
    clearTimeout(partySearchTimer);

    if (!term) {
      filteredAccounts = customers;
      return;
    }

    filteredAccounts = customers.filter((acc) =>
      accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
    );

    partySearchTimer = setTimeout(async () => {
      const rows = await lookupAccounts({
        role: 'customer',
        search: term,
      });
      customers = mergeById(customers, rows);
      if (form_account_search.trim() === term) {
        filteredAccounts = rows.length
          ? rows
          : customers.filter((acc) =>
              accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
            );
      }
    }, 280);
  }

  function handleCustomerSearchFocus() {
    showAccountDropdown = true;
    const term = form_account_search.trim();
    filteredAccounts = term
      ? customers.filter((acc) =>
          accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
        )
      : customers;
  }

  async function openTrackModal() {
    filteredSecondAccounts = accounts;
    showTrackModal = true;

    if (accounts.length <= 2) {
      const rows = await lookupAccounts({ exclude_system: 1 });
      accounts = mergeById(accounts, rows);
      filteredSecondAccounts = accounts;
    }
  }

  let editCurrency = false;

  let selectedCurrency = null;
  let selectedCurrencyId = null;

  $: selectedCurrency = currencies.find((c) => c.id == selectedCurrencyId) || currencies[0];

  $: if (selectedCurrency) {
    form.currency = selectedCurrency.code;
  }

  /*
   * When the user changes the Sale Details currency, re-express every item's
   * sale price in the newly selected currency. Payment currency stays
   * independent unless it was still matching the old sale currency.
   */
  function handleSaleCurrencyChange(event) {
    const newCurrencyId = event.detail;
    const newCurrency = currencies.find((c) => c.id == newCurrencyId);
    const newCode = newCurrency?.code;
    const oldCode = form.currency;

    if (newCode && oldCode && oldCode !== newCode) {
      if (Array.isArray(items) && items.length) {
        items = items.map((item) =>
          repriceSaleItem(
            item,
            item.currency || oldCode,
            newCode,
            exchangeRate,
          ),
        );
      }

      form.currency = newCode;

      if (paymentCurrency === oldCode) {
        if (
          paymentAmount !== null &&
          paymentAmount !== '' &&
          !isNaN(Number(paymentAmount))
        ) {
          paymentAmount =
            Math.round(
              exchangeRate(Number(paymentAmount), oldCode, newCode) * 100,
            ) / 100;
        }

        paymentCurrency = newCode;
      }
    }

    selectedCurrencyId = newCurrencyId;
  }

  /*
   * Persist the unsaved form synchronously whenever any important field changes.
   * ProductModal can therefore leave this page without losing the Sale.
   */
  $: if (saleDraftReady) {
    form;
    items;
    date;
    due_date;
    discount_amount;
    discount_type;
    expense_amount;
    paymentAmount;
    paymentDescription;
    paymentCurrency;
    selectedCurrencyId;
    second_entry_account;
    saveSaleFormDraft();
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="sale-create-page" bind:this={componentRoot} dir={t('dir')}>
 

  <section class="sale-section sale-details-section">
    <header class="sale-section-header">
      <div class="sale-section-heading">
        <span class="sale-section-icon" aria-hidden="true">
          <i class="bi bi-file-earmark-text"></i>
        </span>

        <div>
          <h2>{t('Sale Details')}  <span class="sale-required-note"><i class="bi bi-asterisk" aria-hidden="true"></i></span> </h2>
         
           
   
           
        </div>
      </div>

     
    </header>

    <div class="sale-details-grid">
      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-building" aria-hidden="true"></i>
          {t('Warehouse')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Warehouse')}
          icon="bi-building"
          value={form.warehouse_id}
          options={[
            { value: '', label: t('Select Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.warehouse_id = event.detail)} />
      </div>

      <div class="sale-field sale-field--customer">
        <span class="sale-field-label">
          <i class="bi bi-person" aria-hidden="true"></i>
          {t('Customer')}
        </span>

        <div class="sale-customer-control position-relative">
          <div class="sale-customer-input">
            <button
              type="button"
              class="sale-customer-input__icon"
              class:is-active={!!form.account_id}
              title={form.account_id ? t('Account') : t('Customer')}
              aria-label={form.account_id ? t('Account') : t('Customer')}
              disabled={!form.account_id}
              on:click={() => {
                if (form.account_id) showAccountModal = true;
              }}>
              <i class="bi bi-person" aria-hidden="true"></i>
            </button>

            {#if form.account_id}
              <button
                type="button"
                class="sale-selected-customer"
                on:click={async () => {
                  form.account_id = '';
                  form_account_search = '';
                  showAccountDropdown = true;
                  filteredAccounts = customers;
                  await tick();
                  form_account_search_input?.focus();
                }}>
                <span class="sale-selected-customer__identity">
                  <span class="sale-selected-customer__name">
                    {getAccountName(form.account_id)}
                  </span>

                  {#if calculatedBalance}
                    <span class="sale-selected-customer__divider" aria-hidden="true"></span>
                    <span
                      class="sale-selected-customer__balance"
                      class:is-negative={calculatedBalance.amount < 0}>
                      <b dir="ltr">
                        {calculatedBalance.amount.toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                      </b>
                      <small>{t(calculatedBalance.currency)}</small>
                    </span>
                  {/if}
                </span>
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
              </button>
            {:else}
              <input
                id="form_account_search"
                bind:this={form_account_search_input}
                type="text"
                bind:value={form_account_search}
                placeholder={t('Select Customer')}
                autocomplete="off"
                on:input={handleCustomerSearchInput}
                on:focus={handleCustomerSearchFocus}
                on:blur={() =>
                  setTimeout(() => (showAccountDropdown = false), 150)} />
            {/if}

            <button
              type="button"
              class="sale-add-customer"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => accountModalRef?.openModal()}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              <span>{t('Add')}</span>
            </button>
          </div>

          {#if showAccountDropdown && filteredAccounts.length > 0}
            <ul
              use:portal
              class="sale-customer-dropdown"
              style={accountDropdownStyle}>
              {#each filteredAccounts as acc (acc.id)}
                <li>
                  <button
                    type="button"
                    class="sale-customer-option"
                    on:mousedown={() => {
                      form.account_id = acc.id;
                      form_account_search =
                        t('Lang') === 'en'
                          ? acc.name
                          : t('Lang') === 'fa'
                            ? acc.name_fa
                            : t('Lang') === 'ps'
                              ? acc.name_ps
                              : acc.name;
                      showAccountDropdown = false;
                    }}>
                    <span class="sale-customer-option__avatar">
                      <i class="bi bi-person" aria-hidden="true"></i>
                    </span>

                    <span class="sale-customer-option__copy">
                      <strong>
                        {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                        {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                        {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                      </strong>

                      <small>
                        {#if allAccountTypes.find((at) => Number(at.id) === Number(acc.account_type_id))?.name}
                          {t('Lang') === 'en'
                            ? allAccountTypes.find((at) => Number(at.id) === Number(acc.account_type_id))?.name
                            : t('Lang') === 'fa'
                              ? allAccountTypes.find((at) => Number(at.id) === Number(acc.account_type_id))?.name_fa
                              : t('Lang') === 'ps'
                                ? allAccountTypes.find((at) => Number(at.id) === Number(acc.account_type_id))?.name_ps
                                : allAccountTypes.find((at) => Number(at.id) === Number(acc.account_type_id))?.name}
                        {:else}
                          N/A
                        {/if}
                      </small>
                    </span>

                    <i class="bi bi-chevron-right sale-customer-option__arrow" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-receipt" aria-hidden="true"></i>
          {t('Bill #')}
        </span>

        <div class="sale-readonly-field">
          <span dir="ltr">{form.invoice_number}</span>
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Date')}
        </span>

        <div class="sale-app-datepicker">
          <AppDatePicker bind:value={date} required />
        </div>
      </div>

      <div class="sale-field">
        <div class="sale-field-label-row">
          <span class="sale-field-label">
            <i class="bi bi-currency-exchange" aria-hidden="true"></i>
            {t('Currency')}
          </span>

          {#if !editCurrency && selectedCurrency}
            <button
              type="button"
              class="sale-currency-edit"
              title={t('Edit')}
              aria-label={t('Edit')}
              on:click={() => (editCurrency = true)}>
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
            </button>
          {/if}
        </div>

        {#if editCurrency}
          <div class="sale-exchange-editor">
            <span>1 {t(selectedCurrency?.code || 'AFN')} =</span>

            <input
              type="number"
              bind:value={selectedCurrency.exchangeRate}
              min="0"
              step="0.01"
              aria-label={t('Exchange Rate')} />

            <span>{t(defaultCurrency?.code || 'AFN')}</span>

            <button
              type="button"
              class="sale-exchange-editor__save"
              aria-label={t('Save')}
              on:click={async () => {
                editCurrency = false;
                await currencyApi.update(selectedCurrency.id, {
                  name: selectedCurrency.name,
                  code: selectedCurrency.code,
                  symbol: selectedCurrency.symbol,
                  isDefault: selectedCurrency.isDefault,
                  exchangeRate: Number(selectedCurrency.exchangeRate),
                  exchangeRateDate: selectedCurrency.exchangeRateDate,
                  status: 1,
                });
                currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
                await tick();
                initDropdowns();
              }}>
              <i class="bi bi-check-lg" aria-hidden="true"></i>
            </button>

            <button
              type="button"
              class="sale-exchange-editor__cancel"
              aria-label={t('Cancel')}
              on:click={() => (editCurrency = false)}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <FilterSelect
            variant="outline"
            label={t('Currency')}
            icon="bi-currency-exchange"
            value={selectedCurrencyId}
            options={currencies.map((cur) => ({
              value: cur.id,
              label: t(cur.code),
            }))}
            on:change={handleSaleCurrencyChange} />
        {/if}
      </div>

      {#if enable_visitor && visitors.length > 0}
        <div class="sale-field sale-field--visitor">
          <div class="sale-field-label-row">
            <span class="sale-field-label">
              <i class="bi bi-person-badge" aria-hidden="true"></i>
              {t('Visitor (optional)')}
            </span>

            {#if selectedVisitor}
              <button
                type="button"
                class="sale-visitor-clear"
                title={t('Clear')}
                aria-label={t('Clear')}
                on:click={() => (form.visitor_account_id = '')}>
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            {/if}
          </div>

          <FilterSelect
            variant="outline"
            label={t('Visitor (optional)')}
            icon="bi-person-badge"
            value={form.visitor_account_id}
            options={[
              { value: '', label: t('No visitor') },
              ...visitors.map((visitor) => ({
                value: visitor.id,
                label: visitorOptionLabel(visitor),
              })),
            ]}
            on:change={(event) => (form.visitor_account_id = event.detail)} />
        </div>
      {/if}

      <div class="sale-field sale-field--description">
        {#if enable_smart_description}
          <div class="sale-rich-editor sale-description-body--details">
            <TiptapEditor bind:value={form.description} />
          </div>
        {:else}
          <div class="sale-description-body sale-description-body--details">
            <textarea
              bind:value={form.description}
              rows="2"
              placeholder={t('Description')} />
          </div>
        {/if}
      </div>
    </div>
  </section>

  <SaleItemsTable
    bind:items
    bind:currency={selectedCurrency}
    warehouse_id={form.warehouse_id}
    bind:selected_account_id />

  <section class="sale-simple-payment" class:is-invalid={payableAmount < 0}>
    <label class="sale-simple-payment__field">
      <span>{t('Discount')}</span>
      <div>
        <button
          type="button"
          class="sale-simple-payment__toggle"
          class:is-active={discount_type === 'percent'}
          title={t('Discount')}
          aria-label={t('Discount')}
          on:click={() => {
            if (discount_type === 'percent') {
              discount_amount = Number(
                total_amount * (discount_amount / 100),
              ).toFixed(2);
              discount_type = 'fixed';
            } else {
              discount_amount =
                total_amount > 0
                  ? Number((discount_amount / total_amount) * 100).toFixed(2)
                  : 0;
              discount_type = 'percent';
            }
          }}>
          <i
            class="bi bi-{discount_type === 'fixed'
              ? 'cash-stack'
              : 'percent'}"
            aria-hidden="true"></i>
        </button>

        <input
          type="number"
          min="0"
          step="any"
          data-sale-payment-field="discount"
          bind:value={discount_amount}
          placeholder="0"
          on:input={() => {
            if (discount_amount === '') {
              discount_amount = null;
            } else if (discount_amount < 0) {
              discount_amount = 0;
            } else if (
              discount_type === 'fixed' &&
              discount_amount > total_amount
            ) {
              discount_amount = total_amount;
            } else if (
              discount_type === 'percent' &&
              discount_amount > 100
            ) {
              discount_amount = 100;
            } else {
              discount_amount = Number(discount_amount);
            }
          }}
          on:keydown={(event) =>
            handleSalePaymentEnter(event, 'discount')} />
      </div>
    </label>

    <label class="sale-simple-payment__field">
      <span>{t('Expenses')}</span>
      <div>
        <i class="bi bi-receipt-cutoff" aria-hidden="true"></i>
        <input
          type="number"
          min="0"
          step="any"
          data-sale-payment-field="expenses"
          bind:value={expense_amount}
          placeholder="0"
          on:input={() => {
            if (!expense_amount) {
              expense_amount = 0;
            } else if (expense_amount < 0) {
              expense_amount = 0;
            } else {
              expense_amount = Number(expense_amount);
            }
          }}
          on:keydown={(event) =>
            handleSalePaymentEnter(event, 'expenses')} />
      </div>
    </label>

    <div class="sale-simple-payment__total">
      <span>{payableAmount >= 0 ? t('Payable') : t('Invalid discount')}</span>
      <strong dir="ltr">
        {Number(Math.max(0, payableAmount || 0)).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}
      </strong>
      <small>{t(form.currency || 'AFN')}</small>
    </div>

    <label class="sale-simple-payment__field sale-simple-payment__field--amount">
      <span>{t('Payment')}</span>

      <div class="payment-composite-control">
        {#if quickPaymentRateEditing}
          <div
            class="sale-exchange-editor payment-quick-rate__editor"
            dir="ltr">
            <span>
              1 {t(quickPaymentFromCurrency)} =
            </span>

            <input
              bind:this={quickPaymentRateInput}
              type="number"
              min="0.000001"
              step="any"
              bind:value={quickPaymentExchangeRate}
              disabled={quickPaymentRateSaving}
              aria-label={t('Exchange Rate')}
              on:keydown={handleQuickPaymentRateKeydown} />

            <span>{t(quickPaymentToCurrency)}</span>

            <button
              type="button"
              class="sale-exchange-editor__save"
              disabled={quickPaymentRateSaving}
              aria-label={t('Save')}
              on:click={saveQuickPaymentExchangeRate}>
              {#if quickPaymentRateSaving}
                <span
                  class="spinner-border spinner-border-sm"
                  role="status"
                  aria-label={t('Loading...')}></span>
              {:else}
                <i class="bi bi-check-lg" aria-hidden="true"></i>
              {/if}
            </button>

            <button
              type="button"
              class="sale-exchange-editor__cancel"
              disabled={quickPaymentRateSaving}
              aria-label={t('Cancel')}
              on:click={cancelQuickPaymentRateEdit}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <div class="payment-amount-currency-control">
            <i class="bi bi-cash" aria-hidden="true"></i>

            <input
              id="paymentAmount"
              class:is-readonly={isWalkInCustomer}
              type="number"
              min="0"
              step="any"
              readonly={isWalkInCustomer}
              data-sale-payment-field="payment"
              bind:value={paymentAmount}
              placeholder="0"
              on:focus={() => {
                if (paymentAmount === null || paymentAmount === 0) {
                  paymentAmount = '';
                }
              }}
              on:input={() => {
                if (paymentAmount === '') {
                  paymentAmount = null;
                } else if (paymentAmount < 0) {
                  paymentAmount = 0;
                } else if (paymentAmount > getMaxPaymentAmount()) {
                  paymentAmount = getMaxPaymentAmount();
                } else {
                  paymentAmount = Number(paymentAmount);
                }
              }}
              on:keydown={(event) =>
                handleSalePaymentEnter(event, 'payment')} />

            <div class="payment-currency-picker sale-simple-payment__currency">
              {#if currencies.length > 1 &&
                quickPaymentFromCurrency &&
                quickPaymentToCurrency}
                <button
                  type="button"
                  class="payment-currency-rate-edit"
                  title={t('Exchange Rate')}
                  aria-label={t('Exchange Rate')}
                  on:click|stopPropagation={() => {
                    showPaymentCurrencyMenu = false;
                    startQuickPaymentRateEdit();
                  }}>
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
              {/if}

              <button
                type="button"
                class="payment-currency-picker__main"
                aria-expanded={showPaymentCurrencyMenu}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                on:click|stopPropagation={() =>
                  (showPaymentCurrencyMenu = !showPaymentCurrencyMenu)}>
                {paymentCurrency
                  ? t(paymentCurrency)
                  : t(form.currency || 'AFN')}
                <i class="bi bi-chevron-down" aria-hidden="true"></i>
              </button>

              {#if showPaymentCurrencyMenu}
                <ul class="payment-currency-menu" role="listbox">
                  {#each currencies as cur (cur.code)}
                    <li
                      role="option"
                      aria-selected={paymentCurrency === cur.code}>
                      <button
                        type="button"
                        class="payment-currency-menu__item"
                        class:selected={paymentCurrency === cur.code}
                        on:click|stopPropagation={() =>
                          selectPaymentCurrency(cur.code)}>
                        {t(cur.code)}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        {/if}

        <div
          class="sale-simple-payment__method"
          role="group"
          aria-label={t('Payment Way')}>
          <button
            type="button"
            class:is-active={second_entry_account == treasury_ID}
            on:click={() => (second_entry_account = treasury_ID)}>
            <span>
              {t('Treasury')}
              {#if second_entry_account == treasury_ID}
                <small
                  class="sale-simple-payment__method-balance"
                  dir="ltr">
                  {formatBalanceAmount(treasuryAvailableCash)}
                  {getCurrencyLabel(
                    paymentCurrency || form.currency || 'AFN',
                  )}
                </small>
              {/if}
            </span>
          </button>

          <button
            type="button"
            class:is-active={second_entry_account == track_ID}
            on:click={openTrackModal}>
            <span>
              {#if second_entry_account == track_ID && track_ID}
                {getAccountName(track_ID)}
              {:else}
                {t('Track')}
              {/if}

              {#if second_entry_account == track_ID && track_ID}
                <small
                  class="sale-simple-payment__method-balance"
                  dir="ltr">
                  {formatBalanceAmount(
                    selectedPaymentAccountBalance.amount,
                  )}
                  {getCurrencyLabel(
                    selectedPaymentAccountBalance.currency,
                  )}
                </small>
              {/if}
            </span>
          </button>
        </div>
      </div>
    </label>

    <label class="sale-simple-payment__field sale-simple-payment__field--note">
      <span>{t('Description')}</span>

      <div>
        <i class="bi bi-card-text" aria-hidden="true"></i>

        <input
          type="text"
          data-sale-payment-field="description"
          bind:value={paymentDescription}
          placeholder={t('Description')}
          on:keydown={(event) =>
            handleSalePaymentEnter(event, 'description')} />
      </div>
    </label>
  </section>

  {#if false}
    <section class="sale-section sale-payment-section">
      <header class="sale-section-header sale-section-header--compact">
        <div class="sale-section-heading">
          <span class="sale-section-icon sale-section-icon--green" aria-hidden="true">
            <i class="bi bi-wallet2"></i>
          </span>

       
            <h2>{t('Add Payment')}</h2>
         
        </div>

        {#if second_entry_account == treasury_ID}
          <span class="sale-payment-method-badge sale-payment-method-badge--treasury">
            <i class="bi bi-box" aria-hidden="true"></i>
            {t('Treasury')}
          </span>
        {:else if second_entry_account == track_ID}
          <span class="sale-payment-method-badge sale-payment-method-badge--track">
            <i class="bi bi-person-check" aria-hidden="true"></i>
            {t('Track')}
          </span>
        {/if}
      </header>

      <div class="sale-payment-body">
        <section class="sale-payment-panel sale-payment-method-panel">
          <header class="sale-payment-panel__header">
            <span class="sale-payment-panel__icon sale-payment-panel__icon--method">
              <i class="bi bi-credit-card" aria-hidden="true"></i>
            </span>

            <div>
              <h3>{t('Payment')}</h3>
              <p>{t('Treasury')} / {t('Track')}</p>
            </div>
          </header>

        <div class="sale-payment-methods">
          <button
            type="button"
            class="sale-payment-method"
            class:is-active={second_entry_account == track_ID}
            on:click={openTrackModal}>
            <span class="sale-payment-method__icon sale-payment-method__icon--track">
              <i class="bi bi-person-check" aria-hidden="true"></i>
            </span>

            <span class="sale-payment-method__copy">
              <strong>{t('Track')}</strong>
              <small>
                {#if second_entry_account == track_ID}
                  {t('Lang') === 'en'
                    ? accounts.find((a) => a.id === track_ID)?.name
                    : t('Lang') === 'fa'
                      ? accounts.find((a) => a.id === track_ID)?.name_fa
                      : t('Lang') === 'ps'
                        ? accounts.find((a) => a.id === track_ID)?.name_ps
                        : accounts.find((a) => a.id === track_ID)?.name}
                {:else}
                  {t('Account')}
                {/if}
              </small>
            </span>

            <span class="sale-payment-method__check">
              <i
                class="bi bi-{second_entry_account == track_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>

          <button
            type="button"
            class="sale-payment-method"
            class:is-active={second_entry_account == treasury_ID}
            on:click={() => (second_entry_account = treasury_ID)}>
            <span class="sale-payment-method__icon sale-payment-method__icon--treasury">
              <i class="bi bi-box" aria-hidden="true"></i>
            </span>

            <span class="sale-payment-method__copy">
              <strong>{t('Treasury')}</strong>
              <small>
                {#if second_entry_account == treasury_ID}
                  <span dir="ltr">
                    {Number(
                      treasury_balance[paymentCurrency] || 0,
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </span>
                  {t(paymentCurrency)}
                {:else}
                  {t('Treasury')}
                {/if}
              </small>
            </span>

            <span class="sale-payment-method__check">
              <i
                class="bi bi-{second_entry_account == treasury_ID
                  ? 'check-circle-fill'
                  : 'circle'}"
                aria-hidden="true"></i>
            </span>
          </button>
        </div>

        {#if second_entry_account == treasury_ID}
          <div class="sale-treasury-status">
            <i class="bi bi-info-circle" aria-hidden="true"></i>
            <span>
              {t('Treasury')}:
              <strong dir="ltr">
                {Number(
                  treasury_balance[paymentCurrency] || 0,
                ).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </strong>
              {t(paymentCurrency)}
            </span>
          </div>
        {/if}
        </section>
        <section class="sale-payment-panel sale-payment-details-panel">
          <header class="sale-payment-panel__header">
            <span class="sale-payment-panel__icon sale-payment-panel__icon--details">
              <i class="bi bi-receipt" aria-hidden="true"></i>
            </span>

            <div>
              <h3>{t('Payment Amount')}</h3>
              <p>{t('Discount')}, {t('Expenses')} &amp; {t('Description')}</p>
            </div>
          </header>

          <div class="sale-payment-summary-grid">
            <div class="sale-payment-adjustments">
            <label class="sale-payment-field">
              <span>{t('Discount')}</span>

              <div class="sale-payment-control sale-discount-control">
                <button
                  type="button"
                  class="sale-payment-toggle"
                  class:is-active={discount_type === 'percent'}
                  title={t('Discount')}
                  aria-label={t('Discount')}
                  on:click={() => {
                    if (discount_type === 'percent') {
                      discount_amount = Number(
                        total_amount * (discount_amount / 100),
                      ).toFixed(2);
                      discount_type = 'fixed';
                    } else {
                      discount_amount =
                        total_amount > 0
                          ? Number((discount_amount / total_amount) * 100).toFixed(2)
                          : 0;
                      discount_type = 'percent';
                    }
                  }}>
                  <i
                    class="bi bi-{discount_type === 'fixed'
                      ? 'cash-stack'
                      : 'percent'}"
                    aria-hidden="true"></i>
                </button>

                <input
                  id="discountAmount"
                  type="number"
                  min="0"
                  step="any"
                  bind:value={discount_amount}
                  placeholder="0.00"
                  on:input={() => {
                    if (discount_amount === '') {
                      discount_amount = null;
                    } else if (discount_amount < 0) {
                      discount_amount = 0;
                    } else if (
                      discount_type === 'fixed' &&
                      discount_amount > total_amount
                    ) {
                      discount_amount = total_amount;
                    } else if (
                      discount_type === 'percent' &&
                      discount_amount > 100
                    ) {
                      discount_amount = 100;
                    } else {
                      discount_amount = Number(discount_amount);
                    }
                  }} />

                <span class="sale-payment-suffix">
                  {#if discount_type === 'percent'}
                    {Number(
                      (total_amount * Number(discount_amount || 0)) / 100,
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  {/if}
                  {t(form.currency || 'AFN')}
                </span>
              </div>
            </label>

            <label class="sale-payment-field">
              <span>{t('Expenses')}</span>

              <div class="sale-payment-control">
                <i class="bi bi-receipt-cutoff sale-payment-control__icon" aria-hidden="true"></i>

                <input
                  id="expenseAmount"
                  type="number"
                  min="0"
                  step="any"
                  bind:value={expense_amount}
                  placeholder="0.00"
                  on:input={() => {
                    if (!expense_amount) {
                      expense_amount = 0;
                    } else if (expense_amount < 0) {
                      expense_amount = 0;
                    } else {
                      expense_amount = Number(expense_amount);
                    }
                  }} />

                <span class="sale-payment-suffix">
                  {t(form.currency || 'AFN')}
                </span>
              </div>
            </label>
          </div>

        </div>

        <label class="sale-payment-field">
          <span>{t('Description')}</span>

          <div class="sale-payment-description">
            <i class="bi bi-card-text" aria-hidden="true"></i>

            <input
              type="text"
              bind:value={paymentDescription}
              placeholder={t('Description')} />
          </div>
        </label>
        </section>

      

        <div class="sale-payable-card" class:is-invalid={payableAmount < 0}>
          <div class="sale-payable-card__overview">
            <span class="sale-payable-card__copy">
              <strong>{payableAmount >= 0 ? t('Payable') : t('Invalid discount')}</strong>
              <small>{t('Payment Amount')}</small>
            </span>

            {#if payableAmount >= 0}
              <span class="sale-payable-card__total">
                <span class="sale-payable-card__icon">
                  <i class="bi bi-calculator" aria-hidden="true"></i>
                </span>

                <strong dir="ltr">
                  {Number(payableAmount || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                </strong>
                <em>{t(form.currency || 'AFN')}</em>
              </span>
            {:else}
              <span class="sale-payable-card__total">
                <span class="sale-payable-card__icon">
                  <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                </span>
                <strong>{t('Invalid discount')}</strong>
              </span>
            {/if}
          </div>

          {#if payableAmount >= 0}
            <label class="sale-payable-card__amount">
              <span>{t('Amount')}</span>

              <div class="sale-payment-amount">
                <i class="bi bi-cash" aria-hidden="true"></i>

                <input
                  id="paymentAmount"
                  class:is-readonly={isWalkInCustomer}
                  type="number"
                  min="0"
                  step="any"
                  readonly={isWalkInCustomer}
                  bind:value={paymentAmount}
                  placeholder="0.00"
                  on:focus={() => {
                    if (paymentAmount === null || paymentAmount === 0) {
                      paymentAmount = '';
                    }
                  }}
                  on:input={() => {
                    if (paymentAmount === '') {
                      paymentAmount = null;
                    } else if (paymentAmount < 0) {
                      paymentAmount = 0;
                    } else if (paymentAmount > getMaxPaymentAmount()) {
                      paymentAmount = getMaxPaymentAmount();
                    } else {
                      paymentAmount = Number(paymentAmount);
                    }

                    if (second_entry_account == treasury_ID) {
                      const treasury_balance_for_currency = Math.abs(
                        Number(treasury_balance[paymentCurrency] || 0),
                      );

                      if (paymentAmount > treasury_balance_for_currency) {
                        paymentAmount = Number(
                          treasury_balance_for_currency,
                        ).toFixed(2);
                      }
                    }
                  }} />

                <div class="payment-currency-picker">
                  <button
                    id="paymentCurrencyDropdown"
                    type="button"
                    class="payment-currency-picker__btn"
                    aria-expanded={showPaymentCurrencyMenu}
                    aria-haspopup="listbox"
                    aria-label={t('Currency')}
                    on:click|stopPropagation={() =>
                      (showPaymentCurrencyMenu = !showPaymentCurrencyMenu)}>
                    {paymentCurrency
                      ? t(paymentCurrency)
                      : t(form.currency || 'AFN')}
                    <i class="bi bi-chevron-down" aria-hidden="true"></i>
                  </button>

                  {#if showPaymentCurrencyMenu}
                    <ul class="payment-currency-menu" role="listbox">
                      {#each currencies as cur (cur.code)}
                        <li
                          role="option"
                          aria-selected={paymentCurrency === cur.code}>
                          <button
                            type="button"
                            class="payment-currency-menu__item"
                            class:selected={paymentCurrency === cur.code}
                            on:click|stopPropagation={() =>
                              selectPaymentCurrency(cur.code)}>
                            {t(cur.code)}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </div>
            </label>
          {/if}
        </div>

      </div>
    </section>
  {/if}

  <footer class="sale-actions">
    <div class="sale-actions__buttons">
      <button
        type="button"
        class="sale-action-button sale-action-button--draft"
        on:click={() => saveSale(false)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
        {/if}

        <span>{t('Save Draft')}</span>
      </button>

      <button
        type="button"
        class="sale-action-button sale-action-button--confirm"
        on:click={() => saveSale(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm Sale')}</span>
      </button>
    </div>
  </footer>

  <AccountModal
    bind:this={modalRef}
    accountTypes={allAccountTypes}
    on:saved={(e) => {
      const created = e.detail.account;
      if (created) accounts = mergeById(accounts, [created]);
      second_entry_account = created?.id;
      track_ID = created?.id;
      showTrackModal = false;
    }} />
</div>

<AccountModal
  bind:this={accountModalRef}
  {accountTypes}
  on:saved={(e) => {
    const newAccount = e.detail.account;
    if (newAccount) customers = mergeById(customers, [newAccount]);
    if (newAccount && (newAccount.account_type_id == CUSTOMER_TYPE_ID || Number(newAccount.can_be_customer) === 1)) {
      form.account_id = newAccount.id;
    }
  }} />

{#if showTrackModal}
  <div class="sale-modal-backdrop" role="presentation"></div>

  <div
    class="sale-track-layer"
    id="trackModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trackModalLabel">
    <div class="sale-track-dialog">
      <div class="sale-track-modal">
        <header class="sale-track-header">
          <div class="sale-track-heading">
            <span aria-hidden="true">
              <i class="bi bi-person-check"></i>
            </span>

            <div>
              <small>{t('Account')}</small>
              <h2 id="trackModalLabel">{t('Track')}</h2>
            </div>
          </div>

          <button
            type="button"
            class="sale-track-close"
            aria-label={t('Close')}
            on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="sale-track-body">
          <div class="sale-track-search">
            <i class="bi bi-search" aria-hidden="true"></i>

            <input
              type="text"
              bind:value={second_entry_account_search}
              placeholder={t('Search accounts...')}
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

                  return (
                    name &&
                    name
                      .toLowerCase()
                      .includes(second_entry_account_search.toLowerCase())
                  );
                });
              }} />

            <button
              type="button"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => modalRef?.openModal()}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div class="sale-track-list">
            {#each filteredSecondAccounts as acc (acc.id)}
              <button
                type="button"
                class="sale-track-account"
                on:click={() => {
                  second_entry_account = acc.id;
                  track_ID = acc.id;
                  showTrackModal = false;
                }}>
                <span class="sale-track-account__icon">
                  <i class="bi bi-person" aria-hidden="true"></i>
                </span>

                <span class="sale-track-account__copy">
                  <strong>
                    {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                    {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                    {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                  </strong>

                  <small>
                    {#if allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                      {t('Lang') === 'en'
                        ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name
                        : t('Lang') === 'fa'
                          ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                          : t('Lang') === 'ps'
                            ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                            : allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                    {:else}
                      N/A
                    {/if}
                  </small>
                </span>

                <i class="bi bi-chevron-right sale-track-account__arrow" aria-hidden="true"></i>
              </button>
            {/each}

            {#if filteredSecondAccounts.length === 0}
              <div class="sale-track-empty">
                <span aria-hidden="true">
                  <i class="bi bi-person-x"></i>
                </span>
                <strong>{t('No accounts found')}</strong>
              </div>
            {/if}
          </div>
        </div>

        <footer class="sale-track-footer">
          <button type="button" on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
            <span>{t('Close')}</span>
          </button>
        </footer>
      </div>
    </div>
  </div>
{/if}

{#if form?.account_id && showAccountModal}
  <div class="sale-modal-backdrop" role="presentation"></div>

  <div
    class="sale-account-view-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="saleAccountViewTitle">
    <div class="sale-account-view-dialog">
      <div class="sale-account-view-modal">
        <header>
          <div>
            <span aria-hidden="true">
              <i class="bi bi-person-vcard"></i>
            </span>
            <h2 id="saleAccountViewTitle">{t('Account')}</h2>
          </div>

          <button
            type="button"
            aria-label={t('Close')}
            on:click={() => (showAccountModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="sale-account-view-body">
          {#await import('../accounts/AccountView.svelte') then mod}
            <svelte:component this={mod.default} id={form.account_id} />
          {/await}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showReceipt && receiptSale}
  <SaleReceiptModal
    sale={receiptSale}
    items={receiptItems}
    payments={receiptPayments}
    customer={receiptCustomer}
    {units}
    {currencies}
    on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
    on:close={() => {
      showReceipt = false;
      receiptSale = null;
      receiptItems = [];
      receiptPayments = [];
      receiptCustomer = {};
      push('/dashboard/sales');
    }} />
{/if}

{#if showA4Receipt && receiptSale}
  <SaleA4ReceiptModal
    sale={receiptSale}
    items={receiptItems}
    payments={receiptPayments}
    customer={receiptCustomer}
    {units}
    {currencies}
    on:close={() => {
      showA4Receipt = false;
      receiptSale = null;
      receiptItems = [];
      receiptPayments = [];
      receiptCustomer = {};
      push('/dashboard/sales');
    }}
    on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
{/if}


<style>
  .sale-create-page {
    --sale-primary: var(--bs-primary, #2f6fed);
    --sale-primary-dark: #1d4ed8;
    --sale-green: #059669;
    --sale-green-dark: #047857;
    --sale-text: #172033;
    --sale-muted: #718096;
    --sale-border: #dfe6ef;
    --sale-border-soft: #edf1f6;
    --sale-surface: #ffffff;
    --sale-bg-soft: #f7f9fc;
    --sale-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0 0 1.25rem;
    color: var(--sale-text);
  }

  /* Page header */

  .sale-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: var(--sale-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .sale-page-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }

  .sale-page-icon {
    display: inline-grid;
    flex: 0 0 2.75rem;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #eafaf3;
    color: var(--sale-green);
    font-size: 1.1rem;
  }

  .sale-page-heading__copy {
    min-width: 0;
  }

  .sale-page-eyebrow {
    margin-bottom: 0.05rem;
    color: var(--sale-green);
    font-size: 0.65rem;
    font-weight: 850;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .sale-page-heading h1 {
    margin: 0;
    color: var(--sale-text);
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: -0.025em;
  }

  .sale-page-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    color: #7c899c;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .sale-page-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .sale-page-meta strong {
    color: #526176;
    font-weight: 800;
  }

  .sale-page-meta__separator {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: #cbd5e1;
  }

  .sale-page-header__actions {
    display: flex;
    flex-shrink: 0;
  }

  .sale-customer-balance {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 11rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid #d9e6fb;
    border-radius: 0.7rem;
    background: #f5f9ff;
    color: #334155;
    text-align: start;
    cursor: pointer;
  }

  .sale-customer-balance:hover {
    border-color: #bed3f8;
    background: #edf4ff;
  }

  .sale-customer-balance__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--sale-primary);
  }

  .sale-customer-balance__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.04rem;
  }

  .sale-customer-balance__copy small {
    color: #718096;
    font-size: 0.58rem;
    font-weight: 700;
  }

  .sale-customer-balance__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.72rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-balance__arrow {
    color: #95a3b6;
    font-size: 0.65rem;
  }

  /* Shared sections */

  .sale-section {
    min-width: 0;
    overflow: visible;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: var(--sale-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .sale-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--sale-border-soft);
  }

  .sale-section-header--compact {
    min-height: 3.75rem;
  }

  .sale-section-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .sale-section-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.6rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-size: 0.9rem;
  }

  .sale-section-icon--neutral {
    background: #f1f5f9;
    color: #64748b;
  }

  .sale-section-icon--green {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-section-heading h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .sale-section-heading p {
    margin: 0.1rem 0 0;
    color: #8794a7;
    font-size: 0.63rem;
    font-weight: 550;
  }

  .sale-required-note {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: #b42318;
    font-size: 0.62rem;
    font-weight: 700;
  }

  .sale-required-note i {
    color: #dc2626;
    font-size: 0.48rem;
  }

  /* Details */

  .sale-details-grid {
    --sale-control-height: 2.375rem;

    display: grid;
    grid-template-columns:
      minmax(10rem, 1fr)
      minmax(13rem, 1.35fr)
      minmax(8rem, 0.72fr)
      minmax(10rem, 0.9fr)
      minmax(9rem, 0.82fr);
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.625rem;
  }

  .sale-field {
    display: grid;
    grid-template-rows: 1rem auto;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }

  .sale-field--description {
    grid-column: 1 / -1;
    grid-template-rows: auto;
  }

  .sale-field--visitor {
    grid-column: 1 / -1;
    grid-template-rows: 1rem auto;
  }

  .sale-visitor-clear {
    background: none;
    border: 0;
    padding: 0 0.15rem;
    color: #7c8798;
    line-height: 1;
  }

  .sale-visitor-clear:hover {
    color: #dc3545;
  }

  .sale-field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    height: 1rem;
    min-height: 1rem;
  }

  .sale-field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1rem;
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .sale-field-label i {
    display: none;
  }

  .sale-currency-edit {
    display: inline-grid;
    width: 1rem;
    height: 1rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: #8c9aad;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .sale-currency-edit:hover {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-details-grid :global(.filter-select) {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .sale-details-grid :global(.filter-select__label),
  .sale-details-grid :global(.filter-label),
  .sale-details-grid :global(.filter-select__notch) {
    display: none !important;
  }

  .sale-details-grid :global(.filter-select.outline) {
    padding-top: 0 !important;
  }

  .sale-details-grid :global(.filter-select__control),
  .sale-details-grid :global(.filter-select select),
  .sale-details-grid :global(.filter-select button),
  .sale-details-grid :global(.form-select) {
    width: 100%;
    min-height: var(--sale-control-height) !important;
    height: var(--sale-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .sale-details-grid :global(.filter-select__control:hover),
  .sale-details-grid :global(.filter-select select:hover),
  .sale-details-grid :global(.form-select:hover) {
    border-color: #bcc9db !important;
  }

  .sale-details-grid :global(.filter-select__control:focus-within),
  .sale-details-grid :global(.filter-select select:focus),
  .sale-details-grid :global(.form-select:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .sale-customer-input {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--sale-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-customer-input:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-customer-input__icon {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    height: 100%;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: #8c9aad;
  }

  .sale-customer-input__icon.is-active {
    color: var(--sale-primary);
    cursor: pointer;
  }

  .sale-customer-input__icon.is-active:hover {
    color: var(--sale-primary-dark);
  }

  .sale-customer-input__icon:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .sale-customer-input > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .sale-customer-input > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .sale-selected-customer {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    min-width: 0;
    padding-inline: 0.1rem 0.65rem;
    border: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 750;
    cursor: pointer;
  }

  .sale-selected-customer__identity {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    overflow: hidden;
  }

  .sale-selected-customer__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-selected-customer__divider {
    flex: 0 0 1px;
    width: 1px;
    height: 1rem;
    background: #d6dfeb;
  }

  .sale-selected-customer__balance {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.22rem;
    color: var(--sale-primary);
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-selected-customer__balance.is-negative {
    color: #dc2626;
  }

  .sale-selected-customer__balance b {
    font: inherit;
  }

  .sale-selected-customer__balance small {
    font-size: 0.58rem;
    font-weight: 750;
  }

  .sale-selected-customer i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .sale-add-customer {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.2rem;
    padding-inline: 0.65rem;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: var(--sale-primary);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .sale-add-customer:hover {
    background: var(--sale-primary-dark);
  }

  .sale-customer-dropdown {
    z-index: 1200;
    max-height: 18rem;
    margin: 0;
    padding: 0.3rem;
    overflow-y: auto;
    list-style: none;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .sale-customer-dropdown::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .sale-customer-dropdown li {
    margin: 0;
    padding: 0;
  }

  .sale-customer-option {
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

  .sale-customer-option:hover {
    background: #f0f6ff;
  }

  .sale-customer-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-customer-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .sale-customer-option__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .sale-readonly-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: var(--sale-control-height);
    padding-inline: 0.75rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.625rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .sale-readonly-field i {
    color: #9aa7b8;
    font-size: 0.65rem;
  }

  .sale-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .sale-app-datepicker :global(.app-date-field) {
    width: 100%;
    gap: 0 !important;
  }

  .sale-app-datepicker :global(.date-label) {
    display: none !important;
  }

  .sale-app-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    min-height: var(--sale-control-height) !important;
    height: var(--sale-control-height) !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .sale-app-datepicker :global(input) {
    width: 100%;
    min-width: 0;
    min-height: var(--sale-control-height) !important;
    height: var(--sale-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .sale-app-datepicker :global(input:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .sale-exchange-editor {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--sale-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-exchange-editor:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-exchange-editor > span {
    display: inline-flex;
    align-items: center;
    padding-inline: 0.45rem;
    border-inline-end: 1px solid #e2e8f0;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.58rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .sale-exchange-editor > input {
    flex: 1 1 auto;
    min-width: 2.5rem;
    padding-inline: 0.35rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.68rem;
    font-weight: 750;
    text-align: center;
  }

  .sale-exchange-editor__save,
  .sale-exchange-editor__cancel {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #e2e8f0;
    cursor: pointer;
  }

  .sale-exchange-editor__save {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-exchange-editor__cancel {
    background: #fef2f2;
    color: #dc2626;
  }

  /* Lower cards */

  .sale-simple-payment {
    display: grid;
    grid-template-columns:
      minmax(7.25rem, 0.55fr)
      minmax(7.25rem, 0.55fr)
      minmax(8rem, 0.6fr)
      minmax(24rem, 1.75fr)
      minmax(9.5rem, 0.75fr);
    align-items: end;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .sale-simple-payment.is-invalid {
    border-color: #fecaca;
    background: #fff7f7;
  }

  .sale-simple-payment__total {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-height: 2.5rem;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border-radius: 0.65rem;
    background: #f5f9ff;
    color: #26364b;
    white-space: nowrap;
  }

  .sale-simple-payment__total span {
    color: #718096;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .sale-simple-payment__total strong {
    color: var(--sale-primary);
    font-size: 0.95rem;
    font-weight: 900;
  }

  .sale-simple-payment__total small {
    color: #64748b;
    font-size: 0.62rem;
    font-weight: 750;
  }

  .sale-simple-payment__method {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    height: auto;
    flex: 0 0 auto;
    min-width: 14rem;
    padding: 0.18rem;
    border: 0;
    border-inline-start: 1px solid #dbe3ef;
    border-radius: 0;
    background: #f8fafc;
  }

  .sale-simple-payment__method button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.32rem;
    height: 100%;
    min-width: 4.5rem;
    padding-inline: 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #64748b;
    font-size: 0.64rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-simple-payment__method button.is-active {
    min-width: 9.5rem;
  }

  .sale-simple-payment__method button > span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }

  .sale-simple-payment__method-balance {
    display: inline-flex;
    align-items: center;
    padding-inline-start: 0.35rem;
    border-inline-start: 1px solid #cfe1f7;
    flex: 0 0 auto;
    max-width: none;
    overflow: hidden;
    color: #1d4ed8;
    font-size: 0.55rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-simple-payment__method button.is-active {
    background: #ecfdf5;
    color: var(--sale-green);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }

  .sale-simple-payment__method button.is-active .sale-simple-payment__method-balance {
    color: #047857;
  }

  .sale-simple-payment__field {
    display: grid;
    gap: 0.24rem;
    min-width: 0;
    margin: 0;
  }

  .sale-simple-payment__field > span {
    color: #64748b;
    font-size: 0.6rem;
    font-weight: 800;
    line-height: 1;
  }

  .sale-simple-payment__currency {
    position: relative;
  }

  .payment-currency-picker__main {
    position: relative;
    z-index: 1;
  }

  .payment-currency-rate-edit {
    position: absolute;
    top: 0.16rem;
    inset-inline-end: 0.16rem;
    z-index: 5;
    display: inline-grid !important;
    place-items: center;
    flex: 0 0 1rem !important;
    width: 1rem !important;
    min-width: 1rem !important;
    max-width: 1rem !important;
    height: 1rem !important;
    min-height: 1rem !important;
    max-height: 1rem !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0.28rem;
    background: transparent;
    color: #7187a3;
    font-size: 0.54rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .payment-currency-rate-edit:hover {
    background: transparent;
    color: #2f6fed;
    box-shadow: none;
    transform: translateY(-1px);
  }

  .payment-currency-rate-edit:focus-visible {
    outline: 2px solid rgba(47, 111, 237, 0.34);
    outline-offset: 1px;
  }

  .payment-currency-rate-edit i {
    color: inherit !important;
    font-size: inherit !important;
    line-height: 1;
  }

  .payment-composite-control {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .payment-amount-currency-control {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
  }

  .payment-quick-rate__editor {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    height: 100%;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .payment-quick-rate__editor:focus-within {
    border: 0;
    box-shadow: none;
  }

  .payment-quick-rate__editor > span:first-child {
    flex: 1 1 auto;
    min-width: 4.5rem;
  }

  .payment-quick-rate__editor > input {
    flex: 1 1 4rem;
    min-width: 3.5rem;
  }

  .payment-quick-rate__editor > span:nth-of-type(2) {
    flex: 0 1 auto;
    min-width: 3.5rem;
  }

  .payment-quick-rate__editor .spinner-border {
    width: 0.75rem;
    height: 0.75rem;
    border-width: 0.1rem;
  }

  .sale-simple-payment__field > div {
    display: flex;
    align-items: center;
    height: 2.5rem;
    min-width: 0;
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.65rem;
    background: #ffffff;
  }

  .sale-simple-payment__field > div:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-simple-payment__field i {
    flex: 0 0 1.8rem;
    width: 1.8rem;
    color: #8c9aad;
    text-align: center;
    font-size: 0.76rem;
  }

  .sale-simple-payment__field input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 0.55rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: start;
  }

  .payment-amount-currency-control > input {
    min-width: 5.5rem;
  }

  .sale-simple-payment__field input::placeholder {
    color: #a2adbd;
  }

  .sale-simple-payment__field input.is-readonly {
    color: var(--sale-green);
    cursor: default;
  }

  .payment-description-preview {
    display: -webkit-box;
    width: 100%;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #718096;
    font-size: 0.56rem;
    font-weight: 650;
    line-height: 1.35;
    text-align: start;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .sale-simple-payment__toggle {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    height: 100%;
    padding: 0;
    border: 0;
    border-inline-end: 1px solid #dbe3ef;
    background: #f8fafc;
    color: #64748b;
  }

  .sale-simple-payment__toggle.is-active {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-simple-payment__currency {
    flex: 0 0 auto;
    align-self: stretch;
  }

  .sale-simple-payment__currency > .payment-currency-picker__main {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    height: 100%;
    min-width: 4rem;
    padding-inline: 0.55rem 1.55rem;
    border: 0;
    border-inline-start: 1px solid #dbe3ef;
    background: #f8fafc;
    color: #334155;
    font-size: 0.65rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
  }

  .sale-description-body,
  .sale-payment-body {
    padding: 0.875rem 1rem 1rem;
  }

  .sale-description-body {
    display: grid;
    gap: 0.45rem;
  }

  .sale-description-body--details {
    padding: 0;
  }

  .sale-description-body input,
  .sale-description-body textarea {
    width: 100%;
    min-height: 2.375rem;
    padding: 0.75rem;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    outline: 0;
    background: #ffffff;
    color: #26364b;
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .sale-description-body input {
    height: 2.375rem;
    padding-block: 0;
  }

  .sale-description-body textarea {
    resize: vertical;
    min-height: 4.75rem;
  }

  .sale-description-body input:hover,
  .sale-description-body textarea:hover {
    border-color: #bcc9db;
  }

  .sale-description-body input:focus,
  .sale-description-body textarea:focus {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-description-body input::placeholder,
  .sale-description-body textarea::placeholder {
    color: #9aa7b8;
  }

  .sale-rich-editor {
    min-height: 7.5rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-rich-editor:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-rich-editor :global(.tiptap),
  .sale-rich-editor :global(.ProseMirror) {
    min-height: 6rem;
  }

  .sale-description-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #8a97aa;
    font-size: 0.62rem;
    font-weight: 600;
  }

  /* Payment */

  .sale-payment-method-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.8rem;
    padding-inline: 0.6rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .sale-payment-method-badge--treasury {
    border: 1px solid #bfe9d4;
    background: #effaf5;
    color: #087a54;
  }

  .sale-payment-method-badge--track {
    border: 1px solid #d5e3fb;
    background: #f3f7fe;
    color: #2f6fed;
  }

  .sale-payment-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.85rem;
    padding: 1rem;
    background: #fbfcfe;
  }

  .sale-payment-panel {
    display: grid;
    align-content: start;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.85rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.75rem;
    background: #ffffff;
  }

  .sale-payment-panel__header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.5rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid #edf1f6;
  }

  .sale-payment-panel__icon {
    display: inline-grid;
    flex: 0 0 2.15rem;
    width: 2.15rem;
    height: 2.15rem;
    place-items: center;
    border-radius: 0.55rem;
    font-size: 0.85rem;
  }

  .sale-payment-panel__icon--details {
    background: #f1f5f9;
    color: #64748b;
  }

  .sale-payment-panel__icon--method {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-payment-panel__header h3 {
    margin: 0;
    color: #26364b;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .sale-payment-panel__header p {
    margin: 0.12rem 0 0;
    color: #8794a7;
    font-size: 0.6rem;
    font-weight: 600;
  }

  .sale-payment-summary-grid {
    display: block;
    min-width: 0;
    direction: rtl;
  }

  .sale-payment-adjustments {
    display: grid;
    align-content: start;
    gap: 0.65rem;
    min-width: 0;
    direction: rtl;
  }

  .sale-payment-field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .sale-payment-field > span {
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .sale-payment-control,
  .sale-payment-amount,
  .sale-payment-description {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--sale-control-height);
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-payment-control:focus-within,
  .sale-payment-amount:focus-within,
  .sale-payment-description:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-payment-control__icon,
  .sale-payment-amount > i,
  .sale-payment-description > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
    pointer-events: none;
  }

  .sale-payment-control > input,
  .sale-payment-amount > input,
  .sale-payment-description > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .sale-payment-control > input::placeholder,
  .sale-payment-amount > input::placeholder,
  .sale-payment-description > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .sale-payment-toggle {
    display: inline-grid;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-end: 1px solid #dfe6ef;
    background: #f7f9fc;
    color: #64748b;
    cursor: pointer;
  }

  .sale-payment-toggle.is-active {
    background: #fff7df;
    color: #b7791f;
  }

  .sale-payment-suffix {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    min-width: 4rem;
    padding-inline: 0.55rem;
    border-inline-start: 1px solid #dfe6ef;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .sale-payable-card {
    display: grid;
    grid-column: 1 / -1;
    gap: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid #cdddf8;
    border-radius: 0.75rem;
    background: #f4f8ff;
    direction: rtl;
  }

  .sale-payable-card__overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 2.9rem;
  }

  .sale-payable-card__amount {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    margin-top: 0.65rem;
    padding-top: 0.65rem;
    border-top: 1px solid #dbe7fa;
  }

  .sale-payable-card__amount > span {
    flex: 0 0 auto;
    min-width: 3.5rem;
    color: #526b92;
    font-size: 0.68rem;
    font-weight: 800;
  }

  .sale-payable-card__amount .sale-payment-amount {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: var(--sale-control-height);
    border-color: #cbdaf2;
    background: #ffffff;
  }

  .sale-payable-card.is-invalid {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .sale-payable-card__icon {
    display: inline-grid;
    flex: 0 0 2.3rem;
    width: 2.3rem;
    height: 2.3rem;
    place-items: center;
    border-radius: 0.65rem;
    background: #e5efff;
    color: var(--sale-primary);
    font-size: 0.95rem;
  }

  .sale-payable-card.is-invalid .sale-payable-card__icon {
    color: #dc2626;
  }

  .sale-payable-card__copy {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .sale-payable-card__copy small {
    color: #6d7f9c;
    font-size: 0.62rem;
    font-weight: 650;
  }

  .sale-payable-card__copy strong {
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-payable-card__total {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    direction: ltr;
  }

  .sale-payable-card__total > strong {
    overflow: hidden;
    color: var(--sale-primary);
    font-size: 1.35rem;
    font-weight: 900;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payable-card__total > em {
    color: #5e7191;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 800;
    white-space: nowrap;
  }

  .sale-payable-card.is-invalid .sale-payable-card__copy small,
  .sale-payable-card.is-invalid .sale-payable-card__copy strong,
  .sale-payable-card.is-invalid .sale-payable-card__total > strong {
    color: #b42318;
  }

  .payment-currency-picker {
    position: relative;
    align-self: stretch;
    flex-shrink: 0;
    border-inline-start: 1px solid #dfe6ef;
  }

  .payment-currency-picker__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 100%;
    min-width: 4.5rem;
    padding-inline: 0.7rem;
    border: 0;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
  }

  .payment-currency-picker__btn:hover {
    background: #eef3f8;
  }

  .payment-currency-menu {
    position: absolute;
    top: calc(100% + 0.35rem);
    inset-inline-end: 0;
    z-index: 1300;
    min-width: 8rem;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    border: 1px solid #dce4ef;
    border-radius: 0.65rem;
    background: #ffffff;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
  }

  .payment-currency-menu__item {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: #526176;
    font-size: 0.7rem;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .payment-currency-menu__item:hover,
  .payment-currency-menu__item.selected {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-payment-methods {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .sale-payment-method {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    min-height: 4.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.65rem;
    background: #ffffff;
    color: #334155;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .sale-payment-method:hover {
    transform: translateY(-1px);
    border-color: #c9d7e8;
    background: #fbfcfe;
  }

  .sale-payment-method.is-active {
    border-color: #5f94f3;
    background: #f4f8ff;
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.06);
  }

  .sale-payment-method__icon {
    display: inline-grid;
    flex: 0 0 2.6rem;
    width: 2.6rem;
    height: 2.6rem;
    place-items: center;
    border-radius: 0.6rem;
    font-size: 0.88rem;
  }

  .sale-payment-method__icon--track {
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-payment-method__icon--treasury {
    background: #ecfdf5;
    color: var(--sale-green);
  }

  .sale-payment-method__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.06rem;
  }

  .sale-payment-method__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payment-method__copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-payment-method__check {
    flex-shrink: 0;
    color: #a9b4c3;
    font-size: 0.82rem;
  }

  .sale-payment-method.is-active .sale-payment-method__check {
    color: var(--sale-primary);
  }

  .sale-treasury-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding-inline: 0.65rem;
    border: 1px solid #cdebdc;
    border-radius: 0.55rem;
    background: #f3fbf7;
    color: #527565;
    font-size: 0.65rem;
    font-weight: 650;
  }

  .sale-treasury-status i {
    color: var(--sale-green);
  }

  .sale-treasury-status strong {
    color: #176a4c;
    font-weight: 850;
  }

  /* Sticky actions */

  .sale-actions {
    position: sticky;
    bottom: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    min-height: 4.5rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid #d9e1ec;
    border-radius: 0.875rem;
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 -8px 28px rgba(15, 23, 42, 0.07),
      0 8px 24px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .sale-actions__buttons {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .sale-action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.6rem;
    padding-inline: 1rem;
    border-radius: 0.625rem;
    font-size: 0.74rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .sale-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .sale-action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sale-action-button--draft {
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #526176;
  }

  .sale-action-button--draft:hover:not(:disabled) {
    border-color: #becbdb;
    background: #f8fafc;
    color: #26364b;
  }

  .sale-action-button--confirm {
    min-width: 9rem;
    border: 1px solid var(--sale-primary);
    background: var(--sale-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
  }

  .sale-action-button--confirm:hover:not(:disabled) {
    border-color: var(--sale-primary-dark);
    background: var(--sale-primary-dark);
    box-shadow: 0 7px 18px rgba(47, 111, 237, 0.27);
  }

  /* Modals */

  .sale-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }

  .sale-track-layer,
  .sale-account-view-layer {
    position: fixed;
    inset: 0;
    z-index: 1410;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow-y: auto;
  }

  .sale-track-dialog {
    width: min(94vw, 32rem);
  }

  .sale-track-modal,
  .sale-account-view-modal {
    overflow: hidden;
    border: 1px solid #dce4ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.22);
  }

  .sale-track-header,
  .sale-account-view-modal > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4.25rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #ffffff;
  }

  .sale-track-heading,
  .sale-account-view-modal > header > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .sale-track-heading > span,
  .sale-account-view-modal > header > div > span {
    display: inline-grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-track-heading small {
    display: block;
    color: #8794a7;
    font-size: 0.58rem;
    font-weight: 650;
  }

  .sale-track-heading h2,
  .sale-account-view-modal > header h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .sale-track-close,
  .sale-account-view-modal > header > button {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    place-items: center;
    border: 1px solid #e0e6ee;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #718096;
    cursor: pointer;
  }

  .sale-track-close:hover,
  .sale-account-view-modal > header > button:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .sale-track-body {
    padding: 0.8rem;
  }

  .sale-track-search {
    display: flex;
    align-items: center;
    height: 2.625rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .sale-track-search:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .sale-track-search > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
  }

  .sale-track-search input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.76rem;
    font-weight: 650;
  }

  .sale-track-search button {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: #edf4ff;
    color: var(--sale-primary);
    cursor: pointer;
  }

  .sale-track-list {
    display: grid;
    gap: 0.35rem;
    max-height: 22rem;
    margin-top: 0.75rem;
    overflow-y: auto;
  }

  .sale-track-account {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 3.25rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid #e4e9f0;
    border-radius: 0.6rem;
    background: #ffffff;
    color: #26364b;
    text-align: start;
    cursor: pointer;
  }

  .sale-track-account:hover {
    border-color: #cddbf0;
    background: #f5f9ff;
  }

  .sale-track-account__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-track-account__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .sale-track-account__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-track-account__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-track-account__arrow {
    flex-shrink: 0;
    color: #a2adbc;
    font-size: 0.58rem;
  }

  .sale-track-empty {
    display: grid;
    min-height: 10rem;
    place-items: center;
    align-content: center;
    gap: 0.4rem;
    color: #8794a7;
  }

  .sale-track-empty span {
    display: inline-grid;
    width: 2.8rem;
    height: 2.8rem;
    place-items: center;
    border-radius: 0.7rem;
    background: #f1f5f9;
    font-size: 1rem;
  }

  .sale-track-empty strong {
    font-size: 0.72rem;
    font-weight: 750;
  }

  .sale-track-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid var(--sale-border-soft);
    background: #fbfcfe;
  }

  .sale-track-footer button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.2rem;
    padding-inline: 0.75rem;
    border: 1px solid #d8e0ea;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }

  .sale-account-view-dialog {
    width: min(96vw, 72rem);
  }

  .sale-account-view-modal {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 2rem);
  }

  .sale-account-view-body {
    min-height: 0;
    padding: 0.75rem;
    overflow-y: auto;
  }

  /* RTL */

  :global(html[dir='rtl']) .sale-customer-option__arrow,
  :global(html[dir='rtl']) .sale-track-account__arrow {
    transform: scaleX(-1);
  }

  /* Responsive */

  @media (max-width: 1200px) {
    .sale-simple-payment {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sale-simple-payment__field--note {
      grid-column: 1 / -1;
    }

    .sale-details-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .sale-field--customer {
      grid-column: span 2;
    }

    .sale-payable-card {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 991.98px) {
    .sale-simple-payment__field--amount,
    .sale-simple-payment__field--note {
      grid-column: 1 / -1;
    }

    .sale-page-header {
      align-items: flex-start;
    }

    .sale-details-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sale-field--customer {
      grid-column: span 1;
    }

    .sale-lower-grid {
      grid-template-columns: 1fr;
    }

    .sale-description-body textarea,
    .sale-rich-editor {
      min-height: 7rem;
    }
  }

  @media (max-width: 767.98px) {
    .sale-simple-payment {
      grid-template-columns: 1fr;
      padding: 0.65rem;
    }

    .sale-simple-payment__field--amount,
    .sale-simple-payment__field--note {
      grid-column: auto;
    }

    .sale-simple-payment__method {
      width: 100%;
    }

    .sale-simple-payment__method button {
      flex: 1 1 0;
    }

    .sale-create-page {
      gap: 0.75rem;
      padding-bottom: 0.75rem;
    }

    .sale-page-header {
      flex-direction: column;
      padding: 0.8rem;
    }

    .sale-page-header__actions,
    .sale-customer-balance {
      width: 100%;
    }

    .sale-details-grid {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .sale-field--customer {
      grid-column: auto;
    }

    .sale-section-header {
      padding-inline: 0.8rem;
    }

    .sale-payment-body {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .sale-payment-summary-grid {
      padding: 0;
    }

    .sale-payment-panel {
      padding: 0.75rem;
    }

    .sale-payable-card {
      grid-column: 1;
      padding: 0.65rem 0.75rem;
    }

    .sale-payable-card__amount {
      align-items: stretch;
      flex-direction: column;
      gap: 0.35rem;
    }

    .sale-payable-card__amount .sale-payment-amount {
      flex-basis: auto;
      width: 100%;
    }

    .sale-actions {
      align-items: stretch;
      flex-direction: column;
      padding: 0.65rem;
    }

    .sale-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .sale-action-button {
      width: 100%;
      min-width: 0;
      padding-inline: 0.6rem;
    }
  }

  @media (max-width: 480px) {
    .sale-section-icon {
      display: none;
    }

    .sale-page-meta {
      flex-wrap: wrap;
    }

    .sale-payment-methods {
      grid-template-columns: 1fr;
    }

    .sale-actions__buttons {
      grid-template-columns: 1fr;
    }

    .sale-track-layer,
    .sale-account-view-layer {
      padding: 0.45rem;
    }

    .sale-account-view-modal {
      max-height: calc(100dvh - 0.9rem);
    }
  }

  /* Dark theme */

  :global(html.dark) .sale-create-page {
    --sale-text: var(--erp-text, #e5edf8);
    --sale-muted: var(--erp-muted, #94a3b8);
    --sale-border: var(--erp-border, #2b3a4f);
    --sale-border-soft: var(--erp-border, #2b3a4f);
    --sale-surface: var(--erp-surface, #111827);
    --sale-bg-soft: var(--erp-surface-soft, #172033);
    color-scheme: dark;
  }

  :global(html.dark) .sale-section {
    border-color: var(--sale-border);
    background: var(--sale-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  :global(html.dark) .sale-section-heading h2,
  :global(html.dark) .sale-selected-customer,
  :global(html.dark) .sale-payment-panel__header h3,
  :global(html.dark) .sale-payment-method__copy strong,
  :global(html.dark) .sale-payable-card__copy strong {
    color: var(--sale-text);
  }

  :global(html.dark) .sale-field-label,
  :global(html.dark) .sale-payment-panel__header p,
  :global(html.dark) .sale-payment-field > span,
  :global(html.dark) .sale-payment-method__copy small {
    color: var(--sale-muted);
  }

  :global(html.dark) .sale-section-icon,
  :global(html.dark) .sale-customer-option__avatar,
  :global(html.dark) .sale-payment-panel__icon--method,
  :global(html.dark) .sale-payment-method__icon--track,
  :global(html.dark) .sale-track-heading > span,
  :global(html.dark) .sale-account-view-modal > header > div > span,
  :global(html.dark) .sale-track-account__icon {
    background: rgba(47, 111, 237, 0.16);
  }

  :global(html.dark) .sale-section-icon--neutral,
  :global(html.dark) .sale-payment-panel__icon--details,
  :global(html.dark) .sale-track-empty span {
    background: #202b3d;
    color: #a9b7ca;
  }

  :global(html.dark) .sale-section-icon--green,
  :global(html.dark) .sale-payment-method__icon--treasury {
    background: rgba(5, 150, 105, 0.16);
  }

  :global(html.dark) .sale-details-grid :global(.filter-select__control),
  :global(html.dark) .sale-details-grid :global(.filter-select select),
  :global(html.dark) .sale-details-grid :global(.filter-select button),
  :global(html.dark) .sale-details-grid :global(.form-select),
  :global(html.dark) .sale-app-datepicker :global(input),
  :global(html.dark) .sale-app-datepicker :global(.date-picker-control) {
    border-color: var(--sale-border) !important;
    background: var(--sale-bg-soft) !important;
    color: var(--sale-text) !important;
  }

  :global(html.dark) .sale-customer-input,
  :global(html.dark) .sale-exchange-editor,
  :global(html.dark) .sale-description-body textarea,
  :global(html.dark) .sale-rich-editor,
  :global(html.dark) .sale-payment-control,
  :global(html.dark) .sale-payment-amount,
  :global(html.dark) .sale-payment-description,
  :global(html.dark) .sale-simple-payment,
  :global(html.dark) .sale-simple-payment__field > div,
  :global(html.dark) .sale-simple-payment__currency > .payment-currency-picker__main,
  :global(html.dark) .sale-simple-payment__method,
  :global(html.dark) .sale-simple-payment__total {
    border-color: var(--sale-border);
    background: var(--sale-bg-soft);
  }

  :global(html.dark) .sale-customer-input > input,
  :global(html.dark) .sale-exchange-editor > input,
  :global(html.dark) .sale-description-body textarea,
  :global(html.dark) .sale-payment-control > input,
  :global(html.dark) .sale-payment-amount > input,
  :global(html.dark) .sale-payment-description > input,
  :global(html.dark) .sale-simple-payment__field > div,
  :global(html.dark) .sale-simple-payment__currency > .payment-currency-picker__main {
    color: var(--sale-text);
  }

  :global(html.dark) .sale-customer-input > input::placeholder,
  :global(html.dark) .sale-description-body textarea::placeholder,
  :global(html.dark) .sale-payment-control > input::placeholder,
  :global(html.dark) .sale-payment-amount > input::placeholder,
  :global(html.dark) .sale-payment-description > input::placeholder {
    color: #718198;
  }

  :global(html.dark) .sale-selected-customer__divider {
    background: var(--sale-border);
  }

  :global(html.dark) .sale-rich-editor :global(.toolbar),
  :global(html.dark) .sale-rich-editor :global(.editor) {
    border-color: var(--sale-border);
    background: var(--sale-bg-soft);
    color: var(--sale-text);
  }

  :global(html.dark) .sale-rich-editor :global(.ProseMirror) {
    color: var(--sale-text);
    caret-color: var(--sale-text);
  }

  :global(html.dark) .sale-rich-editor :global(.ProseMirror th),
  :global(html.dark) .sale-rich-editor :global(.ProseMirror td) {
    border-color: var(--sale-border);
  }

  :global(html.dark) .sale-rich-editor :global(.ProseMirror th) {
    background: var(--sale-surface);
  }

  :global(html.dark) .sale-rich-editor :global(pre.border) {
    border-color: var(--sale-border) !important;
    background: var(--sale-surface);
    color: var(--sale-text);
  }

  :global(html.dark) .sale-readonly-field,
  :global(html.dark) .sale-exchange-editor > span,
  :global(html.dark) .sale-payment-toggle,
  :global(html.dark) .sale-payment-suffix,
  :global(html.dark) .payment-currency-picker__btn {
    border-color: var(--sale-border);
    background: #202b3d;
    color: #a9b7ca;
  }

  :global(html.dark) .sale-customer-dropdown {
    border-color: var(--sale-border);
    background: var(--sale-surface);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .sale-customer-option {
    color: var(--sale-text);
  }

  :global(html.dark) .sale-customer-option:hover {
    background: #1d2b40;
  }

  :global(html.dark) .sale-customer-option__copy small,
  :global(html.dark) .sale-customer-option__arrow {
    color: var(--sale-muted);
  }

  :global(html.dark) .sale-payment-body {
    background: #0f1726;
  }

  :global(html.dark) .sale-payment-panel {
    border-color: var(--sale-border);
    background: var(--sale-surface);
  }

  :global(html.dark) .sale-payment-panel__header {
    border-color: var(--sale-border);
  }

  :global(html.dark) .sale-payment-method-badge--treasury,
  :global(html.dark) .sale-treasury-status {
    border-color: #205b49;
    background: #12372d;
    color: #8bd5ba;
  }

  :global(html.dark) .sale-payment-method-badge--track {
    border-color: #2d4770;
    background: #16243a;
    color: #8bb7ff;
  }

  :global(html.dark) .sale-payment-toggle.is-active {
    background: #3a3017;
    color: #f4c967;
  }

  :global(html.dark) .sale-payable-card {
    border-color: #2d4770;
    background: #15233a;
  }

  :global(html.dark) .sale-payable-card__amount {
    border-color: #2d4770;
  }

  :global(html.dark) .sale-payable-card__amount > span,
  :global(html.dark) .sale-payable-card__copy small,
  :global(html.dark) .sale-payable-card__total > em {
    color: #9fb2d0;
  }

  :global(html.dark) .sale-payable-card__amount .sale-payment-amount {
    border-color: #36557f;
    background: var(--sale-surface);
  }

  :global(html.dark) .sale-payable-card__icon {
    background: #203b63;
  }

  :global(html.dark) .sale-payable-card.is-invalid {
    border-color: #7f3038;
    background: #321c25;
  }

  :global(html.dark) .payment-currency-picker {
    border-color: var(--sale-border);
  }

  :global(html.dark) .payment-currency-picker__btn:hover {
    background: #27354a;
  }

  :global(html.dark) .payment-currency-menu {
    border-color: var(--sale-border);
    background: var(--sale-surface);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .payment-currency-menu__item {
    color: #c8d3e2;
  }

  :global(html.dark) .payment-currency-menu__item:hover,
  :global(html.dark) .payment-currency-menu__item.selected {
    background: #1d2b40;
  }

  :global(html.dark) .sale-payment-method {
    border-color: var(--sale-border);
    background: var(--sale-bg-soft);
    color: var(--sale-text);
  }

  :global(html.dark) .sale-payment-method:hover {
    border-color: #3b4d66;
    background: #1d293b;
  }

  :global(html.dark) .sale-payment-method.is-active {
    border-color: #4d7fd8;
    background: #172944;
  }

  :global(html.dark) .sale-actions {
    border-color: var(--sale-border);
    background: rgba(17, 24, 39, 0.96);
    box-shadow:
      0 -8px 28px rgba(0, 0, 0, 0.2),
      0 8px 24px rgba(0, 0, 0, 0.22);
  }

  :global(html.dark) .sale-action-button--draft {
    border-color: var(--sale-border);
    background: var(--sale-bg-soft);
    color: #c8d3e2;
  }

  :global(html.dark) .sale-action-button--draft:hover:not(:disabled) {
    border-color: #42546d;
    background: #202b3d;
    color: var(--sale-text);
  }

  :global(html.dark) .sale-modal-backdrop {
    background: rgba(2, 6, 15, 0.72);
  }

  :global(html.dark) .sale-track-modal,
  :global(html.dark) .sale-account-view-modal {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 28px 74px rgba(0, 0, 0, 0.5);
  }

  :global(html.dark) .sale-track-header,
  :global(html.dark) .sale-account-view-modal > header,
  :global(html.dark) .sale-track-footer {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .sale-track-heading h2,
  :global(html.dark) .sale-account-view-modal > header h2,
  :global(html.dark) .sale-track-account__copy strong {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .sale-track-heading small,
  :global(html.dark) .sale-track-account__copy small,
  :global(html.dark) .sale-track-empty {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .sale-track-close,
  :global(html.dark) .sale-account-view-modal > header > button,
  :global(html.dark) .sale-track-search,
  :global(html.dark) .sale-track-account,
  :global(html.dark) .sale-track-footer button {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color: #c8d3e2;
  }

  :global(html.dark) .sale-track-close:hover,
  :global(html.dark) .sale-account-view-modal > header > button:hover,
  :global(html.dark) .sale-track-account:hover {
    border-color: #42546d;
    background: #202b3d;
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .sale-track-search input {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .sale-track-search button {
    border-color: var(--erp-border, #2b3a4f);
    background: #1d2b40;
  }

  :global(html.dark) .sale-account-view-body {
    background: var(--erp-bg, #0b1120);
  }

  :global(html.dark) .payment-description-preview,
  :global([data-mdb-theme='dark']) .payment-description-preview {
    color: #91a3ba;
  }

  :global(html.dark) .payment-currency-rate-edit,
  :global([data-mdb-theme='dark']) .payment-currency-rate-edit {
    background: transparent;
    color: #9fb3cc;
    box-shadow: none;
  }

  :global(html.dark) .payment-currency-rate-edit:hover,
  :global([data-mdb-theme='dark']) .payment-currency-rate-edit:hover {
    background: transparent;
    color: #93c5fd;
  }

</style>
