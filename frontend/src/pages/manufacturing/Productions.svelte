<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { productionApi } from '../../api/productionApi.js';
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type,shortID } from '../../i18n/i18n.js';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let productions = [];
  let currencies = [];


  let accounts = [];

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }


  let warehouses = [];
  let productionId = null;
  let loading = true;
  let products = [];
  let units = [];

  // --- Table State ---
  let searchTerm = '';
  let filterStatus = 'all'; // 'all', 'confirmed', 'draft', etc.
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  async function load() {
    loading = true;
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    productions = (await productionApi.getAll({ status: 1 }))?.data || [];

    loading = false;
  }

  onMount(async () => {
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

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

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  // let fromDate = getLocalDate();
  // let toDate = getLocalDate();

  let fromDate = "";
  let toDate = "";
  // Reactive computed list
  $: filteredProductions = (() => {
    let result = productions.filter((s) => {
      const productionDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's productions
      if (from && to && from.getTime() === to.getTime()) {
        return productionDate.toDateString() === from.toDateString();
      }
      if (from && productionDate < from) return false;
      if (to && productionDate > to) return false;
      return true;
    });

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.production_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.production_number && String(s.production_number).toLowerCase().includes(term)) ||
          (s.description && s.description.toLowerCase().includes(term)) ||
          (s.id && String(s.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      if (sortColumn == 'total_amount') {
        const valA = Number(a[sortColumn]) || 0;
        const valB = Number(b[sortColumn]) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      let valA = a[sortColumn];
      let valB = b[sortColumn];

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

  $: paginatedProductions = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredProductions.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredProductions.length / itemsPerPage);

  $: if (searchTerm || filterStatus) currentPage = 1;


  let totalProductionsAmount = {};
  // consider currency if you have multi currency support
  $: totalProductionsAmount = filteredProductions.reduce((totals, s) => {
    if (!s.production_status || s.production_status !== 'confirmed') return totals; // Skip cancelled or invalid productions
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});

  async function getProductionItems(id) {
    const full = (await productionApi.getById(id))?.data || null;
    return (full?.items || []).filter((item) => Number(item.status) === 1);
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

  let totalBenefitAmount = {};
let benefitRun = 0;

async function calculateBenefit() {
  const runId = ++benefitRun;

  const updatedProductions = await Promise.all(
    filteredProductions.map(async (s) => {
      if (!s.production_status || s.production_status !== 'confirmed') {
        return { ...s, benefits: null };
      }

      const productionItems = await getProductionItems(s.id);

      let totalCost = 0;
      let benefits = {};
      benefits[s.currency] = 0;

      for (const item of productionItems) {
        let product = products.find((p) => p.id === item.product_id);
        if (!product) continue;

        let costPrice = Number(product.buy_price) || 0;

        if (product.buy_currency != s.currency) {
          costPrice =
            exchangeRate(costPrice, product.buy_currency, s.currency) || 0;
        }

        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(
            Number(item.product_unit_id),
            Number(product.product_unit_id)
          );
          costPrice = multiple * costPrice;
        }

        const profit =
          (Number(item.unit_price) - costPrice) *
          Number(item.quantity);

        benefits[s.currency] += profit;
        totalCost += costPrice * Number(item.quantity);
      }

      return {
        ...s,
        benefits,
      };
    })
  );

  $: totalBenefitAmount = filteredProductions.reduce((totals, s) => {
  if (!s.production_status || s.production_status !== 'confirmed') return totals;
  if (!s.benefits) return totals;

  for (const [currency, amount] of Object.entries(s.benefits)) {
    if (!totals[currency]) totals[currency] = 0;
    totals[currency] += Number(amount) || 0;
  }

  return totals;
}, {});

  // prevent race condition
  if (runId !== benefitRun) return;

  // 🔥 important: reassign
  productions = productions.map((s) => {
    const updated = updatedProductions.find((u) => u.id === s.id);
    return updated ? updated : s;
  });
}
  $: if (filteredProductions.length && products.length) {
    calculateBenefit();
  }
</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('productions', filteredProductions, fromDate, toDate,filteredProductions.length,totalProductionsAmount,totalBenefitAmount);
    }}
    disabled={generatingPDF}
    class="btn btn-outline-danger btn-sm me-2 px-2 float-end">
    {#if generatingPDF}
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">${t('Generating...')}</span>
      </div>
    {:else}
      <i class="bi bi-file-pdf-fill"></i>
      {t('PDF')}
    {/if}
  </button>
  <div class="row">
    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="fromDate" bind:value={fromDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="toDate" bind:value={toDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>
  </div>
  <div class="m-3 d-flex gap-3 flex-wrap">
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Productions Count')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredProductions.length}
          {filteredProductions.length < 2 ? t('Production') : t('Productions')}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>{t('Total Productions Amount')}</small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html Object.entries(totalProductionsAmount)
            .map(
              ([currency, amount]) =>
                `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${t(currency)}`,
            )
            .join(' <br> ')}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>{t('Total Benefit Amount')}</small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html Object.entries(totalBenefitAmount)
            .map(
              ([currency, amount]) =>
                `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${t(currency)}`,
            )
            .join(' <br> ')}
        </small>
      </div>
    </div>
  </div>
  <div class="card shadow-2">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-4">
          <input type="text" class="form-control" placeholder={t('Search productions...')} bind:value={searchTerm} />
        </div>

        <div class="col-md-3">
          <select class="form-select" bind:value={filterStatus}>
            <option value="all">{t('All Statuses')}</option>
            <option value="confirmed">{t('Confirmed')}</option>
            <option value="draft">{t('Draft')}</option>
            <option value="cancelled">{t('Cancelled')}</option>
          </select>
        </div>

        <div class="col-md-2 offset-md-1 text-end">
          <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
          </select>
        </div>
        <div class="col-md-2">
          <button class="btn btn-primary w-100" on:click={() => push(`/dashboard/production-form/0`)}
            ><i class="bi bi-plus-circle me-2"></i>{t('New Production')}</button>
        </div>
      </div>
    </div>

    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('production_number')}
                >{t('Invoice #')}{#if sortColumn === 'production_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('product_id')}
                >{t('Product')}{#if sortColumn === 'product_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('quantity')}
                >{t('Quantity')}{#if sortColumn === 'quantity'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}
                >{t('Total Cost')}{#if sortColumn === 'total_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('warehouse_id')}
                >{t('Warehouse')}{#if sortColumn === 'warehouse_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center">{t('Status')}</th>
              <th width="150" class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedProductions as s}
              <tr>
                <td class="ps-4 text-muted small">{shortID(s.id)}</td>
                <td class="text-center">{@html showDate(s.created_at)}</td>
                 
                <td class="text-center">
                  <button 
                  on:click={push(`/dashboard/productions/${s.id}`)}
                  
                  class="btn btn-link btn-sm"
                  
                    >{s.production_number}</button
                  >
                
                
                </td>
                 <td class="text-center"
                  >
                <span
                    on:click={push(`/dashboard/product/${s.product_id}`)}
                    style="cursor:pointer"
                    class="badge badge-success">
                    {products.find(a=>a.id==s.product_id)?.name}
                  </span></td>


                <td class="text-center fw-bold"
                  >{Number(s.quantity).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {units.find(u=>u.id==s.product_unit_id)?.name}</td>
              
                   
                <td class="text-center fw-bold"
                  >{Number(s.total_amount).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {t(s.currency)}</td>


              
              
              

                <td class="text-center fw-bold"
                  >{warehouses.find(w=>w.id==s.warehouse_id)?.name || "-"}</td>

                <td class="text-center"
                  ><span class="badge badge-{s.production_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(s.production_status)}</span
                  ></td>

               
                <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    on:click={() => push(`/dashboard/productions/${s.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>
                  {#if s.production_status === 'draft'}
                    <button class="btn btn-sm btn-warning" on:click={() => push(`/dashboard/production-form/` + s.id)}
                      >{t('Edit')}</button>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if filteredProductions.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No productions found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    {#if !loading && filteredProductions.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredProductions.length)}
          {t('of')}
          {filteredProductions.length}
          {t('entries')}
        </div>
        <nav>
          <ul class="pagination pagination-circle pagination-sm mb-0">
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage = 1)}
                ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
            </li>
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage -= 1)}
                ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
            </li>

            {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
              {#if pageNum === '...'}
                <li class="page-item disabled">
                  <span class="page-link">...</span>
                </li>
              {:else}
                <li class="page-item" class:active={currentPage === pageNum}>
                  <button class="page-link" on:click={() => (currentPage = pageNum)}>{pageNum}</button>
                </li>
              {/if}
            {/each}

            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage += 1)}
                ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
            </li>
            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage = totalPages)}
                ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
            </li>
          </ul>
        </nav>
      </div>
    {/if}
  </div>
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .pagination-circle .page-link {
    border-radius: 50% !important;
    margin-left: 3px;
    margin-right: 3px;
    border: none;
  }
</style>
