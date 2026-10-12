<script>
  import AsyncPage from "../components/AsyncPage.svelte";
  import { onMount } from "svelte";

  import { API_URL } from "../config.js";
  export let page = 'list';

  import { t, lang, translate_org_type } from "../i18n/i18n.js";
  const loadBuildingsIndex = () => import('./apartments/buildings_index.svelte');
  const loadFloorsIndex = () => import('./apartments/floors_index.svelte');
  const loadApartmentsIndex = () => import('./apartments/apartments_index.svelte');
  const loadLeasesIndex = () => import('./apartments/leases_index.svelte');
  const loadRentInvoicesIndex = () => import('./apartments/rent_invoices_index.svelte');
  const loadMetersIndex = () => import('./apartments/meters_index.svelte');
  const loadMeterReadingsIndex = () => import('./apartments/meter_readings_index.svelte');
  const loadInventoryRecords = () => import('./InventoryRecords.svelte');

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

</script>

{#if page == 'list'}
  <AsyncPage loader={loadApartmentsIndex} />
{:else if page == 'floors'}
  <AsyncPage loader={loadFloorsIndex} />
{:else if page == 'buildings'}
  <AsyncPage loader={loadBuildingsIndex} />
{:else if page == 'leases'}
  <AsyncPage loader={loadLeasesIndex} />
{:else if page == 'rent-invoices'}
  <AsyncPage loader={loadRentInvoicesIndex} />
{:else if page == 'meters'}
  <AsyncPage loader={loadMetersIndex} />
{:else if page == 'meter-readings'}
  <AsyncPage loader={loadMeterReadingsIndex} />
{:else if page == 'records'}
  <AsyncPage loader={loadInventoryRecords} />
{/if}