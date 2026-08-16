<script>
  import { onMount, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import AppointmentsIndex from './hospital/appointments/AppointmentsIndex.svelte';
  import AppointmentsReport from './hospital/appointments/AppointmentsReport.svelte';

  export let page = 'list';
</script>

{#if page == 'list'}
  <AppointmentsIndex />
{:else if page == 'report'}
  <AppointmentsReport />
{/if}
