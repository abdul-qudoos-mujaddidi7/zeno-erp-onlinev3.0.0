<script>
    import { productUnitApi } from "../../api/productUnitApi.js";
    import { onMount } from "svelte";
    import UnitModal from "./UnitModal.svelte";
    import PaginationBar from "../../components/common/PaginationBar.svelte";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n";
    import { DEFAULT_PAGE_SIZE } from "../../lib/pagination.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    let units = [];
    let loading = true;

    let unitModalRef = null;
    let currentPage = 1;
    let itemsPerPage = DEFAULT_PAGE_SIZE;

    async function loadUnits() {
        loading = true;
        try {
            units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
            console.log(units);
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadUnits();
    });

    function getPageNumbers(current, total) {
        const range = [];
        const compact = [];
        let previous;

        for (let page = 1; page <= total; page += 1) {
            if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) range.push(page);
        }
        for (const page of range) {
            if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : "...");
            compact.push(page);
            previous = page;
        }
        return compact;
    }

    $: totalPages = Math.ceil(units.length / itemsPerPage);
    $: if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    $: paginatedUnits = units.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

</script>

<section class="units-page">
<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("Units")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{unitModalRef.openUnitModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create Unit")}
    </button>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        {#if loading}
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0 settings-index-table">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Code")}</th>
                            <th>{t("Subunit")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedUnits as unit}
                            <tr>
                                <td>{shortID(unit.id)}</td>
                                <td>{unit.name}</td>
                                <td><strong>{unit.code}</strong></td>
                                <td>
                                    {#if unit.subunit_id}
                                {Number(unit.subunit_multiple||0).toLocaleString(undefined,{maximumFractionDigits:6})}
                                        {#each units as u}
                                            {#if Number(u.id) === Number(unit.subunit_id)}
                                                {u.name}
                                            {/if}
                                        {/each}
                                    {:else}
                                        
                                    {/if}
                                </td>
                                <td>
                                    <button
                                        class="btn btn-sm btn-outline-secondary me-1"
                                        on:click={() => unitModalRef.editUnit(unit)}
                                    >
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <!-- <button
                                        class="btn btn-sm btn-outline-danger"
                                        on:click={() =>
                                            deleteUnit(unit.id)}
                                    >
                                        <i class="bi bi-trash"></i>
                                    </button> -->
                                </td>
                            </tr>
                        {/each}
                        {#if units.length === 0}
                            <tr>
                                <td
                                    colspan="9"
                                    class="text-center text-muted p-4"
                                    >No units found.</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
    {#if !loading && units.length > 0}
        <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={units.length}
            ariaLabel={t("Units pagination")}
            rowLabel={t("rows")}
            on:perPageChange={(event) => {
                itemsPerPage = Number(event.detail);
                currentPage = 1;
            }}
            {getPageNumbers} />
    {/if}
</div>
</section>

<UnitModal bind:this={unitModalRef} on:saved={loadUnits} />

<style>
    .units-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
    }

    .units-page > :global(.card) {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    }

    .units-page > :global(.card > .card-body) {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
    }

    .units-page :global(.table-responsive) {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        scrollbar-width: thin;
    }

    .units-page :global(.table-responsive thead th) {
        position: sticky;
        top: 0;
        z-index: 2;
    }
</style>
