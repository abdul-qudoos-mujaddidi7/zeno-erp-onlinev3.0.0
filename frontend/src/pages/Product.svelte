<script>
  import { onMount,tick } from 'svelte';
import { productImageApi } from '../api/productImageApi.js';
import { productUnitApi } from '../api/productUnitApi.js';
  import { productApi } from '../api/productApi.js';
  import { productCategoryApi } from '../api/productCategoryApi.js';
  import { productBrandApi } from '../api/productBrandApi.js';
  import { productGenericApi } from '../api/productGenericApi.js';
import { stockBatchApi } from '../api/stockBatchApi.js';
import { saleApi } from '../api/saleApi.js';
import { purchaseApi } from '../api/purchaseApi.js';
  import {
    convertUnitSync,
    ensureProductUnitsLoaded,
    calculateProductStock,
    resolveInventoryMethod,
  } from './stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type,shortID,settings_all } from '../i18n/i18n';
  import ProductTransactionHistory from './products/ProductTransactionHistory.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import {push} from 'svelte-spa-router';
  import { getCachedImage, cacheImage } from './products/imageCache.js';
  import { DEFAULT_PAGE_SIZE } from '../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { generatePDF } from './generatePDF.js';
  import { generateExcel } from './generateExcel.js';
  import ExportMenu from '../components/common/ExportMenu.svelte';

  import { showDate, setDatePickers } from '../calendar.js';
  let generatingPDF = false;


  export let id;
  export let page = 'overview';

  let activeTab = page || 'overview';
  $: if (page && page !== activeTab) {
    activeTab = page;
    if (page === 'report') {
      setTimeout(() => setDatePickers(handleDateChange), 200);
    }
  }

  function setActiveTab(tabId) {
    activeTab = tabId;
    push(`/dashboard/product/${id}/${tabId}`);
    if (tabId === 'report') {
      setTimeout(() => setDatePickers(handleDateChange), 200);
    }
  }

  function goEdit() {
    if (product?.id) push(`/dashboard/product-form/${product.id}`);
  }

  async function getProductByRouteId(routeId) {
    if (routeId == null || routeId === '') return null;

    const productRes = await productApi.getById(routeId).catch(() => null);
    const row = productRes?.data || null;

    return row && Number(row.status) === 1 ? row : null;
  }

  async function fetchRowsByIds(getAll, ids) {
    const unique = [
      ...new Set(
        (ids || [])
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      ),
    ];

    if (!unique.length) return [];

    const chunkSize = 80;
    const chunks = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
      chunks.push(unique.slice(i, i + chunkSize));
    }

    const pages = await Promise.all(
      chunks.map((chunk) =>
        getAll({ status: 1, ids: chunk.join(',') })
          .then((response) => response?.data || [])
          .catch(() => []),
      ),
    );

    return pages.flat();
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function getProductGroupKey(product) {
    return [
      String(product?.name || '').trim().toLowerCase(),
      product?.category_id || '',
      product?.product_unit_id || '',
    ].join('|');
  }

  function getProductBatchValue(product) {
    return String(product?.batch || product?.batch_number || '').trim();
  }

  function getProductGroupRepresentative(group, baseProduct) {
    const sortedGroup = [...group].sort((first, second) => {
      const firstCreated = new Date(first.created_at || 0).getTime();
      const secondCreated = new Date(second.created_at || 0).getTime();
      if (firstCreated !== secondCreated) return firstCreated - secondCreated;
      return Number(first.id || 0) - Number(second.id || 0);
    });

    return (
      sortedGroup.find((item) => Number(item.id) === Number(baseProduct?.id)) ||
      sortedGroup.find((item) => !getProductBatchValue(item)) ||
      sortedGroup[0] ||
      baseProduct
    );
  }

  function aggregateProductGroup(group, baseProduct) {
    const rows = group.length ? group : [baseProduct].filter(Boolean);
    const representative = getProductGroupRepresentative(rows, baseProduct);
    const totalQuantity = rows.reduce((sum, row) => sum + toNumber(row.quantity), 0);
    const nearestExpiryDate =
      rows
        .map((row) => row.expiry_date)
        .filter(Boolean)
        .sort((first, second) => new Date(first).getTime() - new Date(second).getTime())[0] || representative?.expiry_date;

    return {
      ...representative,
      quantity: totalQuantity,
      expiry_date: nearestExpiryDate || null,
      product_group_key: getProductGroupKey(representative),
      product_group_ids: rows.map((row) => row.id),
      batch_count: rows.filter((row) => getProductBatchValue(row)).length,
      variant_count: rows.length,
    };
  }

  
  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions;


  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;

  import { resolveMediaUrl } from '../lib/mediaUrl.js';
