<script>
  import { onMount, onDestroy } from 'svelte';
  import { accountApi } from '../../api/accountApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import AccountBalance from './AccountBalance.svelte';
  import JournalsIndex from '../journals/JournalsIndex.svelte';
  import AccountReport from './AccountReport.svelte';
  import Sales from '../Sales.svelte';
  import Purchases from '../Purchases.svelte';
  import ProductsReport from './ProductsReport.svelte';
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
  import AccountDocuments from './AccountDocuments.svelte';
  import AppointmentsIndex from '../hospital/appointments/AppointmentsIndex.svelte';
  import LeasesIndex from '../apartments/leases_index.svelte';
  import InventoryRecords from '../InventoryRecords.svelte';

  import MeterReadingsIndex from '../apartments/meter_readings_index.svelte';

  export let id;

  import RentInvoicesIndex from '../apartments/rent_invoices_index.svelte';
    import ApartmentsIndex from '../apartments/apartments_index.svelte';

  let account = null;

  export let page = 'info';

  function syncPageFromHash() {
    const hash = window.location.hash || '';
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    page = new URLSearchParams(query).get('tab') || 'info';
  }

  async function loadAccount(currentId) {
    if (!currentId) return;
    const response = await accountApi.getById(currentId);
    account = response?.data || null;
  }
  $: if (id) {
    loadAccount(id);
  }

  onMount(async () => {
    syncPageFromHash();
    window.addEventListener('hashchange', syncPageFromHash);
    await loadAccount(id);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', syncPageFromHash);
  });

</script>

{#if !permissions?.some((p) => p.code === 'Accounts' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
  {#if page == 'info'}
    <AccountBalance {id} />
  {:else if page == 'documents'}
    <div class="account-documents-index">
      <AccountDocuments {id} />
    </div>
  {:else if page == 'appointments'}
    {#if account?.account_type_id == 4 && account?.patient_type_id}
      <AppointmentsIndex patient_id={id} />
    {/if}
  {:else if page == 'journals'}
    <div class="account-journals-index">
      <JournalsIndex account_id={id} />
    </div>
  {:else if page == 'financial-report'}
    <AccountReport {id} />
  {:else if page == 'bills'}
    {#if account?.account_type_id == 4 || account?.account_type_id == 3}
      {#if account?.account_type_id == 4}
        <Sales account_id={id} embedded />
      {:else if account?.account_type_id == 3}
        <Purchases account_id={id} />
      {/if}
    {/if}
  {:else if page == 'products'}
    {#if account?.account_type_id == 4 || account?.account_type_id == 3}
      <ProductsReport account_id={id} />
    {/if}
  {:else if page == 'apartments'}
      <ApartmentsIndex account_id={id} />
  {:else if page == 'leases'}
      <LeasesIndex account_id={id} />
  {:else if page == 'rent-invoices'}
      <RentInvoicesIndex account_id={id} />


  {:else if page == 'meter-readings'}
      <MeterReadingsIndex account_id={id} />
  {:else if page == 'inventory-records'}
      <InventoryRecords account_id={id} />
  {/if}
{/if}
<style>
  .account-journals-index {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .account-documents-index {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .account-journals-index :global(.journals-page) {
    flex: 1 1 auto;
  }
</style>
