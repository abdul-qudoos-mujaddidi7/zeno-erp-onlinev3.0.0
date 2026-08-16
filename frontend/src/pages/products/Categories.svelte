<script>
  import { onMount } from 'svelte';
  import CategoryModal from './CategoryModal.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import {t,lang,translate_org_type,shortID,} from '../../i18n/i18n';
  import { productCategoryApi } from '../../api/productCategoryApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let productCategories = [];
  let loading = true;
  let modalRef = null;

  async function loadProductCategories() {
    loading = true;

    try {
      const response = await productCategoryApi.getAll({
        status: 1,
      });

      productCategories = response?.data || [];
    } catch (err) {
      console.error(
        'Failed to load product categories:',
        err,
      );

      productCategories = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadProductCategories();
  });
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Product Categories')}
  toolbarWidth="25rem"
  showFooter={false}
  dense={true}
  contained={true}
  contentClass="categories-index-content"
  tablePadding={true}
>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('Create Product Category')}`}
      on:click={() => {
        modalRef?.openProductCategoryModal();
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
  {:else if productCategories.length === 0}
    <div class="index-table-state">
      <EmptyState
        icon="bi-tags"
        message={t('No product categories found.')}
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
            <th>{t('Description')}</th>
            <th>{t('Actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each productCategories as category}
            {#if Number(category.status) !== 0}
              <tr>
                <td>{shortID(category.id)}</td>
                

                <td>{category.name}</td>

                <td>
                  <strong>
                    {category.description || ''}
                  </strong>
                </td>

                <td>
                  <button
                    class="btn btn-sm btn-outline-secondary me-1"
                    on:click={() => {
                      modalRef?.editProductCategory(
                        category,
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

<CategoryModal
  bind:this={modalRef}
  on:saved={loadProductCategories}
/>