import { currencyApi } from '../api/currencyApi.js';
import { warehouseApi } from '../api/warehouseApi.js';
import { warehouseProductApi } from '../api/warehouseProductApi.js';
import { accountApi } from '../api/accountApi.js';
import { stockTransactionApi } from '../api/stockTransactionApi.js';
  let myThumbnailUrl = null;
  let myImageUrl = null;
  let units = [];
  let brands = [];
  let generics = [];
  let warehouses = [];
  let warehouse_products = [];
  let productGroupProducts = [];
  let productGroupIds = [];
  let productBatchDetails = [];
  let product = null;
  let loading = true;
  let reportLoading = true;
  let category = null;
  let unit = null;
  let brand = null;
  let generic = null;
  let stockTransactions = [];
  let fromDate = "";
  let toDate = "";
  let currencies = [];
  let inventoryMethod = null;

  let editTransactionModal;
  let searchTerm = '';
  let filterStatus = 'all';
  let filterType = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let warehouseCurrentPage = 1;
  let warehouseItemsPerPage = 10;
  // Running-balance reports are always displayed newest first.
  // The balance itself is still calculated oldest -> newest.
  let sortColumn = 'date';
  let sortDirection = 'desc';
  let showReportStats = false;

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
  /*
   * Do not allow sorting a running-balance report by ID, type, or another
   * non-chronological field. Doing that separates each transaction from the
   * balance that was calculated for its real historical position.
   *
   * We intentionally keep the newest transaction at the top.
   */
  function setSort() {
    sortColumn = 'date';
    sortDirection = 'desc';
    currentPage = 1;
  }

  function validTransactionDate(value) {
    if (value === null || value === undefined || value === '') return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function compareStableTransactionIds(firstId, secondId) {
    const firstValue = String(firstId ?? '').trim();
    const secondValue = String(secondId ?? '').trim();

    if (/^\d+$/.test(firstValue) && /^\d+$/.test(secondValue)) {
      try {
        const firstBigInt = BigInt(firstValue);
        const secondBigInt = BigInt(secondValue);

        if (firstBigInt < secondBigInt) return -1;
        if (firstBigInt > secondBigInt) return 1;
        return 0;
      } catch (error) {
        // Fall through to a stable string comparison.
      }
    }

    return firstValue.localeCompare(secondValue, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }

  function startOfBusinessDay(value) {
    const parsed = validTransactionDate(value);
    if (!parsed) return 0;

    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    ).getTime();
  }

  /*
   * Use the source document creation time whenever possible.
   * stock_transactions.created_at may be recreated by sync/recalculation and
   * therefore may not represent the real purchase/sale sequence.
   */
  function transactionSourceTime(transaction) {
    return (
      validTransactionDate(transaction?.source_created_at)?.getTime() ??
      validTransactionDate(transaction?.created_at)?.getTime() ??
      validTransactionDate(transaction?.updated_at)?.getTime() ??
      0
    );
  }

  /*
   * Opening stock is only the earliest product-create movement
   * (manual_adjustment + adjustment_in, reference_id = product_id).
   * Later incoming adjustments stay in date order so their quantity
   * is not added onto the opening row's running balance.
   */
  let openingTransactionIds = new Set();

  function isOpeningCandidate(transaction) {
    return (
      String(transaction?.transaction_type || '') === 'adjustment_in' &&
      String(transaction?.reference_type || '') === 'manual_adjustment' &&
      String(transaction?.reference_id ?? '').trim() !== '' &&
      String(transaction?.reference_id) === String(transaction?.product_id)
    );
  }

  function collectOpeningIds(transactions) {
    const earliestByProduct = new Map();

    for (const transaction of transactions) {
      if (!isOpeningCandidate(transaction)) continue;

      const productId = String(transaction.product_id ?? '');
      if (!productId) continue;

      const current = earliestByProduct.get(productId);
      if (!current) {
        earliestByProduct.set(productId, transaction);
        continue;
      }

      const currentDay = startOfBusinessDay(
        current.date || current.created_at || current.updated_at,
      );
      const nextDay = startOfBusinessDay(
        transaction.date || transaction.created_at || transaction.updated_at,
      );

      if (nextDay < currentDay) {
        earliestByProduct.set(productId, transaction);
        continue;
      }

      if (
        nextDay === currentDay &&
        compareStableTransactionIds(transaction.id, current.id) < 0
      ) {
        earliestByProduct.set(productId, transaction);
      }
    }

    return new Set(
      [...earliestByProduct.values()].map((row) => String(row.id)),
    );
  }

  function isOpeningInputAdjustment(transaction) {
    return openingTransactionIds.has(String(transaction?.id ?? ''));
  }

  /*
   * Calculate balances oldest -> newest.
   * For transactions on the same business day, use the original source
   * document's creation time (sale, purchase, or initial product adjustment).
   */
  function compareTransactionsChronologically(first, second) {
    const firstIsOpening = isOpeningInputAdjustment(first);
    const secondIsOpening = isOpeningInputAdjustment(second);

    /*
     * Force opening stock to the beginning of the calculation.
     * Do this before comparing dates because synced records may all have
     * the same date or an incorrect created_at order.
     */
    if (firstIsOpening !== secondIsOpening) {
      return firstIsOpening ? -1 : 1;
    }

    const firstBusinessDay = startOfBusinessDay(
      first?.date ||
        first?.source_created_at ||
        first?.created_at ||
        first?.updated_at,
    );

    const secondBusinessDay = startOfBusinessDay(
      second?.date ||
        second?.source_created_at ||
        second?.created_at ||
        second?.updated_at,
    );

    if (firstBusinessDay !== secondBusinessDay) {
      return firstBusinessDay - secondBusinessDay;
    }

    const firstSourceTime = transactionSourceTime(first);
    const secondSourceTime = transactionSourceTime(second);

    if (firstSourceTime !== secondSourceTime) {
      return firstSourceTime - secondSourceTime;
    }

    const sourceIdComparison = compareStableTransactionIds(
      first?.source_sort_id,
      second?.source_sort_id,
    );

    if (sourceIdComparison !== 0) {
      return sourceIdComparison;
    }

    return compareStableTransactionIds(first?.id, second?.id);
  }
  let availableTypes = {};
  let fromDateInput = null;
  let toDateInput = null;
  $: filteredTransactions = (() => {
    let result = stockTransactions.slice();
    result = result.filter((s) => {
      const invoiceDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's sales
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    });
    if (filterStatus !== 'all') {
      result = result.filter((t) => t.status === filterStatus);
    }
    availableTypes = {};
    result.forEach(t=>{
      availableTypes[t.transaction_type] = availableTypes[t.transaction_type]?Number(availableTypes[t.transaction_type])+1:1;
    });
    if (filterType !== 'all') {
      result = result.filter((t) => t.transaction_type === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          (t.reference_number && String(t.reference_number).toLowerCase().includes(term)) ||
          (t.description && t.description.toLowerCase().includes(term)) ||
          (t.id && String(t.id).includes(term)),
      );
    }

    /*
     * Never calculate or re-sort the report here. loadStockTransactions()
     * already assigns a fixed historical index after calculating every
     * running balance. A larger index means a newer transaction.
     */
    result = result.sort((first, second) => {
      const firstIsOpening = isOpeningInputAdjustment(first);
      const secondIsOpening = isOpeningInputAdjustment(second);

      /* Keep only the designated opening row at the bottom of the report. */
      if (firstIsOpening !== secondIsOpening) {
        return firstIsOpening ? 1 : -1;
      }

      return (
        Number(second._historicalIndex ?? -1) -
        Number(first._historicalIndex ?? -1)
      );
    });

    return result;
  })();

  $: reportToolbarFilters = [
    {
      key: 'type',
      label: t('Type'),
      value: filterType,
      icon: 'bi-arrow-left-right',
      options: [
        { value: 'all', label: t('All Types') },
        ...Object.entries(availableTypes).map(([type, count]) => ({
          value: type,
          label: `${t(type)} (${count})`,
        })),
      ],
    },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleReportToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterType = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }

  function resetReportFilters() {
    searchTerm = '';
    filterStatus = 'all';
    filterType = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  $: paginatedTransactions = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredTransactions.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  $: if (currentPage > (totalPages || 1)) currentPage = totalPages || 1;

  $: warehouseTotalPages = Math.ceil(warehouse_products.length / warehouseItemsPerPage) || 1;
  $: paginatedWarehouseProducts = warehouse_products.slice(
    (warehouseCurrentPage - 1) * warehouseItemsPerPage,
    warehouseCurrentPage * warehouseItemsPerPage,
  );
  $: if (warehouseCurrentPage > warehouseTotalPages) warehouseCurrentPage = warehouseTotalPages;

  $: if (searchTerm || filterStatus || filterType) currentPage = 1;
  let outQty = 0;
  let inQty = 0;
  let qtyBalance = 0;
  let balance = {};

  function getAccountName(acc) {
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  /*
   * Direction per movement type. Stored quantities are signed deltas
   * (negative = out, positive = in), but some legacy rows hold the
   * opposite sign, so the balance below uses Math.abs() and relies
   * only on the type's direction.
   */
  const INCOMING_STOCK_TYPES = new Set([
    'purchase',
    'sale_return',
    'sale_revert',
    'adjustment_in',
    'transfer_in',
    'transfer_out_revert',
    'production_in',
    'waste_revert',
    'purchase_return_revert',
    'inventory_record_return',
    'inventory_record_revert',
    'prescription_return',
    'prescription_revert',
  ]);

  const OUTGOING_STOCK_TYPES = new Set([
    'sale',
    'sale_return_revert',
    'purchase_return',
    'purchase_revert',
    'waste',
    'transfer_out',
    'transfer_in_revert',
    'production_out',
    'adjustment_out',
    'inventory_record',
    'inventory_record_return_revert',
    'prescription',
    'prescription_return_revert',
  ]);

  function isIncomingTx(type) {
    return INCOMING_STOCK_TYPES.has(type);
  }

  function isOutgoingTx(type) {
    return OUTGOING_STOCK_TYPES.has(type);
  }

  /*
   * Editing a confirmed sale is posted atomically by restoring the old
   * quantity and then deducting the edited quantity.  Those compensating
   * movements are useful audit history, but presenting each one as a new
   * sale makes a single invoice appear several times in the product Sale
   * and Report tabs.  Fold the history of each sale into the invoice's
   * current net stock effect before calculating the running report.
   *
   * Examples:
   *   sale -1, sale_revert +1, sale -1 => one sale of 1
   *   sale -1, sale_revert +1, sale -2 => one sale of 2
   * A zero net effect means the product was removed from the edited sale.
   */
  function consolidateSaleMovements(transactions) {
    const result = [];
    const saleGroups = new Map();

    for (const transaction of transactions) {
      if (
        transaction.reference_type !== 'sale' ||
        !['sale', 'sale_revert'].includes(transaction.transaction_type) ||
        transaction.reference_id === null ||
        transaction.reference_id === undefined
      ) {
        result.push(transaction);
        continue;
      }

      const key = [
        String(transaction.reference_id),
        String(transaction.product_id ?? ''),
        String(transaction.product_unit_id ?? ''),
      ].join(':');

      let group = saleGroups.get(key);
      if (!group) {
        group = {
          rows: [],
          quantity: 0,
          totalCost: 0,
        };
        saleGroups.set(key, group);
      }

      const quantity = Math.abs(Number(transaction.quantity || 0));
      group.quantity += transaction.transaction_type === 'sale'
        ? -quantity
        : quantity;
      group.totalCost += Number(transaction.total_cost || 0);
      group.rows.push(transaction);
    }

    for (const group of saleGroups.values()) {
      if (Math.abs(group.quantity) <= 1e-9) continue;

      const latest = group.rows.reduce((current, row) =>
        compareTransactionsChronologically(current, row) <= 0
          ? row
          : current,
      );
      const isSale = group.quantity < 0;

      result.push({
        ...latest,
        transaction_type: isSale ? 'sale' : 'sale_revert',
        quantity: group.quantity,
        total_cost: group.totalCost,
      });
    }

    return result;
  }

  async function loadStockTransactions() {
    reportLoading = true;

    try {
    product = product || (await getProductByRouteId(id));

    if (!product) {
      return;
    }

    const sameId = (first, second) =>
      String(first ?? '').trim() ===
      String(second ?? '').trim();

    const transactionProductIds =
      productGroupIds.length > 0
        ? productGroupIds
        : [Number(product.id)];

    stockTransactions =
      (await stockTransactionApi.getAll({ status: 1, product_ids: transactionProductIds }))?.data || [];

    const saleRefIds = [...new Set(stockTransactions.filter(t => t.reference_type === 'sale').map(t => t.reference_id))].filter(Boolean);
    const purchaseRefIds = [...new Set(stockTransactions.filter(t => t.reference_type === 'purchase').map(t => t.reference_id))].filter(Boolean);

    const [sales, purchases] = await Promise.all([
      fetchRowsByIds((opts) => saleApi.getAll(opts), saleRefIds),
      fetchRowsByIds((opts) => purchaseApi.getAll(opts), purchaseRefIds),
    ]);

    const accountIds = [...new Set([...sales.map(s => s.account_id), ...purchases.map(p => p.account_id)])].filter(Boolean);
    const accounts = await fetchRowsByIds((opts) => accountApi.getAll(opts), accountIds);

    const saleById = new Map(sales.map((item) => [String(item.id).trim(), item]));
    const purchaseById = new Map(purchases.map((item) => [String(item.id).trim(), item]));
    const accountById = new Map(accounts.map((item) => [String(item.id).trim(), item]));

    const groupProducts =
      productGroupProducts.length > 0
        ? productGroupProducts
        : [product];
    const openingProductIds = new Set(
      stockTransactions
        .filter((transaction) => isOpeningCandidate(transaction))
        .map((transaction) => String(transaction.product_id)),
    );
    const syntheticOpenings = [];

    for (const groupProduct of groupProducts) {
      const openingQuantity = Number(groupProduct.initial_quantity || 0);
      if (
        openingQuantity > 0 &&
        !openingProductIds.has(String(groupProduct.id))
      ) {
        syntheticOpenings.push({
          id: `opening-${groupProduct.id}`,
          warehouse_id: groupProduct.initial_warehouse_id,
          product_id: groupProduct.id,
          product_unit_id: groupProduct.product_unit_id,
          reference_id: groupProduct.id,
          reference_type: 'manual_adjustment',
          transaction_type: 'adjustment_in',
          quantity: openingQuantity,
          date: groupProduct.created_at,
          created_at: groupProduct.created_at,
          description: t('Opening Stock'),
          status: 1,
        });
      }
    }

    if (syntheticOpenings.length) {
      stockTransactions = [
        ...syntheticOpenings,
        ...stockTransactions,
      ];
    }

    openingTransactionIds = collectOpeningIds(stockTransactions);

    stockTransactions =
      stockTransactions.map(
        (transaction) => {
          const sale =
            transaction.reference_type === 'sale'
              ? saleById.get(String(transaction.reference_id ?? '').trim()) || null
              : null;

          const purchase =
            transaction.reference_type === 'purchase'
              ? purchaseById.get(String(transaction.reference_id ?? '').trim()) || null
              : null;

          if (sale) {
            const account =
              accountById.get(String(sale.account_id ?? '').trim()) || null;

            return {
              ...transaction,
              reference_number:
                sale.invoice_number,
              account_name: account
                ? getAccountName(account)
                : '',
              account_id: sale.account_id,

              // Use the original sale header to order same-day transactions.
              source_created_at:
                sale.created_at ||
                sale.date ||
                transaction.created_at,
              source_updated_at:
                sale.updated_at ||
                transaction.updated_at,
              source_sort_id: sale.id,
            };
          }

          if (purchase) {
            const account =
              accountById.get(String(purchase.account_id ?? '').trim()) || null;

            return {
              ...transaction,
              reference_number:
                purchase.bill_number,
              account_name: account
                ? getAccountName(account)
                : '',
              account_id:
                purchase.account_id,

              // Use the original purchase header to order same-day transactions.
              source_created_at:
                purchase.created_at ||
                purchase.date ||
                transaction.created_at,
              source_updated_at:
                purchase.updated_at ||
                transaction.updated_at,
              source_sort_id: purchase.id,
            };
          }

          if (isOpeningInputAdjustment(transaction)) {
            const adjustmentProduct =
              productGroupProducts.find((item) =>
                sameId(item.id, transaction.product_id || transaction.reference_id),
              ) || product;

            return {
              ...transaction,

              /*
               * Only the designated opening row is pinned to product
               * creation time so later incoming adjustments keep their
               * own date in the running balance.
               */
              source_created_at:
                adjustmentProduct?.created_at ||
                transaction.created_at ||
                transaction.date,
              source_updated_at:
                adjustmentProduct?.updated_at ||
                transaction.updated_at,
              source_sort_id:
                adjustmentProduct?.id ||
                transaction.reference_id ||
                transaction.id,
            };
          }

          return {
            ...transaction,
            source_created_at:
              transaction.created_at ||
              transaction.date ||
              transaction.updated_at,
            source_updated_at: transaction.updated_at,
            source_sort_id:
              transaction.reference_id ||
              transaction.id,
          };
        },
      );

    stockTransactions = consolidateSaleMovements(stockTransactions);

    /*
     * Running report balances must be calculated from the oldest
     * transaction to the newest transaction.
     */
    stockTransactions.sort(
      compareTransactionsChronologically,
    );

    await ensureProductUnitsLoaded();

    let runningQuantity = 0;
    let runningIncoming = 0;
    let runningOutgoing = 0;
    const runningBalance = {};
    const calculatedTransactions = [];

    for (const transaction of stockTransactions) {
      const convertedQuantity = convertUnitSync(
        Number(transaction.quantity || 0),
        Number(transaction.product_unit_id || product.product_unit_id),
        Number(product.product_unit_id),
      );

      let quantity = Number(
        convertedQuantity || 0,
      );

      if (isOpeningInputAdjustment(transaction) && Math.abs(quantity) <= 1e-9) {
        const openingProduct =
          productGroupProducts.find((item) =>
            sameId(item.id, transaction.product_id),
          ) || product;
        const openingQuantity = Number(openingProduct.initial_quantity || 0);
        if (openingQuantity > 0) {
          quantity = openingQuantity;
        }
      }

      const totalCost = Number(
        transaction.total_cost || 0,
      );

      const currency =
        transaction.currency ||
        product.buy_currency ||
        'AFN';

      if (
        isIncomingTx(
          transaction.transaction_type,
        )
      ) {
        /*
         * Stock in always adds to the balance regardless of the
         * sign the row was stored with (legacy rows may be
         * negative even for incoming types).
         */
        runningQuantity += Math.abs(quantity);
        runningIncoming += quantity;

        runningBalance[currency] =
          Number(
            runningBalance[currency] || 0,
          ) - totalCost;
      } else if (
        isOutgoingTx(
          transaction.transaction_type,
        )
      ) {
        /*
         * Stock out always subtracts. sale rows are stored with a
         * negative quantity, so subtracting the raw value would
         * ADD to the balance (e.g. 405 - (-1) = 406 instead of
         * 404); abs() fixes both stored signs.
         */
        runningQuantity -= Math.abs(quantity);

        /*
         * Preserve the existing negative outQty format used by the
         * report and display it with Math.abs(outQty).
         */
        runningOutgoing -= quantity;

        if (
          transaction.transaction_type !==
          'waste'
        ) {
          runningBalance[currency] =
            Number(
              runningBalance[currency] || 0,
            ) + totalCost;
        }
      } else {
        /*
         * Unclassified movement: fall back to the signed delta so
         * the running balance still ends at the canonical
         * product.quantity (which the backend maintains as a sum
         * of signed deltas).
         */
        runningQuantity += quantity;

        console.warn(
          'Unknown stock transaction type:',
          transaction.transaction_type,
          transaction,
        );
      }

      calculatedTransactions.push({
        ...transaction,

        /*
         * This index is assigned only after the balance is calculated in true
         * oldest -> newest order. The table uses it in reverse so the latest
         * balance is always the first row.
         */
        _historicalIndex: calculatedTransactions.length,
        convertedQuantity: quantity,
        qtyBalance: runningQuantity,
        inQty: runningIncoming,
        outQty: runningOutgoing,
        balance: {
          ...runningBalance,
        },
      });
    }

    inQty = runningIncoming;
    outQty = runningOutgoing;
    balance = { ...runningBalance };

    const canonicalQuantity = Number(product.quantity);
    qtyBalance = Number.isFinite(canonicalQuantity)
      ? canonicalQuantity
      : runningQuantity;

    /*
     * Calculation: oldest -> newest.
     * Display: newest -> oldest.
     * The newest/current balance is therefore always shown in the first row.
     */
    stockTransactions = [...calculatedTransactions].sort((first, second) => {
      const firstIsOpening = isOpeningInputAdjustment(first);
      const secondIsOpening = isOpeningInputAdjustment(second);

      /* Newest transactions first; only the designated opening stays last. */
      if (firstIsOpening !== secondIsOpening) {
        return firstIsOpening ? 1 : -1;
      }

      return (
        Number(second._historicalIndex) -
        Number(first._historicalIndex)
      );
    });
    } finally {
      reportLoading = false;
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  function formatBalance(balance) {
    return Object.entries(balance)
      .map(([currency, amount]) => {
        const numeric = Number(amount) || 0;
        const tone =
          numeric < 0 ? 'amount-negative' : numeric > 0 ? 'amount-positive' : '';

        return `<span class="amount-inline ${tone}"><span dir="ltr">${numeric.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3,
        })}</span><span>${t(currency)}</span></span>`;
      })
      .join('<br>');
  }

  function unitLabel(unitId) {
    return units.find((u) => u.id === unitId)?.name || unitId || '';
  }

  function warehouseName(warehouseId) {
    return warehouses.find((warehouse) => Number(warehouse.id) === Number(warehouseId))?.name || warehouseId || '-';
  }

  function batchDisplayName(batch, batchProduct) {
    return (
      String(batch?.batch_number || batch?.batch || batchProduct?.batch || batchProduct?.batch_number || '').trim() ||
      t('No Batch')
    );
  }

  function aggregateWarehouseRows(rows, groupProducts) {
    const productById = new Map(groupProducts.map((item) => [Number(item.id), item]));
    const aggregated = new Map();

    rows.forEach((row) => {
      const warehouseId = Number(row.warehouse_id || 0);
      const existing =
        aggregated.get(warehouseId) || {
          id: `warehouse-${warehouseId}`,
          warehouse_id: warehouseId,
          product_id: product?.id,
          product_unit_id: product?.product_unit_id,
          quantity: 0,
        };
      const rowProduct = productById.get(Number(row.product_id));
      existing.quantity += toNumber(row.quantity);
      existing.product_unit_id = rowProduct?.product_unit_id || existing.product_unit_id;
      aggregated.set(warehouseId, existing);
    });

    return Array.from(aggregated.values());
  }

  async function buildProductBatchDetails(groupProducts) {
    const ids = groupProducts.map((item) => Number(item.id));
    if (!ids.length) return [];

    const stockBatchResponse = await stockBatchApi.getAll({
      product_ids: ids,
      status: 1,
    });
    const stockBatches = (stockBatchResponse?.data || []).filter(
      (batch) => toNumber(batch.quantity_remaining) > 0,
    );

    if (stockBatches.length) {
      const productById = new Map(groupProducts.map((item) => [Number(item.id), item]));

      return stockBatches
        .map((batch) => {
          const batchProduct = productById.get(Number(batch.product_id));
          return {
            id: `batch-${batch.id}`,
            product_id: batch.product_id,
            batch: batchDisplayName(batch, batchProduct),
            quantity: toNumber(batch.quantity_remaining),
            quantity_in: toNumber(batch.quantity_in),
            warehouse_id: batch.warehouse_id,
            unit_id: batchProduct?.product_unit_id || product?.product_unit_id,
            unit_cost: toNumber(batch.unit_cost || batchProduct?.buy_price),
            currency: batch.currency || batchProduct?.buy_currency || product?.buy_currency,
            received_at: batch.received_at || batch.created_at || '',
            manufacturing_date: batch.manufacturing_date || batchProduct?.manufacturing_date || '',
            expiry_date: batch.expiry_date || batchProduct?.expiry_date || '',
          };
        })
        .sort((first, second) => {
          const firstDate = new Date(first.received_at || 0).getTime();
          const secondDate = new Date(second.received_at || 0).getTime();
          if (firstDate !== secondDate) return firstDate - secondDate;
          return String(first.batch).localeCompare(String(second.batch));
        });
    }

    return groupProducts
      .map((item) => ({
        id: `product-${item.id}`,
        product_id: item.id,
        batch: getProductBatchValue(item) || t('No Batch'),
        quantity: toNumber(item.quantity),
        quantity_in: toNumber(item.quantity),
        warehouse_id: item.initial_warehouse_id || '',
        unit_id: item.product_unit_id,
        unit_cost: toNumber(item.buy_price),
        currency: item.buy_currency || product?.buy_currency,
        received_at: item.created_at || '',
        manufacturing_date: item.manufacturing_date || '',
        expiry_date: item.expiry_date || '',
      }))
      .filter((item) => item.quantity !== 0 || item.quantity_in !== 0);
  }

  async function hydrateProductGroup(baseProduct) {
    if (!baseProduct) return;

    const groupKey = getProductGroupKey(baseProduct);
    const catalog = (await productApi.getAll({
      status: 1,
      search: String(baseProduct.name || '').trim(),
      category_id: baseProduct.category_id || '',
      exclude_type: 'service',
    }))?.data || [];

    productGroupProducts = catalog
      .filter((row) => row.type !== 'service' && getProductGroupKey(row) === groupKey)
      .map((row) =>
        String(row.id) === String(baseProduct.id)
          ? { ...row, ...baseProduct }
          : row,
      );

    if (
      !productGroupProducts.some(
        (row) => String(row.id) === String(baseProduct.id),
      )
    ) {
      productGroupProducts = [baseProduct, ...productGroupProducts];
    }

    if (!productGroupProducts.length) productGroupProducts = [baseProduct];
    product = aggregateProductGroup(productGroupProducts, baseProduct);
    productGroupIds = productGroupProducts.map((item) => Number(item.id));

    const warehouseResponses = await Promise.all(
      productGroupIds.map((productId) =>
        warehouseProductApi
          .getAll({ status: 1, product_id: productId })
          .then((response) => response?.data || [])
          .catch(() => []),
      ),
    );
    warehouse_products = aggregateWarehouseRows(warehouseResponses.flat(), productGroupProducts);

    productBatchDetails = await buildProductBatchDetails(productGroupProducts);
    qtyBalance = toNumber(product.quantity);
  }

  function txTypeRoute(tx) {
    if (tx.transaction_type === 'sale') return `/dashboard/sales/${tx.reference_id}`;
    if (tx.transaction_type === 'purchase') return `/dashboard/purchases/${tx.reference_id}`;
    if (tx.transaction_type === 'transfer_in' || tx.transaction_type === 'transfer_out')
      return `/dashboard/stock-transfers/${tx.reference_id}`;
    if (tx.transaction_type === 'waste') return `/dashboard/wastes/${tx.reference_id}`;
    return null;
  }

  function getProductReportActions(tx) {
    const actions = [];
    const route = txTypeRoute(tx);

    if (route) {
      actions.push({
        icon: 'bi-eye',
        label: t('View'),
        tone: 'view',
        onClick: () => push(route),
      });
    }

    if (
      tx.reference_type === 'manual_adjustment' &&
      (tx.reference_id === product?.id || productGroupIds.includes(Number(tx.reference_id)))
    ) {
      actions.push({
        icon: 'bi-pencil',
        label: t('Edit'),
        tone: 'edit',
        onClick: () => editTheTransaction(tx),
      });
    }

    return actions;
  }

  async function exportProductReport(format = 'pdf') {
    generatingPDF = true;
    try {
      const exporter = format === 'excel' ? generateExcel : generatePDF;
      await exporter(
        'product_transactions',
        filteredTransactions,
        fromDate,
        toDate,
        filteredTransactions.length,
        balance,
        {
          product,
          qtyBalance,
          benefit: calculateBenefit(balance) || 0,
          predictedBenefit: calculatePredictedBenefit(balance) || 0,
        },
      );
    } finally {
      generatingPDF = false;
    }
  }

  function calculateBenefit(balance) {
    if (!product) return null;
    let output = 0;
    const totalBuyPrice = product.buy_price * qtyBalance;
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }
      output += amount;
    });
    return totalBuyPrice + output;
  }

  function calculatePredictedBenefit(balance) {
    if (!product) return null;
    let output = 0;
    let totalSellPrice = product.sell_price * qtyBalance;
    if (product.sell_currency !== product.buy_currency) {
      totalSellPrice = exchangeRate(totalSellPrice, product.sell_currency, product.buy_currency);
    }
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }
      output += amount;
    });
    return totalSellPrice + output;
  }

  async function loadProduct() {
    try {
    const [
      currencyRes,
      warehouseRes,
      unitListRes,
      brandRes,
      genericRes,
      loadedProduct,
    ] = await Promise.all([
      currencyApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
      productBrandApi.getAll({ status: 1 }),
      productGenericApi.getAll({ status: 1 }),
      getProductByRouteId(id),
    ]);

    currencies = currencyRes?.data || [];
    warehouses = warehouseRes?.data || [];
    units = unitListRes?.data || [];
    brands = brandRes?.data || [];
    generics = genericRes?.data || [];
    product = loadedProduct;

    if (!product) {
      reportLoading = false;
      return;
    }

    await hydrateProductGroup(product);
    await refreshCanonicalStock();

    const [categoryRes, unitRes, imgRes] = await Promise.all([
      product.category_id
        ? productCategoryApi.getById(product.category_id).catch(() => null)
        : Promise.resolve(null),
      product.product_unit_id
        ? productUnitApi.getById(product.product_unit_id).catch(() => null)
        : Promise.resolve(null),
      productImageApi.getAll({ product_id: product.id, status: 1 }),
      loadStockTransactions(),
    ]);

    category = categoryRes?.data || null;
    const unitRow = unitRes?.data || null;
    unit = unitRow?.status === 1
      ? unitRow
      : units.find((item) => Number(item.id) === Number(product.product_unit_id)) || null;
    brand = brands.find((b) => b.id === product.brand_id) || null;
    generic = generics.find((g) => g.id === product.generic_id) || null;
    const img = imgRes?.data?.[0] || null;

    product.thumbnailUrl = resolveMediaUrl(img?.thumbnail, '/img/no-image.png');
    product.imageUrl = resolveMediaUrl(img?.image, '/img/no-image.png');

    myThumbnailUrl = product?.thumbnailUrl || '/img/no-image.png';
    myImageUrl = product?.imageUrl || '/img/no-image.png';
    } finally {
      loading = false;
    }
  }
  async function refreshCanonicalStock() {
    if (!product?.id) return;

    inventoryMethod =
      await resolveInventoryMethod();

    const currentImageUrl =
      product.imageUrl;

    const currentThumbnailUrl =
      product.thumbnailUrl;

    const idsToRefresh =
      productGroupIds.length > 0
        ? productGroupIds
        : [Number(product.id)];

    for (const productId of idsToRefresh) {
      try {
        await productApi.reconcileStock(productId);
      } catch (error) {
        console.warn('Failed to reconcile product stock:', productId, error);
        await calculateProductStock(
          productId,
          inventoryMethod,
        );
      }
    }

    const freshProduct =
      (await productApi.getById(product.id))?.data || null;

    if (freshProduct) {
      await hydrateProductGroup(freshProduct);
      product = {
        ...product,
        quantity: toNumber(product.quantity),
        initial_quantity:
          freshProduct.initial_quantity ?? product.initial_quantity,
        initial_warehouse_id:
          freshProduct.initial_warehouse_id ?? product.initial_warehouse_id,
        imageUrl:
          currentImageUrl ||
          product.imageUrl ||
          freshProduct.imageUrl ||
          '/img/no-image.png',
        thumbnailUrl:
          currentThumbnailUrl ||
          product.thumbnailUrl ||
          freshProduct.thumbnailUrl ||
          '/img/no-image.png',
      };
    }

    qtyBalance = Number(
      product.quantity || 0,
    );
  }

  onMount(async () => {
    await loadProduct();
    if (window.mdb) {
      console.log(document.querySelectorAll('[data-mdb-input-init]'));
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      const modalEl = document.getElementById('editTransactionModal');
      if (modalEl) {
        editTransactionModal = new window.mdb.Modal(modalEl);
      }
    }
    
    tick().then(() => setDatePickers(handleDateChange));
  });

  let editTransaction = {
    unit_cost: 0,
    quantity: 0,
    product_unit_id: null,
    warehouse_id: null,
    currency: 0,
    total_cost: 0,
    expiry_date: null,
  };

  function editTheTransaction(tx) {
    editTransaction = tx;

    editTransactionModal.show();
  }

  async function updateTransaction() {
    await stockTransactionApi.update(editTransaction.id, {
      warehouse_id: editTransaction.warehouse_id,
      product_id: editTransaction.product_id,
      product_unit_id: editTransaction.product_unit_id,
      reference_id: editTransaction.reference_id,
      reference_type: editTransaction.reference_type,
      transaction_type: editTransaction.transaction_type,
      quantity: Number(editTransaction.quantity) || 0,
      unit_cost: Number(editTransaction.unit_cost) || 0,
      total_cost: Number(editTransaction.total_cost) || 0,
      currency: editTransaction.currency,
      peer_price: editTransaction.peer_price,
      peer_currency: editTransaction.peer_currency,
      date: editTransaction.date,
      batch: editTransaction.batch,
      manufacturing_date: editTransaction.manufacturing_date,
      expiry_date: editTransaction.expiry_date,
      heaviness: editTransaction.heaviness,
      description: editTransaction.description,
      status: editTransaction.status ?? 1,
    });

    await calculateProductStock(editTransaction.product_id);
    await refreshCanonicalStock();
    await loadStockTransactions();
    editTransactionModal.hide();
  }
