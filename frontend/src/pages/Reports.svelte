<script>
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';

  import { showDate, setDatePickers } from '../calendar.js';
  import {generatePDF,generatingPDF} from './generatePDF.js';

  import { t, lang, translate_org_type } from '../i18n/i18n';
import { productApi } from '../api/productApi.js';
import { saleApi } from '../api/saleApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let loading = true;
  let sales = [];
  let products = [];

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let fromDate = '';
  let toDate = '';

  
  async function load() {
    loading = true;
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    // Order sales by invoice_date descending so newest appear first
    sales = (await saleApi.getAll({ status: 1 }))?.data || [];
    sales = sales.filter((s) => s.status == 1);
    loading = false;
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }
  onMount(async () => {
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

  $: filteredSales = (() => {
    let result = sales.filter((s)=>{
         return s.invoice_status == 'confirmed';
    });
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

    return result;
  })();

</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button on:click={()=>{generatePDF(filteredSales,fromDate,toDate)}} disabled={generatingPDF} class="btn btn-dark btn-sm me-2 float-end">
    {#if generatingPDF}
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">${t('Generating...')}</span>
      </div>
    {:else}
      <i class="bi bi-file-pdf-fill"></i>
      Generate PDF
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
{/if}

<div class="pdf-container">
  <table class="table table-bordered">
    <thead>
      <tr>
        <th>شماره</th>
        <th>نام مشتری</th>
        <th>تاریخ</th>
        <th>مبلغ کل</th>
        <th>وضعیت</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredSales as s, i}
        <tr>
          <td>{i + 1}</td>
          <td>{s.customer_name}</td>
          <td>{s.invoice_date}</td>
          <td>{s.total_amount}</td>
          <td>{s.invoice_status}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .pdf-container {
    font-family: 'Vazirmatn', sans-serif; /* make sure font is loaded */
    direction: rtl;
    text-align: right;
  }
</style>
