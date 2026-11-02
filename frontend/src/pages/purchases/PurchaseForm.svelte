<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, tick } from 'svelte';
  import PurchaseItemsTable from './PurchaseItemsTable.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import { push } from 'svelte-spa-router';
    import { toast } from '../../ToastUI/toast.js';
  import { showDate, getKabulDate } from '../../calendar.js';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';
  import { accountingDateOfStoredValue } from '../../utils/accountingDate.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
import { currencyApi } from '../../api/currencyApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { purchaseApi } from '../../api/purchaseApi.js';
import { productApi } from '../../api/productApi.js';
import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';
  import {
    mergeById,
    lookupAccounts,
    lookupAccountByCode,
    lookupBalances,
    balanceAmount,
    availableCashAmount,
    getAccountBalanceRow,
  } from '../../lib/formLookups.js';

  const SUPPLIER_TYPE_ID = 3;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_purchase_bill_due_date = $settings_all.find((s) => s.key === 'enable_purchase_bill_due_date')?.value == 1;
  $: enable_batch_setting = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;

  let accountModalRef;
  /*
   * The bill date is the purchase's accounting date, so it must be the
   * business calendar day rather than the UTC day. The due date is a
   * calendar day too, so it is derived the same way.
   */
  let date = getKabulDate();
  let due_date = null;
  $: if (enable_purchase_bill_due_date && !due_date) {
    due_date = getKabulDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
  }
  $: form.bill_date = date;
  $: form.due_date = due_date;
  let treasury_balance = {};
  let accountBalanceMap = {};
  const balancePromises = new Map();

  function mergeBalanceMap(existing, incoming) {
    const next = { ...existing };
    for (const [key, row] of Object.entries(incoming || {})) {
      next[key] = row;
      const numeric = Number(key);
      if (Number.isFinite(numeric) && numeric > 0) {
        next[numeric] = row;
      }
    }
    return next;
  }

  async function loadAllAccountBalances() {
    const response = await accountApi.getBalances({ status: 1 });
    accountBalanceMap = mergeBalanceMap(
      accountBalanceMap,
      response?.data || {},
    );
  }

  async function ensureAccountBalance(accountId) {
    const id = Number(accountId);
    if (!id) return {};
    if (balancePromises.has(id)) return balancePromises.get(id);

    const promise = lookupBalances([id])
      .then((data) => {
        accountBalanceMap = mergeBalanceMap(accountBalanceMap, data);
        return data;
      })
      .catch((error) => {
        balancePromises.delete(id);
        throw error;
      });

    balancePromises.set(id, promise);
    return promise;
  }

  $: treasury_balance = getAccountBalanceRow(accountBalanceMap, treasury_ID) || {};

  export let purchaseId = null;
  export let accountId = null;

  $: if (accountId) {
    form.account_id = Number(accountId);
  }

  $: purchaseId = purchaseId == 0 || purchaseId === 'new' ? null : purchaseId;

  /*
   * Product quick-create return flow.
   *
   * PurchaseItemsTable calls ProductModal.openModal(). ProductModal detects
   * that the current route is a Purchase form and opens the full Product page.
   * This form persists its unsaved values in sessionStorage and restores them
   * after the Product is saved or the Product page is cancelled.
   */
  const PURCHASE_FORM_DRAFT_PREFIX = 'purchaseFormDraft:';
  const PRODUCT_FORM_CREATED_KEY = 'productFormCreatedProduct';
  let purchaseDraftReady = false;

  function getCurrentPurchaseFormRoute() {
    if (typeof window !== 'undefined') {
      const hashRoute = String(window.location.hash || '')
        .replace(/^#/, '')
        .split('?')[0]
        .replace(/\/+$/g, '');

      if (
        hashRoute.startsWith('/dashboard/purchase-form/') ||
        hashRoute.startsWith('/dashboard/account-purchase-form/')
      ) {
        return hashRoute;
      }
    }

    if (purchaseId) return `/dashboard/purchase-form/${purchaseId}`;
    if (accountId) return `/dashboard/account-purchase-form/${accountId}`;
    return '/dashboard/purchase-form/0';
  }

  function getPurchaseDraftStorageKey() {
    return `${PURCHASE_FORM_DRAFT_PREFIX}${getCurrentPurchaseFormRoute()}`;
  }

  function savePurchaseFormDraft() {
    if (!purchaseDraftReady || typeof sessionStorage === 'undefined') return;

    const draft = {
      version: 1,
      route: getCurrentPurchaseFormRoute(),
      savedAt: Date.now(),
      form: { ...form },
      items: Array.isArray(items) ? items : [],
      date,
      due_date,
      paymentAmount,
      paymentDescription,
      paymentCurrency,
      second_entry_account,
      track_ID,
    };

    try {
      sessionStorage.setItem(getPurchaseDraftStorageKey(), JSON.stringify(draft));
    } catch (error) {
      console.error('Could not save the temporary Purchase form draft:', error);
    }
  }

  function restorePurchaseFormDraft() {
    if (typeof sessionStorage === 'undefined') return false;

    const storageKey = getPurchaseDraftStorageKey();
    const rawDraft = sessionStorage.getItem(storageKey);
    if (!rawDraft) return false;

    try {
      const draft = JSON.parse(rawDraft);
      const maximumAge = 2 * 60 * 60 * 1000;

      if (
        !draft ||
        draft.route !== getCurrentPurchaseFormRoute() ||
        (draft.savedAt && Date.now() - Number(draft.savedAt) > maximumAge)
      ) {
        sessionStorage.removeItem(storageKey);
        return false;
      }

      if (draft.form && typeof draft.form === 'object') {
        form = { ...form, ...draft.form };
      }

      if (Array.isArray(draft.items)) items = draft.items;
      if (draft.date !== undefined) date = draft.date;
      if (draft.due_date !== undefined) due_date = draft.due_date;
      if (draft.paymentAmount !== undefined) paymentAmount = draft.paymentAmount;
      if (draft.paymentDescription !== undefined) paymentDescription = draft.paymentDescription;
      if (draft.paymentCurrency) paymentCurrency = draft.paymentCurrency;

      if (draft.second_entry_account !== undefined && draft.second_entry_account !== null) {
        second_entry_account = draft.second_entry_account;
      }

      if (draft.track_ID !== undefined && draft.track_ID !== null) {
        track_ID = draft.track_ID;
      }

      return true;
    } catch (error) {
      console.error('Could not restore the temporary Purchase form draft:', error);
      sessionStorage.removeItem(storageKey);
      return false;
    }
  }

  async function consumeCreatedProductForPurchase() {
    if (typeof sessionStorage === 'undefined') return false;

    const rawValue = sessionStorage.getItem(PRODUCT_FORM_CREATED_KEY);
    if (!rawValue) return false;

    try {
      const saved = JSON.parse(rawValue);
      const maximumAge = 2 * 60 * 60 * 1000;
      const currentRoute = getCurrentPurchaseFormRoute();

      if (
        !saved?.id ||
        saved.returnRoute !== currentRoute ||
        !saved.createdAt ||
        Date.now() - Number(saved.createdAt) > maximumAge
      ) {
        if (saved?.returnRoute === currentRoute || !saved?.returnRoute) {
          sessionStorage.removeItem(PRODUCT_FORM_CREATED_KEY);
        }
        return false;
      }

      const product = (await productApi.getById(Number(saved.id)))?.data;
      if (!product || Number(product.status) !== 1) {
        sessionStorage.removeItem(PRODUCT_FORM_CREATED_KEY);
        return false;
      }

      if (!items.some((item) => Number(item.product_id) === Number(product.id))) {
        const activeUnits = (await productUnitApi.getAll({ status: 1 }))?.data || [];
        const unitMap = Object.fromEntries(activeUnits.map((unit) => [unit.id, unit]));
        const availableUnits = [];

        function addUnitToHierarchy(unitId, multiplier = 1) {
          const selectedUnit = unitMap[unitId];
          if (!selectedUnit) return;

          availableUnits.push({ ...selectedUnit, multiplier });

          if (selectedUnit.subunit_id) {
            addUnitToHierarchy(
              selectedUnit.subunit_id,
              multiplier / (selectedUnit.subunit_multiple || 1),
            );
          }
        }

        addUnitToHierarchy(product.product_unit_id);

        items = [
          ...items,
          {
            product_id: product.id,
            product_name: product.name,
            product_unit_id: product.product_unit_id,
            quantity: 1,
            heaviness: 1,
            stock: Number(product.quantity) || 0,
            batch: product.batch || null,
            manufacturing_date: product.manufacturing_date || null,
            expiry_date: product.expiry_date || null,
            total_amount: Number(product.buy_price) || 0,
            discount_type: 'percent',
            discount_amount: 0,
            preUnitQuantity: 1,
            preUnitPrice: 0,
            enablePercent:
              $settings_all.find((setting) => setting.key === 'enable_product_benefit_percentage')?.value == 1,
            benefit_percent:
              $settings_all.find((setting) => setting.key === 'default_product_benefit_percentage')?.value || 0,
            unit_price: Number(product.buy_price) || 0,
            unit_price_currency: product.buy_currency || form.currency || '',
            sell_price: Number(product.sell_price) || 0,
            sell_price_currency: product.sell_currency || form.currency || '',
            subtotal: Number(product.buy_price) || 0,
            availableUnits,
          },
        ];
      }

      sessionStorage.removeItem(PRODUCT_FORM_CREATED_KEY);
      return true;
    } catch (error) {
      console.error('Could not add the newly created Product to the Purchase:', error);
      sessionStorage.removeItem(PRODUCT_FORM_CREATED_KEY);
      return false;
    }
  }

  function clearPurchaseFormDraft() {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(getPurchaseDraftStorageKey());
  }

  let suppliers = [];
  let currencies = [];
  let accountTypes = [];

  let items = [];

  let form = {
    warehouse_id: '',
    account_id: '',
    bill_number: '',
    bill_date: getKabulDate(),
    description: '',
    due_date: null,
    currency: '',
    bill_status: 'draft',
    status: 1,
  };

  let loading = false;

  // payment inputs for new purchase
  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';
  let existingPaymentIds = [];
  let showPaymentCurrencyMenu = false;

  let quickPaymentExchangeRate = 1;
  let quickPaymentRateEditing = false;
  let quickPaymentRateSaving = false;
  let quickPaymentRateInput = null;
  let quickPaymentRateOp = 'mul';
  let quickPaymentRateInitial = 1;

  /*
   * The quick exchange-rate pair is independent from Purchase Details.
   * The source currency is synchronized only when the user clicks the
   * pencil beside the Payment currency.
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
      currencies.find((currency) => currency.isDefault == 1)?.code ||
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

  /*
   * The rate card mirrors the sale form: the typed value reads
   * «1 USD = 68 AFN» (mul) or «68 USD = 1 AFN» (div).
   */
  function quickPaymentRateSymbol(code) {
    return currencies.find((currency) => currency.code === code)?.symbol || code || '';
  }

  $: quickPaymentFromSymbol = quickPaymentRateSymbol(quickPaymentFromCurrency);
  $: quickPaymentToSymbol = quickPaymentRateSymbol(quickPaymentToCurrency);
  $: quickPaymentRateEdited =
    Number(quickPaymentExchangeRate) !== Number(quickPaymentRateInitial);
  $: quickPaymentRateTabs = currencies.filter(
    (currency) => currency.code !== quickPaymentToCurrency,
  );

  $: quickPaymentRateFormula = (() => {
    const rate = Number(quickPaymentExchangeRate);

    if (
      !quickPaymentFromCurrency ||
      !quickPaymentToCurrency ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      return '';
    }

    const shown = rate.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });

    return quickPaymentRateOp === 'div'
      ? `${shown} ${quickPaymentFromSymbol} = 1 ${quickPaymentToSymbol}`
      : `1 ${quickPaymentFromSymbol} = ${shown} ${quickPaymentToSymbol}`;
  })();

  function toggleQuickPaymentRateOp() {
    quickPaymentRateOp = quickPaymentRateOp === 'div' ? 'mul' : 'div';
  }

  function selectQuickPaymentRateCurrency(code) {
    if (!code || code === quickPaymentToCurrency) return;

    quickPaymentFromCurrency = code;
    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      code,
      quickPaymentToCurrency,
      currencies,
    );
    quickPaymentRateInitial = Number(quickPaymentExchangeRate);
    quickPaymentRateOp = 'mul';
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

  async function startQuickPaymentRateEdit() {
    const selectedPaymentCurrency =
      paymentCurrency ||
      form.currency ||
      currencies.find((currency) => currency.isDefault == 1)?.code ||
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
            currency.isDefault == 1,
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

    quickPaymentRateInitial = Number(quickPaymentExchangeRate);
    quickPaymentRateOp = 'mul';
    showPaymentCurrencyMenu = false;
    quickPaymentRateEditing = true;

    await tick();

    quickPaymentRateInput?.focus();
    quickPaymentRateInput?.select();
  }

  function cancelQuickPaymentRateEdit() {
    quickPaymentRateEditing = false;
    quickPaymentRateOp = 'mul';

    quickPaymentExchangeRate = getQuickPaymentExchangeRate(
      quickPaymentFromCurrency,
      quickPaymentToCurrency,
      currencies,
    );
    quickPaymentRateInitial = Number(quickPaymentExchangeRate);
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
    const safeToBaseRate =
      Number.isFinite(toCurrencyBaseRate) && toCurrencyBaseRate > 0
        ? toCurrencyBaseRate
        : 1;

    /* «68 USD = 1 AFN» stores the inverse of the typed value */
    const quotedRate =
      quickPaymentRateOp === 'div' ? 1 / enteredRate : enteredRate;

    /*
     * Stored rates are relative to the base currency, so a quote whose
     * left side is the base itself belongs to the other currency row.
     */
    const fromIsBase = Number(fromCurrencyRow.isDefault) === 1;
    const rateRow = fromIsBase ? toCurrencyRow : fromCurrencyRow;
    const nextBaseRate = fromIsBase
      ? Number(fromCurrencyRow.exchangeRate || 1) / quotedRate
      : quotedRate * safeToBaseRate;

    quickPaymentRateSaving = true;

    try {
      await currencyApi.update(rateRow.id, {
        name: rateRow.name,
        code: rateRow.code,
        symbol: rateRow.symbol,
        isDefault: rateRow.isDefault,
        exchangeRate: nextBaseRate,
        exchangeRateDate: rateRow.exchangeRateDate,
        status: 1,
      });

      currencies = currencies.map((currency) =>
        currency.id === rateRow.id
          ? {
              ...currency,
              exchangeRate: nextBaseRate,
            }
          : currency,
      );

      quickPaymentExchangeRate = enteredRate;
      quickPaymentRateInitial = enteredRate;
      quickPaymentRateEditing = false;

      const maximumPayment = Math.max(
        0,
        Number(getMaxPaymentAmount() || 0),
      );

      if (
        paymentAmount !== null &&
        paymentAmount !== '' &&
        Number(paymentAmount) > maximumPayment
      ) {
        paymentAmount = maximumPayment;
      }
    } catch (error) {
      console.error(
        'Could not update the Purchase payment exchange rate:',
        error,
      );

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
    paymentCurrencySearch = '';

    if (
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

    const maximumPayment = Math.max(
      0,
      Number(getMaxPaymentAmount() || 0),
    );

    if (
      paymentAmount !== null &&
      paymentAmount !== '' &&
      Number(paymentAmount) > maximumPayment
    ) {
      paymentAmount = maximumPayment;
    }
  }

  function handleWindowClick(event) {
    if (showPaymentCurrencyMenu && !event.target.closest('.payment-currency-picker')) {
      showPaymentCurrencyMenu = false;
    }

    if (showCurrencyMenu && !event.target.closest('.sf-field--currency')) {
      showCurrencyMenu = false;
    }
  }

  const purchasePaymentFieldOrder = ['payment', 'description'];

  function focusPurchasePaymentField(field) {
    const element = componentRoot?.querySelector(
      `[data-purchase-payment-field="${field}"]`,
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

  function handlePurchasePaymentEnter(event, currentField) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();

    const currentIndex = purchasePaymentFieldOrder.indexOf(currentField);
    const nextField = purchasePaymentFieldOrder[currentIndex + 1];

    if (nextField) {
      focusPurchasePaymentField(nextField);
    }
  }

  let accounts = [];
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

  let modalRef; // reference to AccountModal for opening it from journal form

  let partySearchTimer;
  onMount(async () => {
    const [
      treasuryAccount,
      notrackAccount,
      supplierRows,
      currenciesResponse,
      accountTypesResponse,
    ] = await Promise.all([
      lookupAccountByCode('TREASURY'),
      lookupAccountByCode('NOTRACK'),
      lookupAccounts({ role: 'supplier' }),
      currencyApi.getAll({ status: 1 }),
      accountTypeApi.getAll({ status: 1 }),
    ]);

    treasury_ID = treasuryAccount?.id || 0;
    notrack_ID = notrackAccount?.id || 0;
    accounts = [treasuryAccount, notrackAccount].filter(Boolean);
    suppliers = supplierRows;

    if (accountId) {
      form.account_id = Number(accountId);
    }

    currencies = currenciesResponse?.data || [];

    allAccountTypes = accountTypesResponse?.data || [];
    accountTypes = allAccountTypes.filter((at) => at.id == SUPPLIER_TYPE_ID && at.status === 1);

    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    paymentCurrency = form.currency;

    if (purchaseId) await loadPurchase(purchaseId);

    restorePurchaseFormDraft();
    /*
     * The bill number is allocated by the backend when the bill is stored, so
     * the form shows the number the next bill will receive. An existing bill
     * keeps the number it was saved with.
     */
    await refreshBillNumberPreview();
    await consumeCreatedProductForPurchase();
    purchaseDraftReady = true;
    savePurchaseFormDraft();

    if (treasury_ID) await ensureAccountBalance(treasury_ID);
    await loadAllAccountBalances();
    treasuryBalanceReady = true;

    if (!second_entry_account && treasury_ID) {
      second_entry_account = treasury_ID;
    }

    await tick();
    initDropdowns();
  });

  let componentRoot;

  async function loadPurchase(id) {
    try {
      /*
       * Load any active purchase for editing.
       *
       * Previously this query required bill_status === 'draft'.
       * Clicking Edit on a confirmed purchase therefore returned no
       * record and immediately redirected to /dashboard/purchases,
       * which made the form blink and disappear.
       */
      const response = await purchaseApi.getById(Number(id));
      const purchase = response?.data;

      if (!purchase) {
        toast.error(
          t('Error'),
          t('Purchase not found.'),
        );
        push('/dashboard/purchases');
        return;
      }

      date = (purchase.bill_date || '').slice(0, 10);
      form = {
        warehouse_id: purchase.warehouse_id,
        account_id: purchase.account_id,
        bill_number: purchase.bill_number,
        bill_date: purchase.bill_date,

        due_date: purchase.due_date,
        description: purchase.description,
        currency: purchase.currency,
        bill_status: purchase.bill_status,
        status: purchase.status,
      };

      if (purchase.account_id) {
        const knownSupplier = suppliers.find(
          (supplier) => Number(supplier.id) === Number(purchase.account_id),
        );
        if (!knownSupplier) {
          const extra = (await accountApi.getById(purchase.account_id))?.data;
          if (extra) suppliers = mergeById(suppliers, [extra]);
        }
      }

      const purchaseItems = (purchase.items || []).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      );
      const productIds = purchaseItems.map((i) => i.product_id);
      let products = [];

      if (productIds.length) {
        products = await fetchProductsByIds(productIds);
      }

      items = purchaseItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          sell_price: i.sell_price,
          unit_price_currency: i.currency,
          sell_price_currency: i.sell_currency,
          discount_type: i.discount_type,
          discount_amount: i.discount_amount,
          subtotal: i.subtotal,
        };
      });

      paymentCurrency = purchase.currency || paymentCurrency;

      const payments = (purchase.payments || []).filter(
        (payment) => Number(payment.status) === 1,
      );

      existingPaymentIds = payments.map((payment) => Number(payment.id)).filter(Boolean);

      if (payments.length > 0) {
        paymentAmount = payments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        );
        paymentCurrency = payments[0].currency || paymentCurrency;
        paymentDescription = payments
          .map((payment) => payment.description)
          .filter(Boolean)
          .join(' / ');
        second_entry_account = payments[0].account_id || second_entry_account;
      } else {
        existingPaymentIds = [];
      }
    } catch (err) {
      console.error(err);
      toast.error(
        t('Error'),
        t('Failed to load purchase. Please try again.'),
      );
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

  $: total_amount = items.reduce((s, i) => {
    if (i.unit_price_currency && form.currency && i.unit_price_currency !== form.currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.unit_price_currency, form.currency);
      console.log(
        `Converting ${i.subtotal} from ${i.unit_price_currency} to ${form.currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      // API returns DECIMAL columns as strings, so coerce before adding —
      // otherwise `0 + "23800.000000"` concatenates and the total renders as NaN.
      return s + (Number(exchangeRateValue) || 0);
    } else {
      return s + (Number(i.subtotal) || 0);
    }
  }, 0);

  function getTreasuryAvailableCash() {
    return availableCashAmount(
      accountBalanceMap,
      treasury_ID,
      paymentCurrency || form.currency || 'AFN',
    );
  }

  function selectTreasuryPayment() {
    second_entry_account = treasury_ID;
    if (getTreasuryAvailableCash() <= 0) {
      paymentAmount = 0;
    }
  }

  function getMaxPaymentAmount() {
    let maximum = 0;
    if (total_amount) {
      maximum =
        !paymentCurrency || !form.currency || paymentCurrency === form.currency
          ? total_amount
          : exchangeRate(total_amount, form.currency, paymentCurrency);
    }

    if (
      Number(second_entry_account) === Number(treasury_ID) &&
      Number(treasury_ID) > 0
    ) {
      maximum = Math.min(maximum, getTreasuryAvailableCash());
    }

    return maximum;
  }

  function initDropdowns() {
    if (!window.mdb || !componentRoot) return;
    componentRoot.querySelectorAll('.dropdown-toggle').forEach((el) => {
      const existing = window.mdb.Dropdown.getInstance(el);
      if (existing) existing.dispose();
      new window.mdb.Dropdown(el);
    });
  }

  async function savePurchase(confirm = false) {
    if (!form.warehouse_id || !form.account_id || items.length === 0) {
      toast.error(
        t('Validation Error'),
        t('Warehouse, Supplier and at least one Item are required.'),
      );
      return;
    }

    if (!purchaseId && isTreasuryPaymentLocked) {
      paymentAmount = 0;
    }

    if (confirm && (paymentAmount === null || paymentAmount === '')) {
      toast.error(
        t('Validation Error'),
        t('Payment amount cannot be empty. Enter 0 if no payment.'),
      );
      return;
    }

    loading = true;
    let savedId = null;
    try {
      const payload = {
        ...form,
        total_amount,
        items_count: items.length,
        bill_status: confirm ? 'confirmed' : 'draft',
        items: items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sell_price: item.sell_price,
          currency: item.unit_price_currency,
          sell_currency: item.sell_price_currency,
          discount_type: item.discount_type,
          discount_amount: item.discount_amount,
          subtotal: item.subtotal,
          batch: item.batch,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
        })),
      };

      let savedPurchase = null;

      if (purchaseId) {
        const updateResponse = await purchaseApi.update(
          Number(purchaseId),
          payload,
        );
        savedPurchase = updateResponse.data;
        savedId = Number(purchaseId);
      } else {
        const createResponse = await purchaseApi.create(payload);
        savedPurchase = createResponse.data;
        savedId = savedPurchase.id;
      }

      let payId = null;
      if (confirm) {
        const nextPaymentAmount = Number(paymentAmount || 0);

        /*
         * On edit, replace existing purchase payments instead of
         * stacking another payment row for the same bill.
         */
        if (existingPaymentIds.length > 0) {
          for (const paymentId of existingPaymentIds) {
            await purchaseApi.removePayment(paymentId);
          }
          existingPaymentIds = [];
        }

        if (nextPaymentAmount > 0) {
          const paymentResponse = await purchaseApi.addPayment(savedId, {
            account_id: second_entry_account,
            amount: nextPaymentAmount,
            currency: paymentCurrency,
            /* the business accounting day, not a UTC instant */
            payment_date: getKabulDate(),
            description: paymentDescription,
          });
          payId = paymentResponse?.data?.id || null;
          if (payId) {
            existingPaymentIds = [Number(payId)];
          }
        }
      }

      // Update form state to match the saved bill_status
      form.bill_status = confirm ? 'confirmed' : 'draft';
      toast.success(
        t('Success'),
        confirm
          ? t('Purchase Confirmed.')
          : t('Purchase Updated.'),
      );
      clearPurchaseFormDraft();
      purchaseDraftReady = false;
      resetForm();
      push('/dashboard/purchases');
    } catch (err) {
      console.error(err);
      toast.error(
        t('Error'),
        t('Failed to save purchase. Please try again.'),
      );
    }

    loading = false;
  }
  async function refreshBillNumberPreview() {
    if (purchaseId) return;

    try {
      const response = await purchaseApi.getNextNumber();

      form.bill_number = response?.data?.bill_number || '';
    } catch (error) {
      console.warn('Could not load the next bill number:', error);
    }
  }

  function resetForm() {
    /*
     * The bill date is the purchase's accounting date: it decides the
     * journal date and therefore the fiscal year. The UTC day would be
     * yesterday for the first hours of every local day.
     */
    date = getKabulDate();
    form = {
      ...form,
      warehouse_id: '',
      account_id: '',
      bill_number: '',
      bill_date: getKabulDate(),
      due_date: null,
      description: '',
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
    existingPaymentIds = [];
  }

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  let showAccountModal = false;
  let calculatedBalance = null;
  $: calculatedBalance =
    form.account_id && form.currency
      ? {
          amount: balanceAmount(accountBalanceMap, form.account_id, form.currency),
          currency: form.currency,
        }
      : null;

  function getPaymentCurrencyCode() {
    return paymentCurrency || form.currency || 'AFN';
  }

  /*
   * The payment picker reads this value instead of calling
   * getPaymentCurrencyCode(): Svelte compiles a call inside the markup as
   * $.untrack, so getCurrencySymbol(getPaymentCurrencyCode()) would keep the
   * symbol it rendered first and never follow the currency the operator picks.
   */
  $: paymentCurrencyCode = paymentCurrency || form.currency || 'AFN';

  function getCurrencyLabel(code) {
    return code === 'AFN' ? '؋' : t(code || 'AFN');
  }

  function getPaymentAccountBalance(accountId, currency = getPaymentCurrencyCode()) {
    if (!accountId) {
      return {
        amount: 0,
        currency,
      };
    }

    return {
      amount: balanceAmount(accountBalanceMap, accountId, currency),
      currency,
    };
  }

  let treasuryPaymentBalance = {
    amount: 0,
    currency: 'AFN',
  };

  let trackedPaymentBalance = {
    amount: 0,
    currency: 'AFN',
  };

  $: treasuryPaymentBalance = getPaymentAccountBalance(
    treasury_ID,
    paymentCurrency || form.currency || 'AFN',
  );

  $: trackedPaymentBalance = getPaymentAccountBalance(
    track_ID,
    paymentCurrency || form.currency || 'AFN',
  );

  $: treasuryAvailableCash = availableCashAmount(
    accountBalanceMap,
    treasury_ID,
    paymentCurrency || form.currency || 'AFN',
  );

  let treasuryBalanceReady = false;
  let treasuryEmptyAlertShown = false;

  $: isTreasuryPaymentLocked =
    treasuryBalanceReady &&
    Number(second_entry_account) === Number(treasury_ID) &&
    Number(treasury_ID) > 0 &&
    treasuryAvailableCash <= 0;

  $: if (Number(second_entry_account) !== Number(treasury_ID)) {
    treasuryEmptyAlertShown = false;
  }

  $: if (isTreasuryPaymentLocked) {
    if (!purchaseId && paymentAmount !== 0) paymentAmount = 0;
    if (!treasuryEmptyAlertShown) {
      treasuryEmptyAlertShown = true;
      toast.warning(
        t('Treasury'),
        t('Treasury has no available balance. Payment is set to 0. Use Track to pay from another account, or save this bill unpaid.'),
      );
    }
  }

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
    const rect = form_account_search_input.closest('.position-relative')?.getBoundingClientRect() || form_account_search_input.getBoundingClientRect();
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

  function handleSupplierSearchInput() {
    showAccountDropdown = true;
    const term = form_account_search.trim();
    clearTimeout(partySearchTimer);

    if (!term) {
      filteredAccounts = suppliers;
      return;
    }

    filteredAccounts = suppliers.filter((acc) =>
      accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
    );

    partySearchTimer = setTimeout(async () => {
      const rows = await lookupAccounts({
        role: 'supplier',
        search: term,
      });
      suppliers = mergeById(suppliers, rows);
      if (form_account_search.trim() === term) {
        filteredAccounts = rows.length
          ? rows
          : suppliers.filter((acc) =>
              accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
            );
      }
    }, 280);
  }

  function handleSupplierSearchFocus() {
    showAccountDropdown = true;
    const term = form_account_search.trim();
    filteredAccounts = term
      ? suppliers.filter((acc) =>
          accountDisplayName(acc).toLowerCase().includes(term.toLowerCase()),
        )
      : suppliers;
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

  function getAccountName(id) {
    const acc =
      accounts.find((a) => Number(a.id) === Number(id)) ||
      suppliers.find((a) => Number(a.id) === Number(id)) ||
      {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  /* Keep the unfinished Purchase form current before leaving for Product create. */
  $: if (purchaseDraftReady) {
    form;
    items;
    date;
    due_date;
    paymentAmount;
    paymentDescription;
    paymentCurrency;
    second_entry_account;
    track_ID;
    savePurchaseFormDraft();
  }

  /*
   * «ارز» field and the payment currency panel are the sale form's pickers:
   * a searchable list with symbol chips, the base currency marked and the
   * active row tinted.
   */
  let showCurrencyMenu = false;
  let currencySearch = '';
  let currencySearchInput = null;
  let paymentCurrencySearch = '';
  let paymentCurrencySearchInput = null;

  $: baseCurrency = currencies.find((c) => c.isDefault == 1) || currencies[0] || null;
  $: selectedCurrency = currencies.find((c) => c.code === form.currency) || null;

  $: filteredCurrencies = currencies.filter((c) => {
    const query = currencySearch.trim().toLowerCase();
    if (!query) return true;
    return `${c.code} ${t(c.code)} ${c.symbol || ''}`.toLowerCase().includes(query);
  });

  $: filteredPaymentCurrencies = currencies.filter((c) => {
    const query = paymentCurrencySearch.trim().toLowerCase();
    if (!query) return true;
    return `${c.code} ${t(c.code)} ${c.symbol || ''}`.toLowerCase().includes(query);
  });

  async function toggleCurrencyMenu() {
    showCurrencyMenu = !showCurrencyMenu;
    if (!showCurrencyMenu) return;

    currencySearch = '';
    await tick();
    currencySearchInput?.focus();
  }

  /*
   * «ارز» sets the bill currency only. The payment currency below has its own
   * picker and keeps whatever the operator chose there — the two must not move
   * each other.
   */
  function pickPurchaseCurrency(currency) {
    form.currency = currency.code;
    showCurrencyMenu = false;
    currencySearch = '';
  }

  async function togglePaymentCurrencyMenu() {
    showPaymentCurrencyMenu = !showPaymentCurrencyMenu;
    if (!showPaymentCurrencyMenu) return;

    paymentCurrencySearch = '';
    await tick();
    paymentCurrencySearchInput?.focus();
  }

  function currencyRateLabel(currency) {
    const base = baseCurrency;
    const rate = Number(currency?.exchangeRate);
    if (!base || !currency || currency.code === base.code || !isFinite(rate) || rate <= 0) {
      return '';
    }

    const rateText = rate.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return `1 ${currency.symbol || currency.code} = ${rateText} ${base.symbol || base.code}`;
  }

  function getCurrencySymbol(code) {
    const key = code && typeof code === 'object' ? code.code : code;
    if (!key) return '';

    return currencies.find((row) => row.code === key)?.symbol || getCurrencyLabel(key);
  }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="purchase-create-page" bind:this={componentRoot} dir={t('dir')}>

  <!-- ===== Purchase details card (sale form card shell) ===== -->
  <section class="sf-card sf-details" aria-labelledby="pf-bi">
    <div class="sf-card__bar">
      <button
        type="button"
        class="sf-back"
        on:click={() => push('/dashboard/purchases')}
        aria-label={t('Back')}
        title={t('Back')}>
        <i class="ms" aria-hidden="true">{t('dir') === 'rtl' ? 'arrow_forward' : 'arrow_back'}</i>
      </button>
  
      <span class="sf-bar-divider" aria-hidden="true"></span>
  
      <i class="ms f sf-bar-icon" aria-hidden="true">receipt_long</i>
  
      <h2 id="pf-bi" class="sf-card__title">{t('New Purchase')}</h2>
  
      <span class="sf-reqnote" aria-hidden="true">
        <i class="ms" aria-hidden="true">asterisk</i>
      </span>
    </div>

    <div class="sf-dgrid">
      <div class="sf-field sf-field--date">
        <span class="sf-field-label">{t('Date')}</span>

        <div class="sf-app-datepicker">
          <AppDatePicker bind:value={date} required />
        </div>
      </div>

      <div class="sf-field sf-field--bill">
        <span class="sf-field-label">{t('Bill #')} <em>{t('Auto')}</em></span>

        <div class="sf-readonly-field">
          <span class="sf-readonly-field__hash" aria-hidden="true">#</span>
          <span dir="ltr" class="sf-readonly-field__value">{form.bill_number}</span>
          <i class="ms" aria-hidden="true">lock</i>
        </div>
      </div>

      <div class="sf-field sf-field--customer">
        <span class="sf-field-label">
          {t('Supplier')}
        </span>

        <div class="purchase-supplier-control position-relative">
          <div class="sf-custbox">
            {#if form.account_id}
              <button
                type="button"
                class="sf-custbox__avatar"
                title={t('Account')}
                aria-label={t('Account')}
                on:click={() => (showAccountModal = true)}>
                {(getAccountName(form.account_id) || '?').trim().charAt(0)}
              </button>

              <button
                type="button"
                class="sf-custbox__main"
                title={getAccountName(form.account_id)}
                on:click={async () => {
                  form.account_id = '';
                  form_account_search = '';
                  showAccountDropdown = true;
                  filteredAccounts = suppliers;
                  await tick();
                  form_account_search_input?.focus();
                }}>
                <span class="sf-custbox__name">
                  {getAccountName(form.account_id)}
                </span>

                {#if calculatedBalance}
                  <span
                    class="sf-custbox__bal"
                    class:is-positive={calculatedBalance.amount > 0}
                    class:is-negative={calculatedBalance.amount < 0}
                    title={`${Math.abs(calculatedBalance.amount).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })} ${t(calculatedBalance.currency)}`}>
                    <span class="sf-custbox__bal-amount" dir="ltr">
                      {Math.abs(calculatedBalance.amount).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                    <small>{getCurrencyLabel(calculatedBalance.currency)}</small>
                  </span>
                {/if}

                <i class="ms sf-custbox__chev" aria-hidden="true">expand_more</i>
              </button>
            {:else}
              <span class="sf-custbox__person" aria-hidden="true">
                <i class="ms">person</i>
              </span>

              <input
                id="form_account_search"
                class="sf-custbox__input"
                bind:this={form_account_search_input}
                type="text"
                bind:value={form_account_search}
                placeholder={t('Select Supplier')}
                autocomplete="off"
                on:input={handleSupplierSearchInput}
                on:focus={handleSupplierSearchFocus}
                on:blur={() =>
                  setTimeout(() => (showAccountDropdown = false), 150)} />
            {/if}

            <span class="sf-custbox__divider" aria-hidden="true"></span>

            <button
              type="button"
              class="sf-custbox__add"
              title={t('Add Account')}
              aria-label={t('Add Account')}
              on:click={() => accountModalRef?.openModal()}>
              <i class="ms f" aria-hidden="true">person_add</i>
            </button>
          </div>

          {#if showAccountDropdown}
            <div
              use:portal
              class="sale-customer-dropdown"
              style={accountDropdownStyle}
              aria-label={t('Select Supplier')}>
              <div class="sale-customer-dropdown__search">
                <i class="ms" aria-hidden="true">search</i>
                <input
                  type="search"
                  bind:value={form_account_search}
                  placeholder={t('Search')}
                  aria-label={t('Search')}
                  autocomplete="off"
                  on:input={handleSupplierSearchInput}
                  on:blur={() =>
                    setTimeout(() => (showAccountDropdown = false), 150)} />
              </div>

              <div
                class="sale-customer-dropdown__list"
                role="listbox"
                aria-label={t('Select Supplier')}>
                {#each filteredAccounts as acc (acc.id)}
                  {@const balance = balanceAmount(accountBalanceMap, acc.id, form.currency)}
                  <button
                    type="button"
                    role="option"
                    aria-selected={form.account_id == acc.id}
                    class="sale-customer-option"
                    class:is-active={form.account_id == acc.id}
                    title={accountDisplayName(acc)}
                    on:mousedown={() => {
                      form.account_id = acc.id;
                      form_account_search = accountDisplayName(acc);
                      showAccountDropdown = false;
                    }}>
                    <span class="sale-customer-option__avatar">
                      {accountDisplayName(acc).trim().charAt(0) || '?'}
                    </span>

                    <span class="sale-customer-option__copy">
                      <strong>{accountDisplayName(acc)}</strong>
                    </span>

                    <span
                      class="sale-customer-option__bal"
                      class:is-positive={balance > 0}
                      class:is-negative={balance < 0}>
                      <span dir="ltr">
                        {Math.abs(balance).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </span>
                      <small>{getCurrencyLabel(form.currency)}</small>
                    </span>
                  </button>
                {/each}

                {#if !filteredAccounts.length}
                  <span class="sale-customer-dropdown__empty">{t('No accounts found')}</span>
                {/if}
              </div>

              <button
                type="button"
                class="sale-customer-dropdown__new"
                on:mousedown={(event) => {
                  event.preventDefault();
                  showAccountDropdown = false;
                  accountModalRef?.openModal();
                }}>
                <i class="ms f" aria-hidden="true">person_add</i>
                {t('Add Account')}
              </button>
            </div>
          {/if}
        </div>
      </div>

      <div class="sf-field sf-field--currency">
        <span class="sf-field-label">{t('Currency')}</span>

        <div class="sf-curbox sf-curbox--solo" class:is-open={showCurrencyMenu}>
          <button
            type="button"
            class="sf-curbox__cur"
            aria-haspopup="listbox"
            aria-expanded={showCurrencyMenu}
            aria-label={selectedCurrency ? t(selectedCurrency.code) : t('Currency')}
            on:click|stopPropagation={toggleCurrencyMenu}>
            <span class="sf-curbox__sym" dir="ltr">
              {selectedCurrency?.symbol || selectedCurrency?.code || form.currency}
            </span>
            <i class="ms" aria-hidden="true">expand_more</i>
          </button>
        </div>

        {#if showCurrencyMenu}
          <div class="sf-cumenu" role="dialog" aria-label={t('Currency')}>
            <label class="sf-cumenu__search">
              <i class="ms" aria-hidden="true">search</i>
              <input
                type="search"
                bind:this={currencySearchInput}
                bind:value={currencySearch}
                placeholder={t('Search')}
                aria-label={t('Search')} />
            </label>

            <div class="sf-cumenu__list" role="listbox" aria-label={t('Currency')}>
              {#each filteredCurrencies as cur (cur.code)}
                <button
                  type="button"
                  role="option"
                  aria-selected={form.currency === cur.code}
                  class="sf-cumenu__opt"
                  class:is-active={form.currency === cur.code}
                  class:is-base={cur.code === baseCurrency?.code}
                  on:click={() => pickPurchaseCurrency(cur)}>
                  <span class="sf-cumenu__chip" dir="ltr">
                    {cur.symbol || cur.code}
                  </span>
                  <span class="sf-cumenu__cpy">
                    <span class="sf-cumenu__name">{t(cur.code)}</span>
                    {#if currencyRateLabel(cur)}
                      <span class="sf-cumenu__rate" dir="ltr">{currencyRateLabel(cur)}</span>
                    {/if}
                  </span>
                  <span class="sf-cumenu__code" dir="ltr">{cur.code}</span>
                  <i class="ms sf-cumenu__check" aria-hidden="true">check</i>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- description: full width under the fields (SaleNew.html note box) -->
      <div class="sf-field sf-field--description sf-field--description-full">
        <span class="sf-field-label">{t('Description')}</span>

        <div class="sf-notebox">
          <i class="ms sf-notebox__icon" aria-hidden="true">edit_note</i>
          <textarea
            bind:value={form.description}
            rows="2"
            maxlength="200"
            placeholder={t('Description')}></textarea>
        </div>
      </div>
    </div>
  </section>

  <section class="sf-card sf-items">
    <div class="sf-items__table">
      <PurchaseItemsTable
        bind:items
        bind:warehouse_id={form.warehouse_id}
        currency={form.currency} />
    </div>
  </section>

  <section class="sf-sum sf-sum--purchase" aria-labelledby="pf-sum-title">
    <div class="sf-sum__cell">
      <h3 id="pf-sum-title" class="sf-sum__title">
        <i class="ms f" aria-hidden="true">calculate</i>
        {t('Bill Summary')}
      </h3>

      <label class="sf-sum__note">
        <span class="sf-sum__label">{t('Description')}</span>

        <span class="sf-sum__notebox">
          <i class="ms" aria-hidden="true">edit_note</i>

          <textarea
            rows="2"
            maxlength="200"
            data-purchase-payment-field="description"
            bind:value={paymentDescription}
            placeholder={t('Description')}
            on:keydown={(event) =>
              handlePurchasePaymentEnter(event, 'description')}></textarea>
        </span>
      </label>
    </div>

    <div class="sf-sum__cell sf-sum__pay">
      <div class="sf-totalbar" title={t('Payable')}>
        <span class="sf-totalbar__label">{t('Payable')}</span>

        <span class="sf-totalbar__amount">
          <b dir="ltr">
            {Number(total_amount || 0).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </b>
          <small>{getCurrencySymbol(form.currency || 'AFN')}</small>
        </span>
      </div>

      <span class="sf-sum__label sf-sum__label--received">{t('Payment')}</span>

      <div class="sf-payrow">
        <div class="payment-composite-control">
          <div class="payment-amount-currency-control">
            <input
              id="paymentAmount"
              dir="ltr"
              type="number"
              min="0"
              step="any"
              data-purchase-payment-field="payment"
              bind:value={paymentAmount}
              placeholder="0"
              disabled={isTreasuryPaymentLocked}
              on:focus={() => {
                if (isTreasuryPaymentLocked) return;
                if (paymentAmount === null || paymentAmount === 0) {
                  paymentAmount = '';
                }
              }}
              on:input={() => {
                if (isTreasuryPaymentLocked) {
                  paymentAmount = 0;
                  return;
                }
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
                handlePurchasePaymentEnter(event, 'payment')} />

            <span class="sf-paydiv" aria-hidden="true"></span>

            <div class="payment-currency-picker purchase-simple-payment__currency">
              {#if currencies.length > 1 &&
                quickPaymentFromCurrency &&
                quickPaymentToCurrency}
                <button
                  type="button"
                  class="sf-rateedit"
                  class:is-open={quickPaymentRateEditing}
                  title={t('Exchange Rate')}
                  aria-label={t('Exchange Rate')}
                  on:click|stopPropagation={startQuickPaymentRateEdit}>
                  <i class="ms" aria-hidden="true">edit</i>
                </button>
              {/if}

              <button
                type="button"
                class="payment-currency-picker__main"
                aria-expanded={showPaymentCurrencyMenu}
                aria-haspopup="listbox"
                aria-label={t('Currency')}
                on:click|stopPropagation={togglePaymentCurrencyMenu}>
                <span class="sf-paycur" dir="ltr">{getCurrencySymbol(paymentCurrencyCode)}</span>
                <i class="ms" aria-hidden="true">expand_more</i>
              </button>

              {#if showPaymentCurrencyMenu}
                <div class="sf-cumenu" role="dialog" aria-label={t('Currency')}>
                  <label class="sf-cumenu__search">
                    <i class="ms" aria-hidden="true">search</i>
                    <input
                      type="search"
                      bind:this={paymentCurrencySearchInput}
                      bind:value={paymentCurrencySearch}
                      placeholder={t('Search')}
                      aria-label={t('Search')} />
                  </label>

                  <div class="sf-cumenu__list" role="listbox" aria-label={t('Currency')}>
                    {#each filteredPaymentCurrencies as cur (cur.code)}
                      <button
                        type="button"
                        role="option"
                        aria-selected={paymentCurrencyCode === cur.code}
                        class="sf-cumenu__opt"
                        class:is-active={paymentCurrencyCode === cur.code}
                        class:is-base={cur.code === baseCurrency?.code}
                        on:click|stopPropagation={() => selectPaymentCurrency(cur.code)}>
                        <span class="sf-cumenu__chip" dir="ltr">
                          {cur.symbol || cur.code}
                        </span>
                        <span class="sf-cumenu__cpy">
                          <span class="sf-cumenu__name">{t(cur.code)}</span>
                          {#if currencyRateLabel(cur)}
                            <span class="sf-cumenu__rate" dir="ltr">{currencyRateLabel(cur)}</span>
                          {/if}
                        </span>
                        <span class="sf-cumenu__code" dir="ltr">{cur.code}</span>
                        <i class="ms sf-cumenu__check" aria-hidden="true">check</i>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- payment exchange rate: the sale form «نرخ تبادله» card -->
              {#if quickPaymentRateEditing}
                <div class="sf-ratebox" role="dialog" aria-label={t('Exchange Rate')}>
                  <span class="sf-ratebox__head">
                    <span class="sf-ratebox__title">{t('Exchange Rate')}</span>

                    {#if quickPaymentRateTabs.length > 1}
                      <span class="sf-ratebox__tabs">
                        {#each quickPaymentRateTabs as tab (tab.code)}
                          <button
                            type="button"
                            class="sf-ratebox__tab"
                            class:is-active={tab.code === quickPaymentFromCurrency}
                            title={t(tab.code)}
                            disabled={quickPaymentRateSaving}
                            on:click|stopPropagation={() =>
                              selectQuickPaymentRateCurrency(tab.code)}>
                            {tab.symbol || tab.code}
                          </button>
                        {/each}
                      </span>
                    {/if}
                  </span>

                  <div class="sf-ratebox__row" class:is-edited={quickPaymentRateEdited}>
                    <span class="sf-ratebox__lead" dir="ltr">1 {quickPaymentFromSymbol}</span>

                    <button
                      type="button"
                      class="sf-ratebox__op"
                      class:is-div={quickPaymentRateOp === 'div'}
                      title={quickPaymentRateFormula}
                      aria-label={t('Exchange Rate')}
                      disabled={quickPaymentRateSaving}
                      on:click|stopPropagation={toggleQuickPaymentRateOp}>
                      {quickPaymentRateOp === 'div' ? '÷' : '×'}
                    </button>

                    <input
                      class="sf-ratebox__input"
                      bind:this={quickPaymentRateInput}
                      type="number"
                      min="0.000001"
                      step="any"
                      bind:value={quickPaymentExchangeRate}
                      disabled={quickPaymentRateSaving}
                      aria-label={t('Exchange Rate')}
                      on:keydown={handleQuickPaymentRateKeydown} />
                  </div>

                  {#if quickPaymentRateFormula}
                    <span class="sf-ratebox__hint" dir="ltr" title={quickPaymentRateFormula}>
                      <i class="ms" aria-hidden="true">info</i>
                      <span>{quickPaymentRateFormula}</span>
                    </span>
                  {/if}

                  <div class="sf-ratebox__actions">
                    <button
                      type="button"
                      class="sf-ratebox__cancel"
                      disabled={quickPaymentRateSaving}
                      on:click|stopPropagation={cancelQuickPaymentRateEdit}>
                      {t('Cancel')}
                    </button>

                    <button
                      type="button"
                      class="sf-ratebox__save"
                      disabled={quickPaymentRateSaving}
                      on:click|stopPropagation={saveQuickPaymentExchangeRate}>
                      {#if quickPaymentRateSaving}
                        <span
                          class="spinner-border spinner-border-sm"
                          role="status"
                          aria-label={t('Loading...')}></span>
                      {:else}
                        {t('Save')}
                      {/if}
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <div class="sf-acct" role="group" aria-label={t('Payment Way')}>
        <button
          type="button"
          class="sf-acct__btn"
          class:is-wide={second_entry_account == treasury_ID}
          aria-pressed={second_entry_account == treasury_ID}
          title={t('Treasury')}
          on:click={selectTreasuryPayment}>
          <i class="ms" aria-hidden="true">account_balance</i>

          {#if second_entry_account == treasury_ID}
            <span class="sf-acct__name">{t('Treasury')}</span>
            <small class="sf-acct__bal">
              <span dir="ltr">{formatBalanceAmount(treasuryAvailableCash)}</span>
              <span dir="ltr">{getCurrencySymbol(treasuryPaymentBalance.currency)}</span>
            </small>
          {/if}
        </button>

        <button
          type="button"
          class="sf-acct__btn"
          class:is-wide={second_entry_account == track_ID && Boolean(track_ID)}
          aria-pressed={second_entry_account == track_ID}
          title={t('Track')}
          on:click={openTrackModal}>
          <i class="ms" aria-hidden="true">account_balance_wallet</i>

          {#if second_entry_account == track_ID && track_ID}
            <span class="sf-acct__name">{getAccountName(track_ID)}</span>
            <small class="sf-acct__bal">
              <span dir="ltr">{formatBalanceAmount(trackedPaymentBalance.amount)}</span>
              <span dir="ltr">{getCurrencySymbol(trackedPaymentBalance.currency)}</span>
            </small>
          {/if}
        </button>
      </div>

      {#if isTreasuryPaymentLocked}
        <div class="sf-alert" role="alert">
          <i class="ms" aria-hidden="true">warning</i>
          <span>
            {t('Treasury has no available balance. Payment is set to 0. Use Track to pay from another account, or save this bill unpaid.')}
          </span>
        </div>
      {/if}

      <div class="sf-actions">
        <button
          type="button"
          class="sf-action sf-action--draft"
          on:click={() => savePurchase(false)}
          disabled={loading}>
          {#if loading}
            <span class="spinner-border spinner-border-sm" role="status"></span>
          {:else}
            <i class="ms f" aria-hidden="true">bookmark</i>
          {/if}

          <span>{t('Save Draft')}</span>
        </button>

        <button
          type="button"
          class="sf-action sf-action--confirm"
          on:click={() => savePurchase(true)}
          disabled={loading}>
          {#if loading}
            <span class="spinner-border spinner-border-sm" role="status"></span>
          {:else}
            <i class="ms" aria-hidden="true">check_circle</i>
          {/if}

          <span>{t('Confirm Purchase')}</span>
        </button>
      </div>
    </div>
  </section>

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
    if (newAccount) suppliers = mergeById(suppliers, [newAccount]);
    if (newAccount && (newAccount.account_type_id == SUPPLIER_TYPE_ID || Number(newAccount.can_be_supplier) === 1)) {
      form.account_id = newAccount.id;
    }
  }} />

{#if showTrackModal}
  <div class="purchase-modal-backdrop" role="presentation"></div>

  <div
    class="purchase-track-layer"
    id="trackModal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="trackModalLabel">
    <div class="purchase-track-dialog">
      <div class="purchase-track-modal">
        <header class="purchase-track-header">
          <div class="purchase-track-heading">
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
            class="purchase-track-close"
            aria-label={t('Close')}
            on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="purchase-track-body">
          <div class="purchase-track-search">
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

          <div class="purchase-track-list">
            {#each filteredSecondAccounts as acc (acc.id)}
              <button
                type="button"
                class="purchase-track-account"
                on:click={() => {
                  second_entry_account = acc.id;
                  track_ID = acc.id;
                  showTrackModal = false;
                }}>
                <span class="purchase-track-account__icon">
                  <i class="bi bi-person" aria-hidden="true"></i>
                </span>

                <span class="purchase-track-account__copy">
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

                <i class="bi bi-chevron-right purchase-track-account__arrow" aria-hidden="true"></i>
              </button>
            {/each}

            {#if filteredSecondAccounts.length === 0}
              <div class="purchase-track-empty">
                <span aria-hidden="true">
                  <i class="bi bi-person-x"></i>
                </span>

                <strong>{t('No accounts found')}</strong>
              </div>
            {/if}
          </div>
        </div>

        <footer class="purchase-track-footer">
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
  <div class="purchase-modal-backdrop" role="presentation"></div>

  <div
    class="purchase-account-view-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="purchaseAccountViewTitle">
    <div class="purchase-account-view-dialog">
      <div class="purchase-account-view-modal">
        <header>
          <div>
            <span aria-hidden="true">
              <i class="bi bi-person-vcard"></i>
            </span>
            <h2 id="purchaseAccountViewTitle">{t('Account')}</h2>
          </div>

          <button
            type="button"
            aria-label={t('Close')}
            on:click={() => (showAccountModal = false)}>
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div class="purchase-account-view-body">
          {#await import('../accounts/AccountView.svelte') then mod}
            <svelte:component this={mod.default} id={form.account_id} />
          {/await}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .purchase-create-page {
    --purchase-primary: var(--bs-primary, #2f6fed);
    --purchase-primary-dark: #1d4ed8;
    --purchase-green: #059669;
    --purchase-text: #172033;
    --purchase-muted: #718096;
    --purchase-border: #dfe6ef;
    --purchase-border-soft: #edf1f6;
    --purchase-surface: #ffffff;
    --purchase-bg-soft: #f7f9fc;
    --purchase-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    /*
     * The dashboard shell puts this page inside <main>, which is a flex
     * column with overflow-y: auto. A shrinkable flex item is squeezed to
     * the viewport height instead of overflowing, so <main> never grows a
     * scrollbar and the bill summary under the item table becomes
     * unreachable. Keep the page at its natural height.
     */
    flex: 0 0 auto;
    gap: 1rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0 0 1.25rem;
    color: var(--purchase-text);
  }

  /* Page header */

  .purchase-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.9rem 1rem;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: var(--purchase-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .purchase-page-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }

  .purchase-page-icon {
    display: inline-grid;
    flex: 0 0 2.75rem;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1.1rem;
  }

  .purchase-page-heading__copy {
    min-width: 0;
  }

  .purchase-page-eyebrow {
    margin-bottom: 0.05rem;
    color: var(--purchase-primary);
    font-size: 0.65rem;
    font-weight: 850;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .purchase-page-heading h1 {
    margin: 0;
    color: var(--purchase-text);
    font-size: 1.15rem;
    font-weight: 900;
    line-height: 1.3;
    letter-spacing: -0.025em;
  }

  .purchase-page-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    color: #7c899c;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .purchase-page-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .purchase-page-meta strong {
    color: #526176;
    font-weight: 800;
  }

  .purchase-page-meta__separator {
    width: 3px;
    height: 3px;
    border-radius: 999px;
    background: #cbd5e1;
  }

  .purchase-page-header__actions {
    display: flex;
    flex-shrink: 0;
  }

  .purchase-supplier-balance {
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

  .purchase-supplier-balance:hover {
    border-color: #bed3f8;
    background: #edf4ff;
  }

  .purchase-supplier-balance__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--purchase-primary);
  }

  .purchase-supplier-balance__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.04rem;
  }

  .purchase-supplier-balance__copy small {
    color: #718096;
    font-size: 0.58rem;
    font-weight: 700;
  }

  .purchase-supplier-balance__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.72rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-balance__arrow {
    color: #95a3b6;
    font-size: 0.65rem;
  }

  /* Shared sections */

  .purchase-section {
    min-width: 0;
    overflow: visible;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: var(--purchase-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .purchase-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--purchase-border-soft);
  }

  .purchase-section-header--compact {
    min-height: 3.75rem;
  }

  .purchase-section-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .purchase-section-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.6rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 0.9rem;
  }

  .purchase-section-icon--neutral {
    background: #f1f5f9;
    color: #64748b;
  }

  .purchase-section-icon--green {
    background: #ecfdf5;
    color: var(--purchase-green);
  }

  .purchase-section-heading h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .purchase-section-heading p {
    margin: 0.1rem 0 0;
    color: #8794a7;
    font-size: 0.63rem;
    font-weight: 550;
  }

  .purchase-required-note {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: #b42318;
  font-size: 0.62rem;
  font-weight: 700;
}

.purchase-required-note i {
  color: #dc2626;
  font-size: 0.48rem;
}

  /* Details */

  .purchase-details-grid {
    --purchase-control-height: 2.375rem;

    display: grid;
    grid-template-columns:
      minmax(10rem, 1fr)
      minmax(13rem, 1.35fr)
      minmax(8rem, 0.72fr)
      minmax(10rem, 0.9fr)
      minmax(8rem, 0.72fr);
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.625rem;
  }

  .purchase-field {
    display: grid;
    grid-template-rows: 1rem auto;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }

  .purchase-field--description {
    grid-column: 1 / -1;
    grid-template-rows: auto;
  }

  .purchase-field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1rem;
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .purchase-field-label i {
    display: none;
  }

  .purchase-details-grid :global(.filter-select) {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .purchase-details-grid :global(.filter-select__label),
  .purchase-details-grid :global(.filter-label),
  .purchase-details-grid :global(.filter-select__notch) {
    display: none !important;
  }

  .purchase-details-grid :global(.filter-select.outline) {
    padding-top: 0 !important;
  }

  .purchase-details-grid :global(.filter-select__control),
  .purchase-details-grid :global(.filter-select select),
  .purchase-details-grid :global(.filter-select button),
  .purchase-details-grid :global(.form-select) {
    width: 100%;
    min-height: var(--purchase-control-height) !important;
    height: var(--purchase-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .purchase-details-grid :global(.filter-select__control:hover),
  .purchase-details-grid :global(.filter-select select:hover),
  .purchase-details-grid :global(.form-select:hover) {
    border-color: #bcc9db !important;
  }

  .purchase-details-grid :global(.filter-select__control:focus-within),
  .purchase-details-grid :global(.filter-select select:focus),
  .purchase-details-grid :global(.form-select:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .purchase-supplier-input {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--purchase-control-height);
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-supplier-input:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-supplier-input__icon {
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

  .purchase-supplier-input__icon.is-active {
    color: var(--purchase-primary, #2f6fed);
    cursor: pointer;
  }

  .purchase-supplier-input__icon.is-active:hover {
    color: var(--purchase-primary-dark, #1d4ed8);
  }

  .purchase-supplier-input__icon:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .purchase-supplier-input > input {
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

  .purchase-supplier-input > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-selected-supplier {
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

  .purchase-selected-supplier__identity {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    overflow: hidden;
  }

  .purchase-selected-supplier__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-selected-supplier__divider {
    flex: 0 0 1px;
    width: 1px;
    height: 1rem;
    background: #d6dfeb;
  }

  .purchase-selected-supplier__balance {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.22rem;
    color: var(--purchase-primary);
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .purchase-selected-supplier__balance.is-negative {
    color: #dc2626;
  }

  .purchase-selected-supplier__balance b {
    font: inherit;
  }

  .purchase-selected-supplier__balance small {
    font-size: 0.58rem;
    font-weight: 750;
  }

  .purchase-selected-supplier i {
    flex-shrink: 0;
    color: #94a3b8;
    font-size: 0.72rem;
  }

  .purchase-add-supplier {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.2rem;
    padding-inline: 0.65rem;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: var(--purchase-primary);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .purchase-add-supplier:hover {
    background: var(--purchase-primary-dark);
  }

  .purchase-supplier-dropdown {
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

  .purchase-supplier-dropdown::-webkit-scrollbar {
    display: none;
  }

  .purchase-supplier-dropdown li {
    margin: 0;
    padding: 0;
  }

  .purchase-supplier-option {
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

  .purchase-supplier-option:hover {
    background: #f0f6ff;
  }

  .purchase-supplier-option__avatar {
    display: inline-grid;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-supplier-option__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .purchase-supplier-option__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-option__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-supplier-option__arrow {
    flex-shrink: 0;
    color: #a0acbc;
    font-size: 0.58rem;
  }

  .purchase-readonly-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: var(--purchase-control-height);
    padding-inline: 0.75rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.625rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .purchase-readonly-field i {
    color: #9aa7b8;
    font-size: 0.65rem;
  }

  .purchase-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .purchase-app-datepicker :global(.app-date-field) {
    width: 100%;
    gap: 0 !important;
  }

  .purchase-app-datepicker :global(.date-label) {
    display: none !important;
  }

  .purchase-app-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    min-height: var(--purchase-control-height) !important;
    height: var(--purchase-control-height) !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .purchase-app-datepicker :global(input) {
    width: 100%;
    min-width: 0;
    min-height: var(--purchase-control-height) !important;
    height: var(--purchase-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .purchase-app-datepicker :global(input:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  /* Lower cards */

  .purchase-lower-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    min-width: 0;
  }

  .purchase-description-body,
  .purchase-payment-body {
    padding: 0.875rem 1rem 1rem;
  }

  .purchase-description-body {
    display: grid;
    gap: 0.45rem;
  }

  .purchase-description-body--details {
    padding: 0;
  }

  .purchase-description-body textarea {
    width: 100%;
    min-height: 4.75rem;
    padding: 0.75rem;
    resize: vertical;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    outline: 0;
    background: #ffffff;
    color: #26364b;
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .purchase-description-body textarea:hover {
    border-color: #bcc9db;
  }

  .purchase-description-body textarea:focus {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-description-body textarea::placeholder {
    color: #9aa7b8;
  }

  .purchase-description-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #8a97aa;
    font-size: 0.62rem;
    font-weight: 600;
  }

  /* Payment */

  .purchase-simple-payment {
    display: grid;
    grid-template-columns:
      minmax(8rem, 0.6fr)
      minmax(24rem, 1.75fr)
      minmax(9.5rem, 0.75fr);
    align-items: end;
    gap: 0.55rem;
    padding: 0.75rem;
    border: 1px solid #dfe8f3;
    border-radius: 0.85rem;
    background: #ffffff;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.04);
  }

  .purchase-simple-payment__total {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.35rem;
    min-width: 0;
    min-height: 2.6rem;
    padding-inline: 0.75rem;
    border-radius: 0.7rem;
    background: #f6f9fd;
    color: #59687c;
    white-space: nowrap;
  }

  .purchase-simple-payment__total span {
    font-size: 0.68rem;
    font-weight: 800;
  }

  .purchase-simple-payment__total strong {
    color: var(--purchase-primary);
    font-size: 1rem;
    font-weight: 900;
  }

  .purchase-simple-payment__total small {
    color: #6b7a90;
    font-size: 0.66rem;
    font-weight: 750;
  }

  .purchase-simple-payment__field {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
  }

  .purchase-simple-payment__field > span {
    color: #59687c;
    font-size: 0.63rem;
    font-weight: 800;
    line-height: 1;
  }

  .purchase-simple-payment__field > div {
    display: flex;
    align-items: center;
    width: 100%;
    height: 2.6rem;
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-simple-payment__field > div:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-simple-payment__field i {
    flex: 0 0 1.8rem;
    width: 1.8rem;
    color: #8c9aad;
    text-align: center;
    pointer-events: none;
  }

  .purchase-simple-payment__field input {
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
    font-weight: 750;
  }

  .purchase-simple-payment__field--amount input {
    min-width: 5.5rem;
  }

  .payment-amount-currency-control > input {
    min-width: 5.5rem;
  }

  .purchase-simple-payment__field input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-simple-payment__currency {
    position: relative;
    border-inline-start: 1px solid #dbe3ef;
  }

  .payment-currency-picker__main {
    position: relative;
    z-index: 1;
    padding-inline-end: 1.55rem !important;
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
      color 0.15s ease,
      transform 0.15s ease;
  }

  .payment-currency-rate-edit:hover {
    background: transparent;
    color: var(--purchase-primary);
    box-shadow: none;
    transform: translateY(-1px);
  }

  .payment-currency-rate-edit:focus-visible {
    outline: 2px solid rgba(47, 111, 237, 0.34);
    outline-offset: 1px;
  }

  .payment-currency-rate-edit i {
    flex: 0 0 auto !important;
    width: auto !important;
    color: inherit !important;
    font-size: inherit !important;
    line-height: 1;
    pointer-events: none;
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

  .purchase-simple-payment__currency > .payment-currency-picker__main {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 100%;
    min-width: 4rem;
    padding-inline: 0.55rem;
    border: 0;
    background: #f8fafc;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .purchase-simple-payment__currency > .payment-currency-picker__main:hover {
    background: #eef3f8;
  }

  .purchase-simple-payment__method {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    height: auto;
    flex: 0 0 auto;
    min-width: 14rem;
    padding: 0.18rem;
    border-inline-start: 1px solid #dbe3ef;
    background: #f8fafc;
  }

  .purchase-simple-payment__method button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 4.5rem;
    height: 100%;
    padding-inline: 0.65rem;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: #526176;
    font-size: 0.64rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .purchase-simple-payment__method button.is-active {
    min-width: 9.5rem;
  }

  .purchase-simple-payment__method button i {
    flex: 0 0 auto;
    width: auto;
    color: inherit;
  }

  .purchase-simple-payment__method button span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }

  .purchase-simple-payment__method-balance {
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

  .purchase-simple-payment__method button.is-active {
    background: #ecfdf5;
    color: #059669;
    box-shadow: 0 1px 4px rgba(5, 150, 105, 0.12);
  }

  .purchase-simple-payment__method button.is-active .purchase-simple-payment__method-balance {
    color: #047857;
  }

  .purchase-payment-method-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.8rem;
    padding-inline: 0.6rem;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .purchase-payment-method-badge--treasury {
    border: 1px solid #bfe9d4;
    background: #effaf5;
    color: #087a54;
  }

  .purchase-payment-method-badge--track {
    border: 1px solid #d5e3fb;
    background: #f3f7fe;
    color: #2f6fed;
  }

  .purchase-payment-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .purchase-payment-field {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .purchase-payment-field > span {
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .purchase-payment-amount,
  .purchase-payment-description {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--purchase-control-height);
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-payment-amount:focus-within,
  .purchase-payment-description:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-payment-amount > i,
  .purchase-payment-description > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
    pointer-events: none;
  }

  .purchase-payment-amount > input,
  .purchase-payment-description > input {
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

  .purchase-payment-amount > input::placeholder,
  .purchase-payment-description > input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
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
    color: var(--purchase-primary);
  }

  .purchase-payment-methods {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .purchase-payment-method {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    min-height: 4rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.7rem;
    background: #ffffff;
    color: #334155;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-payment-method:hover {
    transform: translateY(-1px);
    border-color: #c9d7e8;
    background: #fbfcfe;
  }

  .purchase-payment-method.is-active {
    border-color: #99b9f4;
    background: #f4f8ff;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.07);
  }

  .purchase-payment-method__icon {
    display: inline-grid;
    flex: 0 0 2.35rem;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border-radius: 0.6rem;
    font-size: 0.88rem;
  }

  .purchase-payment-method__icon--track {
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-payment-method__icon--treasury {
    background: #ecfdf5;
    color: var(--purchase-green);
  }

  .purchase-payment-method__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.06rem;
  }

  .purchase-payment-method__copy strong {
    overflow: hidden;
    color: #26364b;
    font-size: 0.75rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-payment-method__copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-payment-method__check {
    flex-shrink: 0;
    color: #a9b4c3;
    font-size: 0.82rem;
  }

  .purchase-payment-method.is-active .purchase-payment-method__check {
    color: var(--purchase-primary);
  }

  .purchase-treasury-status {
    display: flex;
    grid-column: 1 / -1;
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

  .purchase-treasury-status i {
    color: var(--purchase-green);
  }

  .purchase-treasury-status--warning {
    border-color: #f3d19c;
    background: #fff7eb;
    color: #8a5a12;
  }

  .purchase-treasury-status--warning i {
    color: #d48806;
  }

  .purchase-simple-payment__field--amount input:disabled {
    background: #f3f5f8;
    color: #7b8796;
    cursor: not-allowed;
  }

  .purchase-treasury-status strong {
    color: #176a4c;
    font-weight: 850;
  }

  /* Sticky actions */

  .purchase-actions {
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

  .purchase-actions__buttons {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .purchase-action-button {
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

  .purchase-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .purchase-action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .purchase-action-button--draft {
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #526176;
  }

  .purchase-action-button--draft:hover:not(:disabled) {
    border-color: #becbdb;
    background: #f8fafc;
    color: #26364b;
  }

  .purchase-action-button--confirm {
    min-width: 9rem;
    border: 1px solid var(--purchase-primary);
    background: var(--purchase-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
  }

  .purchase-action-button--confirm:hover:not(:disabled) {
    border-color: var(--purchase-primary-dark);
    background: var(--purchase-primary-dark);
    box-shadow: 0 7px 18px rgba(47, 111, 237, 0.27);
  }

  /* Modals */

  .purchase-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(2px);
  }

  .purchase-track-layer,
  .purchase-account-view-layer {
    position: fixed;
    inset: 0;
    z-index: 1410;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow-y: auto;
  }

  .purchase-track-dialog {
    width: min(94vw, 32rem);
  }

  .purchase-track-modal,
  .purchase-account-view-modal {
    overflow: hidden;
    border: 1px solid #dce4ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.22);
  }

  .purchase-track-header,
  .purchase-account-view-modal > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4.25rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #ffffff;
  }

  .purchase-track-heading,
  .purchase-account-view-modal > header > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .purchase-track-heading > span,
  .purchase-account-view-modal > header > div > span {
    display: inline-grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-track-heading small {
    display: block;
    color: #8794a7;
    font-size: 0.58rem;
    font-weight: 650;
  }

  .purchase-track-heading h2,
  .purchase-account-view-modal > header h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .purchase-track-close,
  .purchase-account-view-modal > header > button {
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

  .purchase-track-close:hover,
  .purchase-account-view-modal > header > button:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .purchase-track-body {
    padding: 0.8rem;
  }

  .purchase-track-search {
    display: flex;
    align-items: center;
    height: 2.625rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .purchase-track-search:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-track-search > i {
    flex: 0 0 2.25rem;
    width: 2.25rem;
    color: #8c9aad;
    text-align: center;
  }

  .purchase-track-search input {
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

  .purchase-track-search button {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-start: 1px solid #dfe6ef;
    background: #edf4ff;
    color: var(--purchase-primary);
    cursor: pointer;
  }

  .purchase-track-list {
    display: grid;
    gap: 0.35rem;
    max-height: 22rem;
    margin-top: 0.75rem;
    overflow-y: auto;
  }

  .purchase-track-account {
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

  .purchase-track-account:hover {
    border-color: #cddbf0;
    background: #f5f9ff;
  }

  .purchase-track-account__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-track-account__copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.05rem;
  }

  .purchase-track-account__copy strong {
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-track-account__copy small {
    overflow: hidden;
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-track-account__arrow {
    flex-shrink: 0;
    color: #a2adbc;
    font-size: 0.58rem;
  }

  .purchase-track-empty {
    display: grid;
    min-height: 10rem;
    place-items: center;
    align-content: center;
    gap: 0.4rem;
    color: #8794a7;
  }

  .purchase-track-empty span {
    display: inline-grid;
    width: 2.8rem;
    height: 2.8rem;
    place-items: center;
    border-radius: 0.7rem;
    background: #f1f5f9;
    font-size: 1rem;
  }

  .purchase-track-empty strong {
    font-size: 0.72rem;
    font-weight: 750;
  }

  .purchase-track-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-track-footer button {
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

  .purchase-account-view-dialog {
    width: min(96vw, 72rem);
  }

  .purchase-account-view-modal {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 2rem);
  }

  .purchase-account-view-body {
    min-height: 0;
    padding: 0.75rem;
    overflow-y: auto;
  }

  /* RTL */

  :global(html[dir='rtl']) .purchase-supplier-option__arrow,
  :global(html[dir='rtl']) .purchase-track-account__arrow {
    transform: scaleX(-1);
  }

  /* Responsive */

  @media (max-width: 1200px) {
    .purchase-details-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .purchase-field--supplier {
      grid-column: span 2;
    }

    .purchase-simple-payment {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .purchase-simple-payment__field--note {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 991.98px) {
    .purchase-page-header {
      align-items: flex-start;
    }

    .purchase-details-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .purchase-field--supplier {
      grid-column: span 1;
    }

    .purchase-lower-grid {
      grid-template-columns: 1fr;
    }

    .purchase-description-body textarea {
      min-height: 7rem;
    }

    .purchase-simple-payment__field--amount {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 767.98px) {
    .purchase-create-page {
      gap: 0.75rem;
      padding-bottom: 0.75rem;
    }

    .purchase-page-header {
      flex-direction: column;
      padding: 0.8rem;
    }

    .purchase-page-header__actions,
    .purchase-supplier-balance {
      width: 100%;
    }

    .purchase-details-grid {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-field--supplier {
      grid-column: auto;
    }

    .purchase-section-header {
      padding-inline: 0.8rem;
    }

    .purchase-simple-payment {
      grid-template-columns: 1fr;
      padding: 0.65rem;
    }

    .purchase-simple-payment__field--amount,
    .purchase-simple-payment__field--note {
      grid-column: auto;
    }

    .purchase-simple-payment__field--amount > div {
      align-items: stretch;
      flex-wrap: wrap;
      height: auto;
    }

    .payment-amount-currency-control {
      flex-wrap: wrap;
      width: 100%;
      height: auto;
    }

    .payment-amount-currency-control > input {
      min-height: 2.6rem;
    }

    .purchase-exchange-editor {
      width: 100%;
      min-height: 2.6rem;
    }

    .purchase-simple-payment__currency,
    .purchase-simple-payment__method {
      width: 100%;
      border-inline-start: 0;
      border-top: 1px solid #dbe3ef;
    }

    .purchase-simple-payment__currency > .payment-currency-picker__main,
    .purchase-simple-payment__method button {
      flex: 1 1 0;
      min-height: 2.35rem;
    }

    .purchase-payment-body {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-payment-methods,
    .purchase-treasury-status {
      grid-column: auto;
    }

    .purchase-actions {
      align-items: stretch;
      flex-direction: column;
      padding: 0.65rem;
    }

    .purchase-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .purchase-action-button {
      width: 100%;
      min-width: 0;
      padding-inline: 0.6rem;
    }
  }

  @media (max-width: 480px) {
    .purchase-section-icon {
      display: none;
    }

    .purchase-page-meta {
      flex-wrap: wrap;
    }

    .purchase-payment-methods {
      grid-template-columns: 1fr;
    }

    .purchase-actions__buttons {
      grid-template-columns: 1fr;
    }

    .purchase-track-layer,
    .purchase-account-view-layer {
      padding: 0.45rem;
    }

    .purchase-account-view-modal {
      max-height: calc(100dvh - 0.9rem);
    }
  }

  /* Dark theme */

  :global(html.dark) .purchase-create-page {
    --purchase-text: var(--erp-text, #e5edf8);
    --purchase-muted: var(--erp-muted, #94a3b8);
    --purchase-border: var(--erp-border, #2b3a4f);
    --purchase-border-soft: var(--erp-border, #2b3a4f);
    --purchase-surface: var(--erp-surface, #111827);
    --purchase-bg-soft: var(--erp-surface-soft, #172033);
    color-scheme: dark;
  }

  :global(html.dark) .purchase-section {
    border-color: var(--purchase-border);
    background: var(--purchase-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  :global(html.dark) .purchase-section-heading h2,
  :global(html.dark) .purchase-selected-supplier,
  :global(html.dark) .purchase-payment-method__copy strong {
    color: var(--purchase-text);
  }

  :global(html.dark) .purchase-section-heading p,
  :global(html.dark) .purchase-field-label,
  :global(html.dark) .purchase-description-hint,
  :global(html.dark) .purchase-payment-field > span,
  :global(html.dark) .purchase-payment-method__copy small {
    color: var(--purchase-muted);
  }

  :global(html.dark) .purchase-section-icon,
  :global(html.dark) .purchase-supplier-option__avatar,
  :global(html.dark) .purchase-payment-method__icon--track,
  :global(html.dark) .purchase-track-heading > span,
  :global(html.dark) .purchase-account-view-modal > header > div > span,
  :global(html.dark) .purchase-track-account__icon {
    background: rgba(47, 111, 237, 0.16);
  }

  :global(html.dark) .purchase-section-icon--neutral,
  :global(html.dark) .purchase-track-empty span {
    background: #202b3d;
    color: #a9b7ca;
  }

  :global(html.dark) .purchase-section-icon--green,
  :global(html.dark) .purchase-payment-method__icon--treasury {
    background: rgba(5, 150, 105, 0.16);
  }

  :global(html.dark) .purchase-details-grid :global(.filter-select__control),
  :global(html.dark) .purchase-details-grid :global(.filter-select select),
  :global(html.dark) .purchase-details-grid :global(.filter-select button),
  :global(html.dark) .purchase-details-grid :global(.form-select),
  :global(html.dark) .purchase-app-datepicker :global(input),
  :global(html.dark) .purchase-app-datepicker :global(.date-picker-control) {
    border-color: var(--purchase-border) !important;
    background: var(--purchase-bg-soft) !important;
    color: var(--purchase-text) !important;
  }

  :global(html.dark) .purchase-supplier-input,
  :global(html.dark) .purchase-description-body textarea,
  :global(html.dark) .purchase-simple-payment,
  :global(html.dark) .purchase-simple-payment__field > div,
  :global(html.dark) .purchase-payment-amount,
  :global(html.dark) .purchase-payment-description {
    border-color: var(--purchase-border);
    background: var(--purchase-bg-soft);
  }

  :global(html.dark) .purchase-supplier-input > input,
  :global(html.dark) .purchase-description-body textarea,
  :global(html.dark) .purchase-simple-payment__field input,
  :global(html.dark) .purchase-payment-amount > input,
  :global(html.dark) .purchase-payment-description > input {
    color: var(--purchase-text);
  }

  :global(html.dark) .purchase-supplier-input > input::placeholder,
  :global(html.dark) .purchase-description-body textarea::placeholder,
  :global(html.dark) .purchase-simple-payment__field input::placeholder,
  :global(html.dark) .purchase-payment-amount > input::placeholder,
  :global(html.dark) .purchase-payment-description > input::placeholder {
    color: #718198;
  }

  :global(html.dark) .purchase-selected-supplier__divider {
    background: var(--purchase-border);
  }

  :global(html.dark) .purchase-readonly-field,
  :global(html.dark) .payment-currency-picker__btn,
  :global(html.dark) .purchase-simple-payment__currency > .payment-currency-picker__main,
  :global(html.dark) .purchase-simple-payment__method {
    border-color: var(--purchase-border);
    background: #202b3d;
    color: #a9b7ca;
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

  :global(html.dark) .purchase-exchange-editor,
  :global([data-mdb-theme='dark']) .purchase-exchange-editor {
    background: #172033;
  }

  :global(html.dark) .purchase-exchange-editor > span,
  :global([data-mdb-theme='dark']) .purchase-exchange-editor > span {
    border-color: var(--purchase-border);
    background: #202b3d;
    color: #b7c6da;
  }

  :global(html.dark) .purchase-simple-payment__field .purchase-exchange-editor > input,
  :global([data-mdb-theme='dark']) .purchase-simple-payment__field .purchase-exchange-editor > input {
    background: #172033;
    color: #dbe7f7;
  }

  :global(html.dark) .purchase-exchange-editor__save,
  :global([data-mdb-theme='dark']) .purchase-exchange-editor__save {
    border-color: var(--purchase-border);
    background: rgba(5, 150, 105, 0.16);
    color: #6ee7b7;
  }

  :global(html.dark) .purchase-exchange-editor__cancel,
  :global([data-mdb-theme='dark']) .purchase-exchange-editor__cancel {
    border-color: var(--purchase-border);
    background: rgba(220, 38, 38, 0.14);
    color: #fca5a5;
  }

  :global(html.dark) .purchase-simple-payment__total {
    background: #172033;
    color: var(--purchase-muted);
  }

  :global(html.dark) .purchase-simple-payment__total small,
  :global(html.dark) .purchase-simple-payment__field > span {
    color: var(--purchase-muted);
  }

  :global(html.dark) .purchase-simple-payment__currency,
  :global(html.dark) .purchase-simple-payment__method {
    border-color: var(--purchase-border);
  }

  :global(html.dark) .purchase-simple-payment__currency > .payment-currency-picker__main:hover {
    background: #27354a;
  }

  :global(html.dark) .purchase-simple-payment__method button {
    color: #a9b7ca;
  }

  :global(html.dark) .purchase-simple-payment__method button.is-active {
    background: #12372d;
    color: #8bd5ba;
  }

  :global(html.dark) .purchase-supplier-dropdown {
    border-color: var(--purchase-border);
    background: var(--purchase-surface);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .purchase-supplier-option {
    color: var(--purchase-text);
  }

  :global(html.dark) .purchase-supplier-option:hover {
    background: #1d2b40;
  }

  :global(html.dark) .purchase-supplier-option__copy small,
  :global(html.dark) .purchase-supplier-option__arrow {
    color: var(--purchase-muted);
  }

  :global(html.dark) .purchase-payment-body {
    background: #0f1726;
  }

  :global(html.dark) .purchase-payment-method-badge--treasury,
  :global(html.dark) .purchase-treasury-status {
    border-color: #205b49;
    background: #12372d;
    color: #8bd5ba;
  }

  :global(html.dark) .purchase-treasury-status--warning {
    border-color: #8a5a12;
    background: #3a2a12;
    color: #f3d19c;
  }

  :global(html.dark) .purchase-simple-payment__field--amount input:disabled {
    background: #172033;
    color: #7b8796;
  }

  :global(html.dark) .purchase-payment-method-badge--track {
    border-color: #2d4770;
    background: #16243a;
    color: #8bb7ff;
  }

  :global(html.dark) .payment-currency-picker {
    border-color: var(--purchase-border);
  }

  :global(html.dark) .payment-currency-picker__btn:hover {
    background: #27354a;
  }

  :global(html.dark) .payment-currency-menu {
    border-color: var(--purchase-border);
    background: var(--purchase-surface);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .payment-currency-menu__item {
    color: #c8d3e2;
  }

  :global(html.dark) .payment-currency-menu__item:hover,
  :global(html.dark) .payment-currency-menu__item.selected {
    background: #1d2b40;
  }

  :global(html.dark) .purchase-payment-method {
    border-color: var(--purchase-border);
    background: var(--purchase-bg-soft);
    color: var(--purchase-text);
  }

  :global(html.dark) .purchase-payment-method:hover {
    border-color: #3b4d66;
    background: #1d293b;
  }

  :global(html.dark) .purchase-payment-method.is-active {
    border-color: #4d7fd8;
    background: #172944;
  }

  :global(html.dark) .purchase-actions {
    border-color: var(--purchase-border);
    background: rgba(17, 24, 39, 0.96);
    box-shadow:
      0 -8px 28px rgba(0, 0, 0, 0.2),
      0 8px 24px rgba(0, 0, 0, 0.22);
  }

  :global(html.dark) .purchase-action-button--draft {
    border-color: var(--purchase-border);
    background: var(--purchase-bg-soft);
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-action-button--draft:hover:not(:disabled) {
    border-color: #42546d;
    background: #202b3d;
    color: var(--purchase-text);
  }

  :global(html.dark) .purchase-modal-backdrop {
    background: rgba(2, 6, 15, 0.72);
  }

  :global(html.dark) .purchase-track-modal,
  :global(html.dark) .purchase-account-view-modal {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 28px 74px rgba(0, 0, 0, 0.5);
  }

  :global(html.dark) .purchase-track-header,
  :global(html.dark) .purchase-account-view-modal > header,
  :global(html.dark) .purchase-track-footer {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .purchase-track-heading h2,
  :global(html.dark) .purchase-account-view-modal > header h2,
  :global(html.dark) .purchase-track-account__copy strong {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .purchase-track-heading small,
  :global(html.dark) .purchase-track-account__copy small,
  :global(html.dark) .purchase-track-empty {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .purchase-track-close,
  :global(html.dark) .purchase-account-view-modal > header > button,
  :global(html.dark) .purchase-track-search,
  :global(html.dark) .purchase-track-account,
  :global(html.dark) .purchase-track-footer button {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-track-close:hover,
  :global(html.dark) .purchase-account-view-modal > header > button:hover,
  :global(html.dark) .purchase-track-account:hover {
    border-color: #42546d;
    background: #202b3d;
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .purchase-track-search input {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .purchase-track-search button {
    border-color: var(--erp-border, #2b3a4f);
    background: #1d2b40;
  }

  :global(html.dark) .purchase-account-view-body {
    background: var(--erp-bg, #0b1120);
  }

  .sale-customer-dropdown {
    z-index: 1200;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--z-border);
    border-radius: 12px;
    background: var(--z-surface);
    box-shadow: 0 18px 40px -14px rgba(11, 21, 48, 0.35);
  }

  .sale-customer-dropdown__search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    margin: 6px;
    padding: 0 9px;
    border: 1px solid var(--z-border-soft);
    border-radius: 8px;
    background: var(--z-surface-2);
    color: var(--z-muted);
  }

  .sale-customer-dropdown__search .ms {
    font-size: 17px;
  }

  .sale-customer-dropdown__search input {
    flex: 1;
    width: 0;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-family: inherit;
    font-size: 11.5px;
  }

  .sale-customer-dropdown__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: calc(var(--sale-cust-max, 220px) - 92px);
    overflow-y: auto;
    padding: 0 6px 6px;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .sale-customer-dropdown__list::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .sale-customer-dropdown__empty {
    padding: 10px;
    color: var(--z-muted);
    font-size: 12px;
    text-align: center;
  }

  .sale-customer-dropdown__new {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-top: 1px solid var(--z-border-soft);
    background: var(--z-surface-2);
    color: var(--z-link);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .sale-customer-dropdown__new .ms {
    font-size: 17px;
  }

  .sale-customer-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 4px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-ink);
    font-family: inherit;
    font-size: 12px;
    text-align: start;
    cursor: pointer;
  }

  .sale-customer-option:hover {
    background: var(--z-surface-2);
  }

  .sale-customer-option.is-active {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .sale-customer-option__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #2f6fed, #1b3a8a);
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
  }

  .sale-customer-option__copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .sale-customer-option__copy strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__copy small {
    overflow: hidden;
    color: var(--z-muted);
    font-size: 10.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-customer-option__bal {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    flex-shrink: 0;
    margin-inline-start: auto;
    color: var(--z-subtle);
    font-family: Inter, sans-serif;
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .sale-customer-option__bal.is-positive {
    color: var(--z-ok);
  }

  .sale-customer-option__bal.is-negative {
    color: var(--z-danger);
  }

  .sale-customer-option__bal small {
    font-size: 9.5px;
    font-weight: 700;
  }
  :global(html.dark) .sale-customer-dropdown {
    border-color: var(--z-border);
    background: var(--z-surface);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .sale-customer-option {
    color: var(--z-text);
  }

  :global(html.dark) .sale-customer-option:hover {
    background: #1d2b40;
  }

  :global(html.dark) .sale-customer-option__copy small {
    color: var(--z-muted);
  }

  /* ================================================================
     SaleNew.html reference design — cards, bill summary, mobile bar.
     Appended after the legacy block: later source order wins ties.
     Palette: app.css --z-* tokens (identical to the reference sheet).
     ================================================================ */

  /* ---- shared card shell ---- */
  .sf-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--z-border);
    border-radius: var(--z-r-xl, 14px);
    background: var(--z-surface);
    box-shadow:
      0 1px 2px rgba(11, 21, 48, 0.04),
      0 4px 14px -8px rgba(11, 21, 48, 0.1);
  }

  .sf-card__bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--z-border-soft);
  }

  .sf-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    color: var(--z-text);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .sf-back:hover {
    border-color: var(--z-border-strong);
    background: var(--z-surface-2);
    color: var(--z-ink);
  }

  .sf-bar-divider {
    width: 1px;
    height: 16px;
    flex-shrink: 0;
    background: var(--z-border);
  }

  .sf-bar-icon {
    flex-shrink: 0;
    color: var(--z-link);
    font-size: var(--z-fs-xl, 17px);
    line-height: 1;
  }

  .sf-card__title {
    margin: 0;
    flex-shrink: 0;
    color: var(--z-ink);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    line-height: 1.3;
  }

  /* ---- details grid ---- */
  .sf-dgrid {
    --sale-control-height: 30px;

    display: grid;
    grid-template-columns:
      minmax(0, 0.95fr) minmax(0, 0.9fr) minmax(0, 1.9fr) minmax(0, 1.3fr);
    gap: 8px;
    align-items: start;
    padding: 8px 12px 10px;
  }

  .sf-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .sf-field-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--z-text);
    font-size: var(--z-fs-xs, 10.5px);
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
  }

  .sf-field-label em {
    color: var(--z-subtle);
    font-size: 10px;
    font-style: normal;
    font-weight: 500;
  }

  .sf-field--bill .sf-field-label em {
    margin-inline-start: auto;
  }

  .sf-field--description {
    grid-column: span 3;
  }

  .sf-field--description-full {
    grid-column: 1 / -1;
  }

  /* ---- readonly bill number ---- */
  .sf-readonly-field {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 9px;
    border: 1px solid var(--z-border);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface-2);
    box-sizing: border-box;
  }

  .sf-readonly-field__hash {
    color: var(--z-subtle);
    font-size: 12px;
    font-weight: 800;
  }

  .sf-readonly-field__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-readonly-field i {
    flex-shrink: 0;
    color: var(--z-subtle);
    font-size: 11px;
  }

  .sf-app-datepicker :global(.app-date-field) {
    gap: 0;
  }

  .sf-app-datepicker :global(.app-date-field input) {
    height: 30px !important;
    min-height: 30px !important;
    padding-inline: 8px !important;
    border: 1px solid var(--z-border) !important;
    border-radius: 7px !important;
    background: var(--z-surface) !important;
    color: var(--z-ink) !important;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sf-app-datepicker :global(.app-date-field input:focus) {
    border-color: var(--z-brand-300) !important;
    box-shadow: var(--z-ring) !important;
  }

  /* customer box — avatar initial · name · balance · chevron | add */
  .sf-custbox {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 30px;
    min-width: 0;
    padding-inline-end: 3px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-custbox:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-custbox__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-inline-start: 5px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #2f6fed, #1b3a8a);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .sf-custbox__main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .sf-custbox__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink);
    font-size: 11.5px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-custbox__bal {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    flex-shrink: 0;
    color: var(--z-subtle);
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
  }

  .sf-custbox__bal > .sf-custbox__bal-amount {
    font-family: Inter, sans-serif;
    font-variant-numeric: tabular-nums;
  }

  .sf-custbox__bal.is-positive {
    color: var(--z-ok);
  }

  .sf-custbox__bal.is-negative {
    color: var(--z-danger);
  }

  .sf-custbox__bal small {
    font-size: 9.5px;
    font-weight: 700;
  }

  .sf-custbox__chev {
    flex-shrink: 0;
    margin-inline-start: auto;
    color: var(--z-muted);
    font-size: 15px;
    line-height: 1;
  }

  .sf-custbox__person {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    margin-inline-start: 5px;
    flex-shrink: 0;
    color: var(--z-muted);
  }

  .sf-custbox__input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    min-height: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-size: 11.5px;
    font-weight: 700;
  }

  .sf-custbox__input::placeholder {
    color: var(--z-subtle);
    font-weight: 500;
  }

  .sf-custbox__divider {
    width: 1px;
    height: 18px;
    flex-shrink: 0;
    background: var(--z-border);
  }

  .sf-custbox__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    cursor: pointer;
  }

  .sf-custbox__add:hover {
    background: var(--z-brand-100, var(--z-brand-soft));
  }

  /* currency + rate in one box (details card) */
  .sf-curbox {
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: 30px;
    overflow: hidden;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-curbox:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-curbox.is-open {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-curbox__cur {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 1 auto;
    min-width: 0;
    height: 28px;
    padding: 0 4px;
    padding-inline-start: 8px;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .sf-curbox__cur:hover {
    background: var(--z-brand-soft);
  }

  .sf-curbox__sym {
    max-width: 84px;
    overflow: hidden;
    color: var(--z-link);
    font-family: Inter, sans-serif;
    font-size: 12.5px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-curbox__cur .ms {
    color: var(--z-muted);
    font-size: 14px;
  }

  .sf-curbox__divider {
    width: 1px;
    flex-shrink: 0;
    background: var(--z-border);
  }

  .sf-curbox__rate {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 6px;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .sf-curbox__rate:hover {
    background: var(--z-brand-soft);
  }

  .sf-curbox__rate .ms {
    color: var(--z-muted);
    font-size: 14px;
  }

  .sf-curbox__rate-value {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    border-radius: 5px;
    background: var(--z-surface-3);
    color: var(--z-ink);
    font-family: Inter, sans-serif;
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
  }

  /* currency dropdown — SaleNew.html «ارز» menu */
  .sf-cumenu {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-start: 0;
    z-index: 31;
    width: 248px;
    max-width: calc(100vw - 24px);
    overflow: hidden;
    border: 1px solid var(--z-border);
    border-radius: 12px;
    background: var(--z-surface);
    box-shadow: 0 18px 40px -14px rgba(11, 21, 48, 0.35);
  }

  .sf-cumenu__search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin: 6px;
    padding: 0 9px;
    border: 1px solid var(--z-border-soft);
    border-radius: 8px;
    background: var(--z-surface-2);
    color: var(--z-muted);
  }

  .sf-cumenu__search .ms {
    font-size: 16px;
  }

  .sf-cumenu__search input {
    flex: 1;
    width: 0;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-family: inherit;
    font-size: 11.5px;
  }

  .sf-cumenu__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 220px;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

  .sf-cumenu__opt {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--z-ink);
    font-family: inherit;
    font-size: 12px;
    text-align: start;
    cursor: pointer;
  }

  .sf-cumenu__opt:hover {
    background: var(--z-surface-2);
  }

  .sf-cumenu__opt.is-active {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .sf-cumenu__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    padding: 0;
    border-radius: 8px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-family: Inter, sans-serif;
    font-size: 12px;
    font-weight: 800;
    box-sizing: border-box;
  }

  .sf-cumenu__opt.is-base .sf-cumenu__chip {
    background: var(--z-surface-3);
    color: var(--z-muted);
  }

  .sf-cumenu__cpy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  .sf-cumenu__name {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-cumenu__opt.is-active .sf-cumenu__name {
    color: var(--z-link);
    font-weight: 700;
  }

  .sf-cumenu__rate {
    color: var(--z-muted);
    font-family: Inter, sans-serif;
    font-size: 10px;
    font-weight: 500;
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .sf-cumenu__code {
    color: var(--z-subtle);
    font-family: Inter, sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .sf-cumenu__check {
    color: var(--z-link);
    font-size: 17px;
    visibility: hidden;
  }

  .sf-cumenu__opt.is-active .sf-cumenu__check {
    visibility: visible;
  }

  /* rate editor — floating card from SaleNew.html «نرخ تبادله» */
  .sf-field--currency {
    position: relative;
  }

  .sf-ratebox {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-end: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 260px;
    max-width: calc(100vw - 24px);
    padding: 10px;
    border: 1px solid var(--z-border);
    border-radius: 12px;
    background: var(--z-surface);
    box-shadow: 0 18px 40px -14px rgba(11, 21, 48, 0.35);
    box-sizing: border-box;
  }

  .sf-ratebox__title {
    color: var(--z-ink);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.3;
  }

  .sf-ratebox__row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 3px 0 8px;
    padding-inline-start: 8px;
    padding-inline-end: 3px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-ratebox__lead {
    flex-shrink: 0;
    color: var(--z-ink);
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
  }

  .sf-ratebox__row.is-edited {
    border-color: var(--z-warn);
  }

  .sf-ratebox__op {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font-family: Inter, sans-serif;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .sf-ratebox__op.is-div {
    background: var(--z-warn-soft);
    color: var(--z-warn);
  }

  .sf-ratebox__op:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .sf-ratebox__input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-family: Inter, sans-serif;
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .sf-ratebox__head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .sf-ratebox__tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 2px;
    margin-inline-start: auto;
  }

  .sf-ratebox__tab {
    height: 20px;
    min-width: 22px;
    padding: 0 5px;
    border: 1px solid var(--z-border);
    border-radius: 5px;
    background: var(--z-surface);
    color: var(--z-muted);
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .sf-ratebox__tab.is-active {
    border-color: var(--z-ink);
    background: var(--z-ink);
    color: var(--z-surface);
  }

  .sf-ratebox__tab:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .sf-ratebox__hint {
    display: flex;
    gap: 5px;
    color: var(--z-muted);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .sf-ratebox__hint .ms {
    flex-shrink: 0;
    font-size: 13px;
    line-height: 1.2;
  }

  .sf-ratebox__actions {
    display: flex;
    gap: 6px;
  }

  .sf-ratebox__cancel,
  .sf-ratebox__save {
    flex: 1 1 0;
    height: 28px;
    border-radius: 7px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .sf-ratebox__cancel {
    border: 1px solid var(--z-border);
    background: var(--z-surface);
    color: var(--z-text);
    font-weight: 600;
  }

  .sf-ratebox__save {
    border: 0;
    background: #2f6fed;
    color: #fff;
    font-weight: 700;
  }

  .sf-ratebox__cancel:disabled,
  .sf-ratebox__save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /*
   * description (details card) — SaleNew.html note box: the icon and a
   * two-line textarea sit in a content-driven box the user can drag
   * taller, instead of a fixed 30px control row.
   */
  .sf-notebox {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 7px 4px 4px 9px;
    padding-inline-start: 9px;
    padding-inline-end: 4px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-notebox:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-notebox__icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--z-muted);
    font-size: 15px;
    line-height: 1;
  }

  .sf-notebox textarea {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 34px;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: 11.5px;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
  }

  .sf-notebox textarea::placeholder {
    color: var(--z-subtle);
  }

  .sf-field--description :global(.sale-rich-editor) {
    border: 1px solid var(--z-border);
    border-radius: 7px;
  }

  /* ---- items card ---- */

  /* strip the nested card chrome — the sf-items card provides it */
  .sf-items__table :global(.purchase-items-card.purchase-items-card) {
    z-index: auto;
    margin-top: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  /* ---- bill summary ---- */
  .sf-sum {
    --sale-control-height: 34px;

    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    min-width: 0;
    border: 1px solid var(--z-border);
    border-radius: var(--z-r-xl, 14px);
    background: var(--z-surface);
    box-shadow:
      0 1px 2px rgba(11, 21, 48, 0.04),
      0 4px 14px -8px rgba(11, 21, 48, 0.1);
  }

  .sf-sum.is-invalid {
    border-color: var(--z-danger);
  }

  .sf-sum__cell {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 10px 12px;
  }

  .sf-sum__pay {
    border-inline-start: 1px solid var(--z-border-soft);
  }

  .sf-sum__title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--z-ink);
    font-size: 12px;
    font-weight: 800;
  }

  .sf-sum__title i {
    color: var(--z-link);
    font-size: 15px;
  }

  .sf-sum__pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .sf-sum__field,
  .sf-sum__note {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .sf-sum__label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    color: var(--z-text);
    font-size: var(--z-fs-xs, 10.5px);
    font-weight: 700;
    white-space: nowrap;
  }

  /* what a percentage discount is worth in money, right where it is typed */
  .sf-sum__calc {
    color: var(--z-ok);
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .sf-sum__label--received {
    margin-bottom: -2px;
  }

  .sf-sum__box {
    display: flex;
    align-items: center;
    height: 28px;
    padding-inline-end: 3px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-sum__box:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-sum__box > i {
    flex-shrink: 0;
    padding-inline-start: 8px;
    color: var(--z-muted);
    font-size: 14px;
  }

  .sf-sum__box input {
    flex: 1 1 auto;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .sf-sum__suffix {
    flex-shrink: 0;
    padding: 0 9px;
    border-inline-start: 1px solid var(--z-border-soft);
    color: var(--z-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .sf-sum__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    min-width: 32px;
    flex-shrink: 0;
    margin-inline-end: 1px;
    padding: 0 7px;
    border: 1px solid var(--z-border-strong);
    border-radius: 6px;
    background: var(--z-surface);
    color: var(--z-link);
    font: inherit;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .sf-sum__toggle:hover,
  .sf-sum__toggle.is-active {
    background: var(--z-brand-soft);
  }

  .sf-sum__notebox {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 9px;
    border: 1px solid var(--z-border);
    border-radius: 7px;
    background: var(--z-surface);
    box-sizing: border-box;
  }

  .sf-sum__notebox:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-sum__notebox > i {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--z-muted);
    font-size: 14px;
  }

  .sf-sum__notebox textarea {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    height: 36px;
    min-height: 36px;
    padding: 0;
    border: 0;
    outline: 0;
    resize: vertical;
    background: transparent;
    color: var(--z-ink);
    font: inherit;
    font-size: var(--z-fs-sm, 11.5px);
    line-height: 1.55;
  }

  /* dark gradient payable bar */
  .sf-totalbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 9px;
    background: linear-gradient(135deg, #0b1530 0%, #1b3a8a 100%);
    color: #ffffff;
    box-sizing: border-box;
  }

  .sf-totalbar__label {
    min-width: 0;
    color: #e0ebff;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }

  .sf-totalbar__amount {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    white-space: nowrap;
  }

  .sf-totalbar__amount b {
    color: #ffffff;
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sf-totalbar__amount small {
    color: #e0ebff;
    font-size: 11px;
    font-weight: 600;
  }

  /* received money row */
  .sf-paycur {
    color: var(--z-link);
    font-family: Inter, sans-serif;
    font-size: 12.5px;
    font-weight: 800;
  }

  .sf-payrow {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .sf-payrow .payment-composite-control {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
    border: 1px solid var(--z-border);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface);
    overflow: visible;
  }

  .sf-payrow .payment-composite-control:focus-within {
    border-color: var(--z-brand-300);
    box-shadow: var(--z-ring);
  }

  .sf-payrow .payment-amount-currency-control {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
  }

  .sf-payrow .payment-amount-currency-control > input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-size: 13.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .sf-paydiv {
    flex: 0 0 auto;
    width: 1px;
    height: 16px;
    background: var(--z-border);
  }

  .sf-payrow .payment-currency-picker {
    border-inline-start: 0;
    background: transparent;
  }

  .sf-payrow .sale-simple-payment__currency {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    align-self: stretch;
  }

  /* the payment picker reuses the «ارز» panel, anchored to the field itself */
  .sf-payrow .sf-cumenu {
    inset-inline-start: auto;
    inset-inline-end: 0;
    z-index: 1300;
    width: 240px;
  }

  .sf-payrow .sf-cumenu__opt.is-active .sf-cumenu__chip {
    background: var(--z-surface);
    color: var(--z-link);
  }

  /*
   * the sale «نرخ تبادله» card, anchored to the payment currency picker.
   * The payment row sits at the bottom of the bill summary, so the card
   * opens upwards to stay inside the page instead of under the action bar.
   */
  .sf-payrow .sf-ratebox {
    top: auto;
    bottom: calc(100% + 6px);
    z-index: 1300;
  }

  .sf-payrow .sale-simple-payment__currency > .payment-currency-picker__main,
  .sf-payrow .payment-currency-picker__main {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 1px;
    align-self: stretch;
    height: auto;
    min-width: 0;
    margin: 2px;
    padding: 0 3px 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink);
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .sf-payrow .payment-currency-picker__main:hover {
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .sf-payrow .payment-currency-picker__main .ms {
    font-size: 14px;
    color: var(--z-muted);
  }

  .sf-full {
    height: 30px;
    flex-shrink: 0;
    padding: 0 10px;
    border: 1px solid var(--z-border-strong);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-brand-soft);
    color: var(--z-link);
    font: inherit;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .sf-full:hover {
    border-color: var(--z-brand-300);
    background: var(--z-brand-300);
    color: #ffffff;
  }

  /* account: wide chip (active) + 30px wallet button, as in SaleNew */
  .sf-acct {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .sf-acct__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 0 0 30px;
    width: 30px;
    min-width: 0;
    height: 30px;
    padding: 0;
    border: 1px solid var(--z-border-strong);
    border-radius: 8px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    order: 1;
  }

  .sf-acct__btn .ms {
    flex-shrink: 0;
    font-size: 17px;
  }

  .sf-acct__btn:hover {
    border-color: var(--z-brand-300);
    background: var(--z-brand-300);
    color: #ffffff;
  }

  .sf-acct__btn.is-wide {
    order: 0;
    flex: 1 1 auto;
    width: auto;
    justify-content: flex-start;
    padding: 0 10px;
    border-color: var(--z-border-soft);
    background: var(--z-surface-2);
    color: var(--z-ink);
  }

  .sf-acct__btn.is-wide:hover {
    border-color: var(--z-border-strong);
    background: var(--z-surface-3);
    color: var(--z-ink);
  }

  .sf-acct__btn.is-wide .ms {
    font-size: 15px;
    color: var(--z-muted);
  }

  .sf-acct__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-acct__bal {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--z-muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sf-acct__bal > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* actions */
  .sf-actions {
    display: flex;
    gap: 8px;
  }

  .sf-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    font: inherit;
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .sf-action:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .sf-action--draft {
    flex: 0 0 auto;
    border: 1px solid var(--z-border-strong);
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .sf-action--draft i {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 7px;
    background: var(--z-surface);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.1);
    font-size: 15px;
  }

  .sf-action--confirm {
    flex: 1 1 auto;
    gap: 6px;
    border: 0;
    background: var(--z-brand);
    color: #ffffff;
    font-weight: 800;
  }

  /* mobile bottom bar */
  .sf-mobilebar {
    display: none;
  }

  /* ---- responsive ---- */
  @media (max-width: 1100px) {
    .sf-dgrid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .sf-field--description,
    .sf-field--description-full {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 991px) {
    .sf-sum {
      grid-template-columns: minmax(0, 1fr);
    }

    .sf-sum__pay {
      border-inline-start: 0;
      border-top: 1px solid var(--z-border-soft);
    }
  }

  @media (max-width: 575px) {
    .sf-dgrid {
      grid-template-columns: minmax(0, 1fr);
    }

    .sf-field--description,
    .sf-field--description-full {
      grid-column: 1 / -1;
    }

    .sf-card__bar {
      flex-wrap: wrap;
    }

    .sf-head-visitor {
      width: 100%;
    }

    .sf-head-visitor :global(.filter-select) {
      width: 100%;
    }

    .sf-sum__pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 767px) {
    .sale-create-page {
      padding-bottom: 5.5rem;
    }

    .sf-mobilebar {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 900;
      align-items: center;
      gap: 10px;
      padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--z-border);
      background: var(--z-surface);
      box-shadow: 0 -6px 18px rgba(11, 21, 48, 0.08);
    }

    .sf-mobilebar__total {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      line-height: 1.25;
    }

    .sf-mobilebar__total small {
      color: var(--z-muted);
      font-size: 11px;
    }

    .sf-mobilebar__total b {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
      color: var(--z-ink);
      font-size: 17px;
      font-weight: 800;
      white-space: nowrap;
    }

    .sf-mobilebar__total b span {
      overflow: hidden;
      font-variant-numeric: tabular-nums;
      text-overflow: ellipsis;
    }

    .sf-mobilebar__total em {
      color: var(--z-muted);
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
    }

    .sf-mobilebar__draft {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      padding: 0;
      border: 1px solid var(--z-border);
      border-radius: 12px;
      background: var(--z-surface);
      color: var(--z-text);
      font-size: 19px;
      cursor: pointer;
    }

    .sf-mobilebar__draft:disabled {
      opacity: 0.6;
    }

    .sf-mobilebar__confirm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 44px;
      flex-shrink: 0;
      padding: 0 18px;
      border: 0;
      border-radius: 12px;
      background: var(--z-brand);
      color: #ffffff;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
    }

    .sf-mobilebar__confirm:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
  }

  /* ---- Material Symbols sizing (SaleNew.html glyph parity) ---- */
  .sf-back .ms {
    font-size: 17px;
  }

  .sale-customer-input__icon .ms {
    font-size: 15px;
  }

  .sale-add-customer .ms {
    font-size: 15px;
  }

  .payment-currency-picker__main .ms {
    font-size: 12px;
  }

  .sf-mobilebar__confirm .ms {
    font-size: 18px;
  }

  /* track / account-view modal glyphs */
  .sale-track-heading > span .ms,
  .sale-account-view-modal > header > div > span .ms {
    font-size: 17px;
  }

  .sale-track-search > i {
    font-size: 15px;
  }

  .sale-track-search button .ms {
    font-size: 15px;
  }

  .sale-track-close .ms,
  .sale-account-view-modal > header > button .ms {
    font-size: 15px;
  }

  .sale-track-account__icon .ms {
    font-size: 15px;
  }

  .sale-track-footer button .ms {
    font-size: 13px;
  }

  .sf-custbox__person .ms,
  .sf-custbox__add .ms {
    font-size: 15px;
  }

  /* visitor chip in the details header (SaleNew.html) */
  .sf-head-visitor {
    flex-shrink: 0;
    margin-inline-start: auto;
    min-width: 0;
  }

  .sf-head-visitor :global(.filter-select) {
    width: auto;
  }

  .sf-head-visitor :global(.filter-select__trigger) {
    height: 26px;
    min-height: 26px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .sf-head-visitor:not(.has-value) :global(.filter-select__trigger) {
    border-style: dashed;
    border-color: var(--z-border-strong);
    background: transparent;
    color: var(--z-muted);
  }

  .sf-head-visitor.has-value :global(.filter-select__trigger) {
    border-color: var(--z-border-strong);
    background: var(--z-brand-soft);
    color: var(--z-link);
  }

  .sf-head-visitor :global(.filter-select__value) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sf-head-visitor :global(.filter-select__value)::before {
    content: 'person_add_alt';
    font-family: 'Material Symbols Rounded';
    font-size: 15px;
    font-weight: 400;
    line-height: 1;
  }

  .sf-head-visitor.has-value :global(.filter-select__value)::before {
    content: 'badge';
  }

  .sf-head-visitor :global(.filter-select__caret) {
    font-size: 14px;
  }

  /* dark theme: --z tokens already flip; a few legacy classes need a nudge */
  :global(html.dark) .sf-payrow .payment-currency-picker__main {
    background: transparent;
    color: var(--z-text);
  }

  /* ================================================================
     Purchase adapters — the sale form design system above, fitted to
     the purchase fields. The details grid runs date · bill · supplier ·
     currency, the same order and column weights as the sale form, so it
     reuses the shared .sf-dgrid rules unchanged. The warehouse lives in
     the items header.
     ================================================================ */
  .sf-reqnote {
    display: inline-flex;
    align-items: center;
    margin-inline-start: auto;
    color: var(--z-danger);
    font-size: 11px;
    font-weight: 700;
  }

  .sf-reqnote .ms {
    font-size: 11px;
  }

  /* no rate column beside it: the button owns the whole box */
  .sf-curbox--solo .sf-curbox__cur {
    flex: 1 1 auto;
    justify-content: space-between;
  }

  /*
   * Currency is the last grid column, so the shared rule (anchored to the
   * field's inline-start edge) pushed the panel out of the card. Anchor it
   * to the opposite edge so it always opens inwards, in both directions.
   */
  .sf-field--currency .sf-cumenu {
    inset-inline-start: auto;
    inset-inline-end: 0;
  }

  /* pencil that opens the payment exchange-rate editor */
  .sf-rateedit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    margin-inline-start: 2px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--z-brand-soft);
    color: var(--z-link);
    cursor: pointer;
  }

  .sf-rateedit:hover {
    background: var(--z-brand-300);
    color: #ffffff;
  }

  /* the card is open: the pencil keeps the pressed look */
  .sf-rateedit.is-open {
    background: var(--z-brand-300);
    color: #ffffff;
  }

  .sf-rateedit .ms {
    font-size: 14px;
  }

  .sf-payrow .purchase-simple-payment__currency {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    align-self: stretch;
    /* the legacy mobile rule stretched this to full width */
    width: auto;
    border-top: 0;
  }

  .sf-payrow .purchase-simple-payment__currency > .payment-currency-picker__main {
    flex: 0 0 auto;
    min-height: 0;
  }

  .sf-payrow .payment-amount-currency-control > input {
    min-height: 0;
  }

  /* the inline exchange-rate editor swaps in for the amount field */
  .sf-payrow .purchase-exchange-editor {
    min-height: 0;
    background: transparent;
  }

  .sf-payrow .purchase-exchange-editor > span {
    border-inline-end-color: var(--z-border-soft);
    background: var(--z-surface-2);
    color: var(--z-muted);
    font-size: 10px;
  }

  .sf-payrow .purchase-exchange-editor > input {
    flex: 1 1 4rem;
    width: auto;
    min-width: 3.5rem;
    height: 100%;
    padding-inline: 6px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  /* both summary cells keep the same height so the divider runs full */
  .sf-sum--purchase {
    align-items: stretch;
  }

  /* treasury-balance warning under the account chips */
  .sf-alert {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--z-warn);
    border-radius: 8px;
    background: var(--z-warn-soft);
    color: var(--z-warn);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
  }

  .sf-alert .ms {
    flex-shrink: 0;
    font-size: 15px;
  }

  .sf-alert span {
    min-width: 0;
  }

</style>
