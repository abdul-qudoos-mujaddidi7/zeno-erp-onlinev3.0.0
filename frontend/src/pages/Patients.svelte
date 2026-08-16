<script>
  import { onMount } from "svelte";
  import PatientsIndex from "./hospital/patients/PatientsIndex.svelte";
  // import AllPatientsReport from "./hospital/patients/AllPatientsReport.svelte";
  // import GeneralReport from "./hospital/patients/GeneralReport.svelte";
  // import PatientTypes from "./patients/PatientTypes.svelte";

  import { API_URL } from "../config.js";
  export let page = 'list';

  import { t, lang, translate_org_type } from "../i18n/i18n.js";

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

</script>

{#if page == 'list'}
  <PatientsIndex />
{:else if page == 'report'}
  <!-- <AllPatientsReport /> -->
{:else if page == 'general-report'}
  <!-- <GeneralReport /> -->
{/if}