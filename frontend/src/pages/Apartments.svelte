<script>
  import { onMount } from "svelte";

  import { API_URL } from "../config.js";
  export let page = 'list';

  import { t, lang, translate_org_type } from "../i18n/i18n.js";
  import BuildingsIndex from "./apartments/buildings_index.svelte";
  import FloorsIndex from "./apartments/floors_index.svelte";
  import ApartmentsIndex from "./apartments/apartments_index.svelte";
  import LeasesIndex from "./apartments/leases_index.svelte";
  import RentInvoicesIndex from "./apartments/rent_invoices_index.svelte";
  import MetersIndex from "./apartments/meters_index.svelte";
  import MeterReadingsIndex from "./apartments/meter_readings_index.svelte";
  import InventoryRecords from "./InventoryRecords.svelte";

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

</script>

{#if page == 'list'}
  <ApartmentsIndex />
{:else if page == 'floors'}
  <FloorsIndex />
{:else if page == 'buildings'}
  <BuildingsIndex />
{:else if page == 'leases'}
  <LeasesIndex />
{:else if page == 'rent-invoices'}
  <RentInvoicesIndex />
{:else if page == 'meters'}
  <MetersIndex />
{:else if page == 'meter-readings'}
  <MeterReadingsIndex />
{:else if page == 'records'}
  <InventoryRecords />
{/if}