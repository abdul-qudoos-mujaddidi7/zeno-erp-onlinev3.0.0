<script>
  import { onMount } from 'svelte';
  import UnitCategoryModal from './UnitCategoryModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import {t,lang,translate_org_type,shortID,} from '../../i18n/i18n';
  import { unitCategoryApi } from '../../api/unitCategoryApi.js';
  import { productUnitApi } from '../../api/productUnitApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let unitCategories = [];
  let loading = true;
  let modalRef = null;

  /* How many active units each category holds, so an empty category is
   * visibly safe to delete and a used one can be seen before trying. */
  let unitCounts = {};

  async function loadUnitCategories() {
    loading = true;

    try {
      const [categoriesResponse, unitsResponse] = await Promise.all([
        unitCategoryApi.getAll({ status: 1 }),
        productUnitApi.getAll({ status: 1 }),
      ]);

      unitCategories = categoriesResponse?.data || [];

      unitCounts = (unitsResponse?.data || []).reduce(
        (counts, unit) => {
          const categoryId = Number(unit.unit_category_id || 0);

          if (categoryId) {
            counts[categoryId] = (counts[categoryId] || 0) + 1;
          }

          return counts;
        },
        {},
      );
    } catch (err) {
      console.error(
        'Failed to load unit categories:',
        err,
      );

      unitCategories = [];
      unitCounts = {};
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadUnitCategories();
  });
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Unit Categories')}
  showFooter={false}
  dense={true}
  contained={true}
  contentClass="unit-categories-index-content"
  tablePadding={true}
>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('Create Unit Category')}`}
      on:click={() => {
        modalRef?.openUnitCategoryModal();
      }}
    />
  </svelte:fragment>

  {#if loading}
    <TableSkeleton ariaLabel={t('Loading...')} colCount={5} minWidth="720px" />
  {:else if unitCategories.length === 0}
    <div class="index-table-state">
      <EmptyState
        icon="bi-diagram-2"
        message={t('No unit categories found.')}
      />
    </div>
  {:else}
    <DataTable ariaLabel={t('Unit Categories')} minWidth="720px">
      <svelte:fragment slot="head">
        <tr>
          <th>{t('ID')}</th>
          <th>{t('Name')}</th>
          <th class="col-end">{t('Units')}</th>
          <th>{t('Description')}</th>
          <th class="col-end">{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each unitCategories as unitCategory (unitCategory.id)}
        {#if Number(unitCategory.status) !== 0}
          <tr>
            <td class="cell-muted">{shortID(unitCategory.id)}</td>

            <td>{unitCategory.name}</td>

            <td class="col-end">
              {unitCounts[Number(unitCategory.id)] || 0}
            </td>

            <td>
              <strong>
                {unitCategory.description || ''}
              </strong>
            </td>

            <td class="col-end">
              <TableActions
                actions={[
                  {
                    icon: 'bi-pencil',
                    label: t('Edit'),
                    tone: 'edit',
                    onClick: () => modalRef?.editUnitCategory(unitCategory),
                  },
                ]} />
            </td>
          </tr>
        {/if}
      {/each}
    </DataTable>
  {/if}
</IndexPageLayout>

<UnitCategoryModal
  bind:this={modalRef}
  on:saved={loadUnitCategories}
/>
