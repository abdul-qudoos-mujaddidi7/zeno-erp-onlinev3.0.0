<script>
    import { productUnitApi } from "../../api/productUnitApi.js";
    import { unitCategoryApi } from "../../api/unitCategoryApi.js";
    import { onMount } from "svelte";
    import UnitModal from "./UnitModal.svelte";
    import PaginationBar from "../../components/common/PaginationBar.svelte";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import DataTable from "../../components/common/DataTable.svelte";
    import TableActions from "../../components/common/TableActions.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";
    import TableSkeleton from "../../components/common/TableSkeleton.svelte";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n";
    import { DEFAULT_PAGE_SIZE } from "../../lib/pagination.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    let units = [];
    let unitCategories = [];
    let loading = true;

    function categoryName(categoryId) {
        return (
            unitCategories.find((category) => Number(category.id) === Number(categoryId))
                ?.name || "-"
        );
    }

    let unitModalRef = null;
    let currentPage = 1;
    let itemsPerPage = DEFAULT_PAGE_SIZE;

    async function loadUnits() {
        loading = true;
        try {
            const [unitsResponse, categoriesResponse] = await Promise.all([
                productUnitApi.getAll({ status: 1 }),
                unitCategoryApi.getAll({ status: 1 }),
            ]);

            units = unitsResponse?.data || [];
            unitCategories = categoriesResponse?.data || [];
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

<IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Units')}
    showFooter={!loading && units.length > 0}
    dense={true}
    contained={true}
    contentClass="units-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton
            icon="bi-plus-lg"
            label={`+ ${t('Create Unit')}`}
            on:click={() => unitModalRef?.openUnitModal()} />
    </svelte:fragment>

    {#if loading}
        <TableSkeleton ariaLabel={t('Loading...')} colCount={6} minWidth="760px" />
    {:else if units.length === 0}
        <div class="index-table-state">
            <EmptyState icon="bi-rulers" message={t('No units found.')} />
        </div>
    {:else}
        <DataTable ariaLabel={t('Units')} minWidth="760px">
            <svelte:fragment slot="head">
                <tr>
                    <th>{t('ID')}</th>
                    <th>{t('Name')}</th>
                    <th>{t('Code')}</th>
                    <th>{t('Unit Category')}</th>
                    <th class="col-end">{t('Subunit')}</th>
                    <th class="col-end">{t('Actions')}</th>
                </tr>
            </svelte:fragment>

            {#each paginatedUnits as unit (unit.id)}
                <tr>
                    <td class="cell-muted">{shortID(unit.id)}</td>
                    <td>{unit.name}</td>
                    <td><strong>{unit.code}</strong></td>
                    <td>{categoryName(unit.unit_category_id)}</td>
                    <td class="col-end">
                        {#if unit.subunit_id}
                            <span dir="ltr">
                                {Number(unit.subunit_multiple || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                            </span>
                            {#each units as u}
                                {#if Number(u.id) === Number(unit.subunit_id)}
                                    {u.name}
                                {/if}
                            {/each}
                        {/if}
                    </td>
                    <td class="col-end">
                        <TableActions
                            actions={[
                                {
                                    icon: 'bi-pencil',
                                    label: t('Edit'),
                                    tone: 'edit',
                                    onClick: () => unitModalRef?.editUnit(unit),
                                },
                            ]} />
                    </td>
                </tr>
            {/each}
        </DataTable>
    {/if}

    <svelte:fragment slot="footer">
        <PaginationBar
            bind:currentPage
            {totalPages}
            {itemsPerPage}
            totalItems={units.length}
            ariaLabel={t('Units pagination')}
            rowLabel={t('rows')}
            on:perPageChange={(event) => {
                itemsPerPage = Number(event.detail);
                currentPage = 1;
            }}
            {getPageNumbers} />
    </svelte:fragment>
</IndexPageLayout>

<UnitModal bind:this={unitModalRef} on:saved={loadUnits} />
