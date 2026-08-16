<script>
    import { onMount } from "svelte";
    import { push } from "svelte-spa-router";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    import { showDate } from "../../calendar.js";

    export let page = 'list';

    import LabTestCategories from "./labtests/LabTestCategories.svelte";

    import LabTestTypes from "./labtests/LabTestTypes.svelte";

    import LabTestsIndex from "./labtests/LabTestsIndex.svelte";

</script>

<ul class="nav nav-tabs mb-3 bg-body-tertiary border shadow-sm rounded" role="tablist" style="--tab-bg-color: var(--mdb-primary-bg-subtle);--tab-text-color: var(--mdb-primary-text-emphasis)">
   
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='list'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'list';
            }}
        >
            {t("Lab Tests")}
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='types'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'types';
            }}
        >
            {t("Lab Tests Types")}
        </button>
    </li>
    <li class="nav-item" role="presentation">
        <button
            class="nav-link {page=='categories'?"active":""} py-2"
            type="button"
            on:click={() => {
                page = 'categories';
            }}
        >
            {t("Categories")}
        </button>
    </li>
</ul>

{#if page === 'list'}


    <LabTestsIndex />
{:else if page === 'types'}
    <LabTestTypes />
{:else if page === 'categories'}
    <LabTestCategories />

{/if}
<style>
.nav-link.active {
  background-color:var(--tab-bg-color);
  color: var(--tab-text-color);
  border-color:var(--tab-text-color);
}
</style>


<!-- Button -->
