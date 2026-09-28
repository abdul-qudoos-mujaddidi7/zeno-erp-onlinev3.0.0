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
  let directionalBalances = [];

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
    const directional = await accountApi.getDirectionalBalances({ account_ids: String(currentId) });
    directionalBalances = directional?.data || [];
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
    {#if Number(account?.can_be_customer) === 1 || Number(account?.can_be_supplier) === 1}
      <div class="directional-balances">
        {#each directionalBalances as balance}
          <div class="directional-balance-card">
            <strong>{t('Customer Receivable')}</strong>
            <span>{Number(balance.customer_receivable).toLocaleString()} {t(balance.currency)}</span>
          </div>
          <div class="directional-balance-card">
            <strong>{t('Supplier Payable')}</strong>
            <span>{Number(balance.supplier_payable).toLocaleString()} {t(balance.currency)}</span>
          </div>
          <div class="directional-balance-card">
            <strong>{t('Net Position')}</strong>
            <span>{Number(balance.net_position).toLocaleString()} {t(balance.currency)}</span>
          </div>
        {/each}
      </div>
    {/if}
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
    {#if Number(account?.can_be_customer) === 1 || account?.account_type_id == 4}
        <Sales account_id={id} embedded />
    {/if}
    {#if Number(account?.can_be_supplier) === 1 || account?.account_type_id == 3}
        <Purchases account_id={id} />
    {/if}
  {:else if page == 'products'}
    {#if Number(account?.can_be_customer) === 1 || Number(account?.can_be_supplier) === 1 || account?.account_type_id == 4 || account?.account_type_id == 3}
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
  .directional-balances { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin:16px; }
  .directional-balance-card { display:flex; flex-direction:column; gap:6px; padding:16px; border:1px solid #dbe3ef; border-radius:12px; background:#fff; }
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