</script>

{#if !permissions?.some((p) => p.code === 'Products' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}

    {#if activeTab === 'overview'}
    {#if loading}
      <div class="product-overview-card product-overview-card--loading">
        <div class="product-overview-card__image">
          <div class="product-skeleton product-skeleton--image"></div>
        </div>
        <div class="product-overview-card__body">
          <div class="product-skeleton product-skeleton--title"></div>
          <div class="product-price-grid">
            <div class="product-skeleton product-skeleton--metric"></div>
            <div class="product-skeleton product-skeleton--metric"></div>
            <div class="product-skeleton product-skeleton--metric"></div>
          </div>
          <div class="product-skeleton product-skeleton--line"></div>
          <div class="product-skeleton product-skeleton--line short"></div>
        </div>
      </div>
    {:else if product}
      <div class="product-overview-card">
        <div class="product-overview-card__image">
          <img src={myImageUrl} alt={product.name} class="product-overview-card__img" />
          <span class="product-overview-card__image-label">
            <i class="bi bi-image"></i>
            {category?.name || t('Uncategorized')}
          </span>
        </div>
        <div class="product-overview-card__body">
          <div class="product-overview-card__head">
            <div class="product-overview-card__heading">
              <span class="product-overview-card__section-icon" aria-hidden="true">
                <i class="bi bi-box-seam"></i>
              </span>
              <div>
                <span class="product-overview-card__eyebrow">{category?.name || t('Uncategorized')}</span>
                <h2 class="product-overview-card__name">{product.name}</h2>
              </div>
            </div>
            {#if permissions?.some((p) => p.code === 'Products' && p.edit)}
              <button
                type="button"
                class="product-overview-card__edit"
                aria-label={t('Edit Product')}
                title={t('Edit Product')}
                on:click={goEdit}>
                <i class="bi bi-pencil"></i>
              </button>
            {/if}
          </div>

          <div class="product-price-grid">
            <div
              class="product-price-card product-price-card--stock"
              class:product-price-card--warning={Number(product.quantity || 0) > 0 &&
                Number(product.alarm_quantity) > 0 &&
                Number(product.quantity || 0) <= Number(product.alarm_quantity)}
              class:product-price-card--danger={Number(product.quantity || 0) <= 0}>
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-boxes"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Quantity')}</span>
                <span class="product-price-card__value">
                  <span dir="ltr">{Number(product.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  <small>{unit?.name || '-'}</small>
                </span>
              </span>
            </div>
            <div class="product-price-card product-price-card--buy">
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-arrow-down-left"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Buy Price')}</span>
                <span class="product-price-card__value">
                  <span dir="ltr">{Number(product.buy_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  <small>{t(product.buy_currency)}</small>
                </span>
              </span>
            </div>
            <div class="product-price-card product-price-card--sell">
              <span class="product-price-card__icon" aria-hidden="true">
                <i class="bi bi-arrow-up-right"></i>
              </span>
              <span class="product-price-card__content">
                <span class="product-price-card__label">{t('Sell Price')}</span>
                <span class="product-price-card__value">
                  <span dir="ltr">{Number(product.sell_price).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  <small>{t(product.sell_currency)}</small>
                </span>
              </span>
            </div>
          </div>

          <div class="product-details-grid">
            <section class="product-detail-section" aria-labelledby="product-basic-information">
              <h3 id="product-basic-information" class="product-detail-section__title">
                <i class="bi bi-info-circle"></i>
                {t('Basic Information')}
              </h3>
              <dl class="product-meta-list">
                <div class="product-meta-list__row">
                  <dt>{t('Code')}</dt>
                  <dd><bdi>{product.code || '-'}</bdi></dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Category')}</dt>
                  <dd>{category?.name || t('Uncategorized')}</dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Unit')}</dt>
                  <dd>{unit?.name || '-'}</dd>
                </div>
                {#if _translate_org_type == 'exchange'}
                  <div class="product-meta-list__row">
                    <dt>{t('Currency')}</dt>
                    <dd>{t(product?.currency || '-')}</dd>
                  </div>
                {/if}
                {#if enable_brands}
                  <div class="product-meta-list__row">
                    <dt>{t('Brand')}</dt>
                    <dd>{brand?.name || '-'}</dd>
                  </div>
                {/if}
                {#if enable_generics}
                  <div class="product-meta-list__row">
                    <dt>{t('Generic')}</dt>
                    <dd>{generic?.name || '-'}</dd>
                  </div>
                {/if}
              </dl>
            </section>

            <section class="product-detail-section" aria-labelledby="product-extra-information">
              <h3 id="product-extra-information" class="product-detail-section__title">
                <i class="bi bi-sliders"></i>
                {t('Extra Information')}
              </h3>
              <dl class="product-meta-list">
                {#if enable_batch}
                  <div class="product-meta-list__row">
                    <dt>{t('Batch')}</dt>
                    <dd>{product?.batch || '-'}</dd>
                  </div>
                {/if}
                {#if enable_manufacturing_date}
                  <div class="product-meta-list__row">
                    <dt>{t('Manufacturing Date')}</dt>
                    <dd>{product?.manufacturing_date || '-'}</dd>
                  </div>
                {/if}
                {#if enable_expiry_date}
                  <div class="product-meta-list__row">
                    <dt>{t('Expiry Date')}</dt>
                    <dd>{product?.expiry_date || '-'}</dd>
                  </div>
                {/if}
                <div class="product-meta-list__row">
                  <dt>{t('Alarm Quantity')}</dt>
                  <dd>
                    <span class="amount-inline">
                      <span dir="ltr">{product.alarm_quantity}</span>
                      <span>{unit?.name || '-'}</span>
                    </span>
                  </dd>
                </div>
                <div class="product-meta-list__row">
                  <dt>{t('Alarm Expiry Days')}</dt>
                  <dd>
                    <span class="amount-inline">
                      <span dir="ltr">{product.alarm_expiry_days}</span>
                      <span>{Number(product.alarm_expiry_days) < 2 ? t('Day') : t('Days')}</span>
                    </span>
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section class="product-batch-overview" aria-labelledby="product-stock-details">
            <h3 id="product-stock-details" class="product-batch-overview__title">
              <i class="bi bi-layers"></i>
              {t('Stock Details')}
            </h3>

            {#if productBatchDetails.length === 0}
              <div class="product-batch-overview__empty">
                {t('No quantity found.')}
              </div>
            {:else}
              <DataTable
                ariaLabel={t('Stock Details')}
                minWidth="760px"
                dense={true}
                striped={true}
                hover={false}
                layout="fixed"
                scrollbar="thin">
                <svelte:fragment slot="head">
                  <tr>
                    <th>{t('Batch')}</th>
                    <th class="col-start">{t('Quantity')}</th>
                    <th>{t('Warehouse')}</th>
                    <th class="col-start">{t('Purchase Price')}</th>
                    <th>{t('Received Date')}</th>
                    {#if enable_manufacturing_date}
                      <th>{t('Manufacturing Date')}</th>
                    {/if}
                    {#if enable_expiry_date}
                      <th>{t('Expiry Date')}</th>
                    {/if}
                  </tr>
                </svelte:fragment>

                {#each productBatchDetails as detail (detail.id)}
                  <tr>
                    <td>
                      <StatusBadge tone={detail.batch === t('No Batch') ? 'neutral' : 'info'} ghost={detail.batch === t('No Batch')}>
                        {detail.batch}
                      </StatusBadge>
                    </td>
                    <td class="col-start">
                      <StatusBadge tone={Number(detail.quantity || 0) > 0 ? 'positive' : 'negative'}>
                        <span dir="ltr">{Number(detail.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                        <span>{unitLabel(detail.unit_id)}</span>
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone="neutral" ghost={true}>
                        {warehouseName(detail.warehouse_id)}
                      </StatusBadge>
                    </td>
                    <td class="col-start">
                      <StatusBadge tone="neutral" ghost={true}>
                        <span dir="ltr">{Number(detail.unit_cost || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 3,
                        })}</span>
                        {#if detail.currency}<span>{t(detail.currency)}</span>{/if}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone="neutral" ghost={true} ltr={true}>
                        {detail.received_at || '-'}
                      </StatusBadge>
                    </td>
                    {#if enable_manufacturing_date}
                      <td>
                        <StatusBadge tone="neutral" ghost={true} ltr={true}>
                          {detail.manufacturing_date || '-'}
                        </StatusBadge>
                      </td>
                    {/if}
                    {#if enable_expiry_date}
                      <td>
                        <StatusBadge tone="neutral" ghost={true} ltr={true}>
                          {detail.expiry_date || '-'}
                        </StatusBadge>
                      </td>
                    {/if}
                  </tr>
                {/each}
              </DataTable>
            {/if}
          </section>

          {#if product.description}
            <section class="product-description-block" aria-labelledby="product-description-title">
              <h3 id="product-description-title" class="product-description-block__title">
                <i class="bi bi-text-paragraph"></i>
                {t('Description')}
              </h3>
              <p class="product-description-block__text">{product.description}</p>
            </section>
          {/if}
        </div>
      </div>
    {:else}
      <div class="product-empty-state">
        <i class="bi bi-exclamation-circle"></i>
        <h2>{t('Error')}</h2>
        <p>{t('Product not found.')}</p>
      </div>
    {/if}
    {:else if activeTab === 'buy'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <ProductTransactionHistory productId={product?.id} productIds={productGroupIds} kind="buy" />
      {/if}
    {:else if activeTab === 'sale'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <ProductTransactionHistory productId={product?.id} productIds={productGroupIds} kind="sale" />
      {/if}
    {:else if activeTab === 'warehouses'}
      {#if !product}
        <div class="product-empty-state product-empty-state--compact">
          <p>{t('Product not found.')}</p>
        </div>
      {:else}
        <IndexPageLayout
          dir={t('dir')}
          ariaLabel={t('Warehouse')}
          showFooter={warehouse_products.length > 0}
          dense={true}
          tablePadding={false}>
          {#if warehouse_products.length === 0}
            <div class="index-table-state">
              <EmptyState icon="bi-building" message={t('No quantity found.')} />
            </div>
          {:else}
            <DataTable
              ariaLabel={t('Warehouse')}
               minWidth="900px"
              dense={true}
              striped={true}
              hover={false}
              stickyHeader={true}
              layout="fixed"
              scrollbar="thin">
              <svelte:fragment slot="head">
                <tr>
                  <th>{t('Warehouse')}</th>
                  <th class="col-start">{t('Quantity')}</th>
                  <th class="col-start">{t('Purchase Price')}</th>
                  <th class="col-start">{t('Inventory Value')}</th>
                </tr>
              </svelte:fragment>

              {#each paginatedWarehouseProducts as wp (wp.id)}
                <tr>
                  <td>
                    <StatusBadge tone="neutral" ghost={true}>
                      {warehouses.find((warehouse) => warehouse.id === wp.warehouse_id)?.name || wp.warehouse_id}
                    </StatusBadge>
                  </td>
                  <td class="col-start">
                    <StatusBadge tone={Number(wp.quantity) > 0 ? 'positive' : 'negative'}>
                      <span dir="ltr">{Number(wp.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      <span>{units.find((u) => u.id === wp.product_unit_id)?.name || wp.product_unit_id || ''}</span>
                    </StatusBadge>
                  </td>
                  <td class="col-start">
                    <StatusBadge tone="neutral" ghost={true}>
                      <span dir="ltr">{Number(product?.buy_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                      {#if product?.buy_currency}<span>{t(product.buy_currency)}</span>{/if}
                    </StatusBadge>
                  </td>
                  <td class="col-start">
                    {#if product}
                      <StatusBadge tone={(Number(product.buy_price || 0) * Number(wp.quantity || 0)) >= 0 ? 'positive' : 'negative'}>
                        <span dir="ltr">{Number(Number(product.buy_price || 0) * Number(wp.quantity || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                        {#if product?.buy_currency}<span>{t(product.buy_currency)}</span>{/if}
                      </StatusBadge>
                    {:else}
                      <StatusBadge tone="neutral" ghost={true}>-</StatusBadge>
                    {/if}
                  </td>
                </tr>
              {/each}
            </DataTable>
          {/if}

          <svelte:fragment slot="footer">
            <PaginationBar
              bind:currentPage={warehouseCurrentPage}
              totalPages={warehouseTotalPages}
              itemsPerPage={warehouseItemsPerPage}
              totalItems={warehouse_products.length}
              {getPageNumbers}
              ariaLabel={t('Warehouse')}
              perPageOptions={[5, 10, 20, 50]}
              perPageSuffix={t('per page')}
              on:perPageChange={(event) => {
                warehouseItemsPerPage = Number(event.detail);
                warehouseCurrentPage = 1;
              }} />
          </svelte:fragment>
        </IndexPageLayout>
      {/if}
    {:else if activeTab === 'report'}
      <IndexPageLayout
        dir={t('dir')}
        ariaLabel={t('Report')}
        toolbarWidth="25rem"
        showStats={showReportStats}
        showFooter={!reportLoading && filteredTransactions.length > 0}
        dense={true}
        tablePadding={true}>
        <svelte:fragment slot="actions">
          <ExportMenu
            loading={generatingPDF}
            disabled={generatingPDF || filteredTransactions.length === 0}
            on:export={(event) => exportProductReport(event.detail)}
          />

          <button
            type="button"
            class="index-settings-button"
            class:is-active={showReportStats}
            aria-label={t('Summary')}
            aria-expanded={showReportStats}
            aria-controls="product-report-statistics"
            title={t('Summary')}
            on:click={() => (showReportStats = !showReportStats)}>
            <i class="bi {showReportStats ? 'bi-x-lg' : 'bi-wallet2'}" aria-hidden="true"></i>
          </button>
        </svelte:fragment>

        <svelte:fragment slot="toolbar">
          <FilterToolbar
            searchValue={searchTerm}
            searchPlaceholder={t('Search transactions...')}
            filters={reportToolbarFilters}
            filterLabel={t('Filter')}
            resetLabel={t('Clear Filters')}
            showReset={true}
            on:searchChange={(event) => {
              searchTerm = event.detail;
              currentPage = 1;
            }}
            on:filterChange={handleReportToolbarFilter}
            on:reset={resetReportFilters} />
        </svelte:fragment>

        <svelte:fragment slot="stats">
          <div id="product-report-statistics" class="index-summary-grid product-report-summary">
            <SummaryCard label={t('Quantity Balance')} icon="bi-boxes" tone="cyan">
              <span class="amount-inline">
                <span dir="ltr">{qtyBalance.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{unitLabel(product?.product_unit_id)}</span>
              </span>
            </SummaryCard>

            <SummaryCard label={t('In')} icon="bi-arrow-down-left" tone="green">
              <span class="amount-inline">
                <span dir="ltr">{inQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{unitLabel(product?.product_unit_id)}</span>
              </span>
            </SummaryCard>

            <SummaryCard label={t('Out')} icon="bi-arrow-up-right" tone="amber">
              <span class="amount-inline">
                <span dir="ltr">{Math.abs(outQty).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{unitLabel(product?.product_unit_id)}</span>
              </span>
            </SummaryCard>

            <SummaryCard label={t('In-Out Balance')} icon="bi-wallet2" tone="purple">
              <span class="report-summary-balance">{@html formatBalance(balance) || t('No transactions yet.')}</span>
            </SummaryCard>

            {#if permissions?.some((permission) => permission.code === 'Benefit' && permission.view)}
              <SummaryCard label={t('Current Benefit')} icon="bi-cash-stack" tone="blue">
                <span class="amount-inline">
                  <span dir="ltr">{(calculateBenefit(balance) ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}</span>
                  <span>{t(product?.buy_currency)}</span>
                </span>
              </SummaryCard>

              <SummaryCard label={t('Predicted Benefit')} icon="bi-graph-up-arrow" tone="green">
                <span class="amount-inline">
                  <span dir="ltr">{(calculatePredictedBenefit(balance) ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}</span>
                  <span>{t(product?.buy_currency)}</span>
                </span>
              </SummaryCard>
            {/if}
          </div>
        </svelte:fragment>

        {#if reportLoading}
          <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if filteredTransactions.length === 0}
          <div class="index-table-state">
            <EmptyState icon="bi-journal-text" message={t('No transactions found.')} />
          </div>
        {:else}
          <div class="product-report-table">
          <DataTable
            ariaLabel={t('Report')}
            minWidth="100%"
            dense={true}
            striped={true}
            hover={false}
            stickyHeader={true}
            layout="fixed"
            scrollbar="thin"
            clipCells={true}>
            <svelte:fragment slot="head">
              <tr>
                <th class="col-start report-col-id">
                  <span class="sortable-heading">
                    {t('#')}
                  </span>
                </th>

                <th class="report-col-date">
                  <span class="sortable-heading">
                    {t('Date')}
                    <i class="bi bi-arrow-down sort-icon" aria-hidden="true"></i>
                  </span>
                </th>

                <th>{t('Warehouse')}</th>

                <th>
                  <span class="sortable-heading">
                    {t('Type')}
                  </span>
                </th>

                <th>{t('Name')}{t('-of-')}{t('Account')}</th>
                <th class="col-start">{t('In')}</th>
                <th class="col-start">{t('Out')}</th>
                <th class="col-start">{t('Quantity Balance')}</th>
                <th class="col-start">{t('In-Out Balance')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </svelte:fragment>

            {#each paginatedTransactions as tx ,index}
              <tr>
               <td class="col-start cell-muted report-col-id">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <td class="report-col-date">
                  <StatusBadge tone="neutral" ghost ltr={true} stacked>
                    {@html showDate(tx.date || tx.created_at)}
                  </StatusBadge>
                </td>

                <td>
                  <StatusBadge tone="neutral" ghost={true}>
                    {warehouses.find((warehouse) => warehouse.id === tx.warehouse_id)?.name || tx.warehouse_id}
                  </StatusBadge>
                </td>

                <td>
                  {#if txTypeRoute(tx)}
                    <button type="button" class="report-type-link" on:click={() => push(txTypeRoute(tx))}>
                      {t(tx.transaction_type)} {tx.reference_number || shortID(tx.reference_id)}
                    </button>
                  {:else}
                    <StatusBadge tone="info">{t(tx.transaction_type)}</StatusBadge>
                  {/if}
                </td>

                <td>
  {#if tx.account_id}
    <button
      type="button"
      class="report-account-link"
      aria-label={`Open ${tx.account_name || 'account'} details`}
      on:click={() => push(`/dashboard/account/${tx.account_id}`)}
    >
      <StatusBadge tone="neutral" ghost={true}>
        {tx.account_name ? t(tx.account_name) : '-'}
      </StatusBadge>
    </button>
  {:else}
    <StatusBadge tone="neutral" ghost={true}>
      {tx.account_name ? t(tx.account_name) : '-'}
    </StatusBadge>
  {/if}
</td>

                <td class="col-start">
                  {#if isIncomingTx(tx.transaction_type)}
                    <StatusBadge tone="positive">
                      <span dir="ltr">{Number(tx.convertedQuantity || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}</span>
                      <span>{unitLabel(product?.product_unit_id)}</span>
                    </StatusBadge>
                  {:else}
                    <span class="report-muted-dash">-</span>
                  {/if}
                </td>

                <td class="col-start">
                  {#if isOutgoingTx(tx.transaction_type)}
                    <StatusBadge tone="negative">
                      <span dir="ltr">{Number(tx.convertedQuantity || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}</span>
                      <span>{unitLabel(product?.product_unit_id)}</span>
                    </StatusBadge>
                  {:else}
                    <span class="report-muted-dash">-</span>
                  {/if}
                </td>

                <td class="col-start">
                  <StatusBadge tone={Number(tx.qtyBalance) >= 0 ? 'positive' : 'negative'}>
                    <span dir="ltr">{Number(tx.qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                    <span>{unitLabel(product?.product_unit_id)}</span>
                  </StatusBadge>
                </td>

                <td class="col-start">
                  <div class="report-balance-cell">{@html formatBalance(tx.balance)}</div>
                </td>

                <td>
                  <TableActions actions={getProductReportActions(tx)} />
                </td>
              </tr>
            {/each}
          </DataTable>
          </div>
        {/if}

        <svelte:fragment slot="footer">
          <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={filteredTransactions.length}
            {getPageNumbers}
            ariaLabel={t('Report')}
            perPageOptions={[5, 10, 20, 50]}
            perPageSuffix={t('per page')}
            on:perPageChange={(event) => {
              itemsPerPage = Number(event.detail);
              currentPage = 1;
            }} />
        </svelte:fragment>
      </IndexPageLayout>
    {/if}
 

<div
  class="modal fade"
  id="editTransactionModal"
  tabindex="-1"
  aria-labelledby="editTransactionModalLabel"
  aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="editTransactionModalLabel">
          {t('Edit')}
          {editTransaction?.id}
        </h5>
        <button type="button" class="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"
        ></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-12">
            <select class="form-select mb-3" bind:value={editTransaction.warehouse_id}>
              <option value="" disabled>{t('Select Warehouse')}</option>
              {#each warehouses as w}
                <option value={w.id}>{w.name}</option>
              {/each}
            </select>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editQuantity"
                  class="form-control"
                  bind:value={editTransaction.quantity}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.quantity = '';
                    } else {
                      editTransaction.quantity = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editQuantity">{t('Quantity')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.product_unit_id}>
                <option value="" disabled>{t('Select Product Unit')}</option>
                {#each units as u}
                  <option value={u.id}>{u.name}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editUnitCost"
                  class="form-control"
                  bind:value={editTransaction.unit_cost}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.unit_cost = '';
                    } else {
                      editTransaction.unit_cost = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editUnitCost">{t('Unit Cost')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.currency}>
                <option value="" disabled>{t('Select Currency')}</option>
                {#each currencies as c}
                  <option value={c.code}>{t(c.code)}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="col-md-4">
            <div class="input-group">
              <div class="form-outline mb-3" data-mdb-input-init>
                <input
                  type="number"
                  id="editTotalCost"
                  class="form-control"
                  bind:value={editTransaction.total_cost}
                  on:input={(e) => {
                    let value = e.target.value;
                    if (value === '') {
                      editTransaction.total_cost = '';
                    } else {
                      editTransaction.total_cost = Number(value);
                    }
                    editTransaction.total_cost = editTransaction.quantity * editTransaction.unit_cost;
                  }} />
                <label class="form-label" for="editTotalCost">{t('Total Cost')}</label>
              </div>
              <select class="form-select mb-3 w-50" bind:value={editTransaction.currency}>
                <option value="" disabled>{t('Select Currency')}</option>
                {#each currencies as c}
                  <option value={c.code}>{t(c.code)}</option>
                {/each}
              </select>
            </div>
          </div>
          {#if enable_expiry_date}
            <div class="col-md-12 mb-4">
              <div class="input-group">
                <span class="input-group-text">{t('Expiry Date')}</span>
                <input type="date" class="form-control" bind:value={editTransaction.expiry_date} />
              </div>
            </div>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal"
          ><i class="bi bi-x"></i> {t('Close')}</button>
        <button type="button" class="btn btn-primary" data-mdb-ripple-init on:click={updateTransaction}>
          <i class="bi bi-check"></i> {t('Save changes')}</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>

  .product-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    padding: 6px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
  }

  .product-tabs__btn {
    flex: 1 1 auto;
    min-width: 0;
    padding: 10px 14px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #64748b;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .product-tabs__btn:hover {
    background: #f8fafc;
    color: #0f172a;
  }

  .product-tabs__btn--active {
    background: #eff6ff;
    color: #0f6efd;
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.15);
  }

 
  .product-tab-card {
    padding: 18px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
  }

  .product-tab-card--table {
    padding: 0;
    overflow: hidden;
  }

  .product-overview-card {
    display: grid;
    grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid #dde5ef;
    border-radius: 8px;
    background: #ffffff;
  }

  .product-overview-card--loading {
    min-height: 28rem;
  }

  .product-overview-card__image {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-width: 0;
    padding: 1.4rem;
    border-inline-end: 1px solid #e3e9f1;
    background:
      linear-gradient(#eef2f7 1px, transparent 1px),
      linear-gradient(90deg, #eef2f7 1px, transparent 1px),
      #f8fafc;
    background-size: 20px 20px;
  }

  .product-overview-card__img {
    width: 100%;
    max-width: 14rem;
    max-height: 17rem;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  }

  .product-overview-card__image-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    max-width: 100%;
    padding: 0.35rem 0.65rem;
    border: 1px solid #dce5f0;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.94);
    color: #52627a;
    font-size: 0.72rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-overview-card__image-label i {
    color: #0f6efd;
  }

  .product-overview-card__body {
    min-width: 0;
    padding: 1.25rem;
  }

  .product-overview-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .product-overview-card__heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .product-overview-card__section-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 7px;
    background: #eaf2ff;
    color: #0f6efd;
    font-size: 1rem;
  }

  .product-overview-card__eyebrow {
    display: block;
    margin-bottom: 0.1rem;
    color: #7b8ba5;
    font-size: 0.66rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .product-overview-card__name {
    margin: 0;
    color: #172033;
    font-size: 1.02rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-overview-card__edit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid #cfe0f7;
    border-radius: 6px;
    background: #ffffff;
    color: #0f6efd;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .product-overview-card__edit:hover {
    border-color: #9ec5fe;
    background: #eef5ff;
  }

  .product-price-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .product-price-card {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    min-height: 4.75rem;
    padding: 0.8rem;
    border: 1px solid #dce5f0;
    border-radius: 8px;
    background: #f8fafc;
  }

  .product-price-card--stock {
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .product-price-card--buy {
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .product-price-card--sell {
    border-color: #bbf7d0;
    background: #ecfdf5;
  }

  .product-price-card--warning {
    border-color: #fde68a;
    background: #fffbeb;
  }

  .product-price-card--danger {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .product-price-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 6px;
    background: #dbeafe;
    color: #0f6efd;
    font-size: 0.95rem;
  }

  .product-price-card--buy .product-price-card__icon {
    background: #ffedd5;
    color: #c2410c;
  }

  .product-price-card--sell .product-price-card__icon {
    background: #d1fae5;
    color: #047857;
  }

  .product-price-card--warning .product-price-card__icon {
    background: #fef3c7;
    color: #b45309;
  }

  .product-price-card--danger .product-price-card__icon {
    background: #fee2e2;
    color: #dc2626;
  }

  .product-price-card__content {
    display: block;
    min-width: 0;
  }

  .product-price-card__label {
    display: block;
    margin-bottom: 0.2rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .product-price-card__value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #0f172a;
    overflow: hidden;
    font-size: 0.94rem;
    font-weight: 800;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-price-card__value small {
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 650;
  }

  .amount-inline,
  :global(.amount-inline) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .product-details-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 1.15rem;
    border-top: 1px solid #e6ebf2;
  }

  .product-detail-section {
    min-width: 0;
    padding-top: 1rem;
  }

  .product-detail-section + .product-detail-section {
    padding-inline-start: 1.25rem;
    border-inline-start: 1px solid #e6ebf2;
  }

  .product-detail-section:first-child {
    padding-inline-end: 1.25rem;
  }

  .product-detail-section__title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.5rem;
    color: #344054;
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-detail-section__title i {
    color: #0f6efd;
    font-size: 0.9rem;
  }

  .product-meta-list {
    margin: 0;
  }

  .product-meta-list__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.25rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid #edf1f6;
  }

  .product-meta-list__row dt {
    margin: 0;
    color: #718096;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .product-meta-list__row dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    color: #1e293b;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: end;
  }

  .product-description-block {
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid #e6ebf2;
  }

  .product-batch-overview {
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid #e6ebf2;
  }

  .product-batch-overview__title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.65rem;
    color: #344054;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-batch-overview__title i {
    color: #0f6efd;
  }

  .product-batch-overview__empty {
    padding: 0.85rem;
    border: 1px dashed #d7e0ec;
    border-radius: 8px;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: center;
  }

  .product-description-block__title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.5rem;
    color: #344054;
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1.3;
  }

  .product-description-block__title i {
    color: #0f6efd;
  }

  .product-description-block__text {
    margin: 0;
    padding: 0.75rem 0.85rem;
    border-inline-start: 3px solid #93c5fd;
    background: #f7f9fc;
    color: #334155;
    font-size: 0.78rem;
    line-height: 1.65;
  }

  .product-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 24px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    text-align: center;
    color: #64748b;
  }

  .product-empty-state i {
    font-size: 2rem;
    color: #ef4444;
  }

  .product-empty-state h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #0f172a;
  }

  .product-empty-state p {
    margin: 0;
  }

  .product-empty-state--compact {
    padding: 24px;
  }

  .product-skeleton {
    border-radius: 8px;
    background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 50%, #eef2f7 75%);
    background-size: 200% 100%;
    animation: product-skeleton 1.2s ease-in-out infinite;
  }

  .product-skeleton--image {
    width: min(100%, 14rem);
    aspect-ratio: 1 / 1;
    border-radius: 8px;
  }

  .product-skeleton--title {
    width: min(55%, 15rem);
    height: 2.35rem;
    margin-bottom: 0.9rem;
  }

  .product-skeleton--metric {
    width: 100%;
    min-height: 4.75rem;
    margin-bottom: 1rem;
  }

  .product-skeleton--line {
    width: 100%;
    height: 0.85rem;
    margin-bottom: 0.65rem;
  }

  .product-skeleton--line.short {
    width: 70%;
  }

  @keyframes product-skeleton {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .product-tab-loading {
    min-height: 9rem;
  }

  .product-table-wrap {
    overflow: auto;
  }

  .product-table {
    width: 100%;
    border-collapse: collapse;
  }

  .product-table thead {
    background: #f8fafc;
  }

  .product-table th,
  .product-table td {
    padding: 12px 16px;
    border-bottom: 1px solid #eef2f7;
    text-align: start;
    font-size: 0.88rem;
    vertical-align: middle;
  }

  .product-table th {
    color: #64748b;
    font-weight: 700;
    white-space: nowrap;
  }

  .product-table tbody tr:hover {
    background: #fafcff;
  }

  .product-table__empty {
    padding: 32px 16px !important;
    text-align: center !important;
    color: #94a3b8;
  }

  .product-report-table {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
  }

  .product-report-table :global(.data-table-wrap) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
  }

  .product-report-table :global(th.report-col-id),
  .product-report-table :global(td.report-col-id) {
    width: 3.25rem;
    max-width: 3.25rem;
    white-space: nowrap;
  }

  .product-report-table :global(th.report-col-date),
  .product-report-table :global(td.report-col-date) {
    width: 8.5rem;
    max-width: 8.5rem;
    white-space: nowrap;
  }

  .product-table--report th,
  .product-table--report td {
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .product-table-toolbar {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(140px, 220px) auto;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .report-account-link {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 0.2rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      background-color 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;

    &:hover {
      border-color: rgba(47, 111, 237, 0.18);
      background: rgba(47, 111, 237, 0.07);
      box-shadow: 0 2px 8px rgba(47, 111, 237, 0.1);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
      box-shadow: none;
    }

    &:focus-visible {
      outline: none;
      border-color: #2f6fed;
      box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.16);
    }
  }

  :global([data-mdb-theme='dark']) {
    .report-account-link:hover {
      border-color: rgba(96, 165, 250, 0.25);
      background: rgba(96, 165, 250, 0.1);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
  }

  .product-table-toolbar__search,
  .product-table-toolbar__select,
  .product-table-toolbar__pages {
    height: 42px;
    border-radius: 10px;
    font-size: 0.88rem;
  }

  .product-table-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-top: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .product-table-footer__info {
    color: #64748b;
    font-size: 0.84rem;
  }

  .report-tab {
    display: grid;
    gap: 14px;
  }

  .report-tab__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  .report-kpi {
    padding: 14px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
  }

  .report-kpi__label {
    display: block;
    margin-bottom: 6px;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .report-kpi__value {
    display: block;
    color: #0f172a;
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.35;
  }

  .report-kpi__value small {
    margin-inline-start: 4px;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 600;
  }

  .report-kpi__value--in {
    color: #047857;
  }

  .report-kpi__value--out {
    color: #be123c;
  }

  .report-kpi__value--positive {
    color: #047857;
  }

  .report-kpi__value--balance {
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .report-panel {
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
  }

  .report-panel__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .report-panel__dates {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .report-panel__date {
    display: flex;
    align-items: stretch;
    min-width: 150px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }

  .report-panel__date .form-control {
    height: var(--control-height);
    border: none;
    box-shadow: none;
    font-size: 0.84rem;
  }

  .report-panel__chip {
    height: var(--control-height);
    padding: 0 14px;
    border: 1px solid #dbe3ef;
    border-radius: 999px;
    background: #ffffff;
    color: #475569;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-panel__chip:hover {
    background: #f8fafc;
  }

  .report-panel__search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 180px;
    min-width: 160px;
    height: var(--control-height);
    padding: 0 12px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    background: #ffffff;
    color: #94a3b8;
  }

  .report-panel__search {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 0.84rem;
    color: #0f172a;
  }

  .report-panel__select {
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid #dbe3ef;
    border-radius: 10px;
    background: #ffffff;
    font-size: 0.84rem;
  }

  .report-panel__select--pages {
    min-width: 110px;
  }

  .report-panel__pdf {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--control-height);
    margin-inline-start: auto;
    padding: 0 14px;
    border: 1px solid #fecaca;
    border-radius: 10px;
    background: #ffffff;
    color: #dc2626;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-panel__pdf:hover {
    background: #fef2f2;
  }

  .report-panel__table-wrap {
    overflow: auto;
  }

  .report-panel__table {
    width: 100%;
    border-collapse: collapse;
  }

  .report-panel__table th,
  .report-panel__table td {
    padding: 12px 14px;
    border-bottom: 1px solid #eef2f7;
    font-size: 0.84rem;
    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  .report-panel__table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: #64748b;
    font-weight: 700;
    background: #ffffff;
    box-shadow: 0 1px 0 #eef2f7;
  }

  .report-panel__table tbody tr:hover {
    background: #fafcff;
  }

  .sortable {
    cursor: pointer;
    user-select: none;
  }

  .report-panel__id {
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .report-panel__date {
    color: #475569;
  }

  .report-type-link {
    padding: 0;
    border: none;
    background: transparent;
    color: #0f6efd;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
  }

  .report-type-link:hover {
    text-decoration: underline;
  }

  :global(html.dark) .product-tabs,
  :global(html.dark) .product-tab-card,
  :global(html.dark) .product-overview-card,
  :global(html.dark) .product-empty-state,
  :global(html.dark) .report-kpi,
  :global(html.dark) .report-panel,
  :global([data-mdb-theme='dark']) .product-tabs,
  :global([data-mdb-theme='dark']) .product-tab-card,
  :global([data-mdb-theme='dark']) .product-overview-card,
  :global([data-mdb-theme='dark']) .product-empty-state,
  :global([data-mdb-theme='dark']) .report-kpi,
  :global([data-mdb-theme='dark']) .report-panel {
    border-color: #334762;
    background: #111827;
    color: #e5edf8;
  }

  :global(html.dark) .product-overview-card__image,
  :global([data-mdb-theme='dark']) .product-overview-card__image {
    border-color: #334762;
    background:
      linear-gradient(#233149 1px, transparent 1px),
      linear-gradient(90deg, #233149 1px, transparent 1px),
      #0f1726;
  }

  :global(html.dark) .product-tabs__btn,
  :global([data-mdb-theme='dark']) .product-tabs__btn {
    color: #94a3b8;
  }

  :global(html.dark) .product-tabs__btn:hover,
  :global([data-mdb-theme='dark']) .product-tabs__btn:hover {
    background: #172033;
    color: #f1f5f9;
  }

  :global(html.dark) .product-tabs__btn--active,
  :global([data-mdb-theme='dark']) .product-tabs__btn--active {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
    box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.28);
  }

  :global(html.dark) .product-overview-card__name,
  :global(html.dark) .product-detail-section__title,
  :global(html.dark) .product-description-block__title,
  :global(html.dark) .product-meta-list__row dd,
  :global(html.dark) .product-price-card__value,
  :global(html.dark) .product-empty-state h2,
  :global(html.dark) .report-kpi__value,
  :global([data-mdb-theme='dark']) .product-overview-card__name,
  :global([data-mdb-theme='dark']) .product-detail-section__title,
  :global([data-mdb-theme='dark']) .product-description-block__title,
  :global([data-mdb-theme='dark']) .product-meta-list__row dd,
  :global([data-mdb-theme='dark']) .product-price-card__value,
  :global([data-mdb-theme='dark']) .product-empty-state h2,
  :global([data-mdb-theme='dark']) .report-kpi__value {
    color: #f1f5f9;
  }

  :global(html.dark) .product-overview-card__eyebrow,
  :global(html.dark) .product-meta-list__row dt,
  :global(html.dark) .product-price-card__label,
  :global(html.dark) .product-price-card__value small,
  :global(html.dark) .product-empty-state,
  :global(html.dark) .report-kpi__label,
  :global(html.dark) .report-kpi__value small,
  :global(html.dark) .product-table-footer__info,
  :global([data-mdb-theme='dark']) .product-overview-card__eyebrow,
  :global([data-mdb-theme='dark']) .product-meta-list__row dt,
  :global([data-mdb-theme='dark']) .product-price-card__label,
  :global([data-mdb-theme='dark']) .product-price-card__value small,
  :global([data-mdb-theme='dark']) .product-empty-state,
  :global([data-mdb-theme='dark']) .report-kpi__label,
  :global([data-mdb-theme='dark']) .report-kpi__value small,
  :global([data-mdb-theme='dark']) .product-table-footer__info {
    color: #94a3b8;
  }

  :global(html.dark) .product-price-card,
  :global(html.dark) .product-description-block__text,
  :global(html.dark) .report-panel__date,
  :global(html.dark) .report-panel__chip,
  :global(html.dark) .report-panel__search-wrap,
  :global(html.dark) .report-panel__select,
  :global(html.dark) .report-panel__pdf,
  :global([data-mdb-theme='dark']) .product-price-card,
  :global([data-mdb-theme='dark']) .product-description-block__text,
  :global([data-mdb-theme='dark']) .report-panel__date,
  :global([data-mdb-theme='dark']) .report-panel__chip,
  :global([data-mdb-theme='dark']) .report-panel__search-wrap,
  :global([data-mdb-theme='dark']) .report-panel__select,
  :global([data-mdb-theme='dark']) .report-panel__pdf {
    border-color: #334762;
    background: #172033;
    color: #dbe7f7;
  }

  :global(html.dark) .product-details-grid,
  :global(html.dark) .product-detail-section + .product-detail-section,
  :global(html.dark) .product-description-block,
  :global(html.dark) .product-meta-list__row,
  :global(html.dark) .product-table-toolbar,
  :global(html.dark) .product-table-footer,
  :global(html.dark) .report-panel__toolbar,
  :global([data-mdb-theme='dark']) .product-details-grid,
  :global([data-mdb-theme='dark']) .product-detail-section + .product-detail-section,
  :global([data-mdb-theme='dark']) .product-description-block,
  :global([data-mdb-theme='dark']) .product-meta-list__row,
  :global([data-mdb-theme='dark']) .product-table-toolbar,
  :global([data-mdb-theme='dark']) .product-table-footer,
  :global([data-mdb-theme='dark']) .report-panel__toolbar {
    border-color: #2b3b52;
  }

  :global(html.dark) .product-table-toolbar,
  :global(html.dark) .product-table-footer,
  :global(html.dark) .report-panel__toolbar,
  :global([data-mdb-theme='dark']) .product-table-toolbar,
  :global([data-mdb-theme='dark']) .product-table-footer,
  :global([data-mdb-theme='dark']) .report-panel__toolbar {
    background: #172033;
  }

  :global(html.dark) .product-table thead,
  :global(html.dark) .report-panel__table thead th,
  :global([data-mdb-theme='dark']) .product-table thead,
  :global([data-mdb-theme='dark']) .report-panel__table thead th {
    background: #172033;
    color: #a9b7ca;
  }

  :global(html.dark) .product-table th,
  :global(html.dark) .product-table td,
  :global(html.dark) .report-panel__table th,
  :global(html.dark) .report-panel__table td,
  :global([data-mdb-theme='dark']) .product-table th,
  :global([data-mdb-theme='dark']) .product-table td,
  :global([data-mdb-theme='dark']) .report-panel__table th,
  :global([data-mdb-theme='dark']) .report-panel__table td {
    border-color: #2b3b52;
    color: #dbe7f7;
  }

  :global(html.dark) .product-table tbody tr:hover,
  :global(html.dark) .report-panel__table tbody tr:hover,
  :global([data-mdb-theme='dark']) .product-table tbody tr:hover,
  :global([data-mdb-theme='dark']) .report-panel__table tbody tr:hover {
    background: #1a2638;
  }

  :global(html.dark) .report-panel__search,
  :global([data-mdb-theme='dark']) .report-panel__search {
    color: #e5edf8;
  }

  .report-type {
    color: #475569;
    font-weight: 600;
  }

  .report-qty {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 999px;
    font-weight: 700;
  }

  .report-qty small {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .report-qty--in {
    background: #ecfdf5;
    color: #047857;
  }

  .report-qty--out {
    background: #fff1f2;
    color: #be123c;
  }

  .report-balance {
    font-weight: 700;
    line-height: 1.4;
  }

  .report-edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-inline-start: 6px;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #ffffff;
    color: #0f6efd;
    cursor: pointer;
    vertical-align: middle;
  }

  .report-panel__footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-top: 1px solid #eef2f7;
    background: #f8fafc;
  }

  .report-panel__info {
    color: #64748b;
    font-size: 0.82rem;
  }

  .report-panel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 24px;
    color: #94a3b8;
    text-align: center;
  }

  .report-panel__empty i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .report-panel__empty p {
    margin: 0;
    font-size: 0.9rem;
  }

  .cursor-pointer {
    cursor: pointer;
    user-select: none;
  }

  .sortable-heading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3125rem;
  }

  .sort-icon {
    color: #0f6efd;
    font-size: 0.75rem;
  }

  .report-summary-balance,
  .report-balance-cell {
    display: block;
    color: #334155;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.45;
    text-align: center;
  }

  .report-balance-cell {
    direction: ltr;
  }

  .report-balance-cell :global(.amount-negative),
  .report-summary-balance :global(.amount-negative) {
    color: #be123c;
  }

  .report-balance-cell :global(.amount-positive),
  .report-summary-balance :global(.amount-positive) {
    color: #047857;
  }

  :global(html.dark) .report-summary-balance,
  :global(html.dark) .report-balance-cell,
  :global([data-mdb-theme='dark']) .report-summary-balance,
  :global([data-mdb-theme='dark']) .report-balance-cell {
    color: #e8eef8;
  }

  :global(html.dark) .report-balance-cell :global(.amount-negative),
  :global(html.dark) .report-summary-balance :global(.amount-negative),
  :global([data-mdb-theme='dark']) .report-balance-cell :global(.amount-negative),
  :global([data-mdb-theme='dark']) .report-summary-balance :global(.amount-negative) {
    color: #fca5a5;
  }

  :global(html.dark) .report-balance-cell :global(.amount-positive),
  :global(html.dark) .report-summary-balance :global(.amount-positive),
  :global([data-mdb-theme='dark']) .report-balance-cell :global(.amount-positive),
  :global([data-mdb-theme='dark']) .report-summary-balance :global(.amount-positive) {
    color: #6ee7b7;
  }

  .report-muted-dash {
    color: #94a3b8;
  }

  .product-report-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  @media (max-width: 991px) {
    .product-overview-card {
      grid-template-columns: 1fr;
    }

    .product-overview-card__image {
      min-height: 15rem;
      border-inline-end: none;
      border-bottom: 1px solid #e5e7eb;
    }

    .product-overview-card__img {
      max-width: 12rem;
      max-height: 12rem;
    }

    .product-price-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .product-table-toolbar {
      grid-template-columns: 1fr;
    }

    .report-panel__pdf {
      margin-inline-start: 0;
      width: 100%;
      justify-content: center;
    }

    .report-panel__toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .product-report-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 767px) {
    .product-view-page {
      width: 100%;
      margin: 0;
      padding: 0.75rem;
    }

    .product-tabs__btn {
      flex: 1 1 calc(50% - 8px);
    }

    .product-price-grid {
      grid-template-columns: 1fr;
    }

    .product-details-grid {
      grid-template-columns: 1fr;
    }

    .product-detail-section:first-child {
      padding-inline-end: 0;
    }

    .product-detail-section + .product-detail-section {
      margin-top: 0.4rem;
      padding-inline-start: 0;
      border-inline-start: 0;
      border-top: 1px solid #e6ebf2;
    }

    .product-report-summary {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 480px) {
    .product-overview-card__body {
      padding: 1rem;
    }
  }
</style>
