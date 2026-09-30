<script>
  import { onMount } from 'svelte';
  import UnitCategoryModal from './UnitCategoryModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
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
  toolbarWidth="25rem"
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
    <div class="index-table-state">
      <EmptyState
        loading
        message={t('Loading...')}
      />
    </div>
  {:else if unitCategories.length === 0}
    <div class="index-table-state">
      <EmptyState
        icon="bi-diagram-2"
        message={t('No unit categories found.')}
      />
    </div>
  {:else}
    <div class="table-responsive">
      <table
        class="table table-hover mb-0 settings-index-table"
      >
        <thead class="table-light">
          <tr>
            <th>{t('ID')}</th>
            <th>{t('Name')}</th>
            <th>{t('Units')}</th>
            <th>{t('Description')}</th>
            <th>{t('Actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each unitCategories as unitCategory}
            {#if Number(unitCategory.status) !== 0}
              <tr>
                <td>{shortID(unitCategory.id)}</td>

                <td>{unitCategory.name}</td>

                <td>
                  {unitCounts[Number(unitCategory.id)] || 0}
                </td>

                <td>
                  <strong>
                    {unitCategory.description || ''}
                  </strong>
                </td>

                <td>
                  <button
                    class="btn btn-sm btn-outline-secondary me-1"
                    on:click={() => {
                      modalRef?.editUnitCategory(
                        unitCategory,
                      );
                    }}
                  >
                    <i class="bi bi-pencil"></i>
                  </button>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</IndexPageLayout>

<UnitCategoryModal
  bind:this={modalRef}
  on:saved={loadUnitCategories}
/>
