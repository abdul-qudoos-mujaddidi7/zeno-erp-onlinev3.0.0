<script>
  import { onMount } from 'svelte';

  import {
    productBrandApi,
  } from '../../api/productBrandApi.js';

  import BrandModal
    from './BrandModal.svelte';

  import IndexPageLayout
    from '../../lib/components/index/IndexPageLayout.svelte';

  import ActionButton
    from '../../components/common/ActionButton.svelte';

  import EmptyState
    from '../../components/common/EmptyState.svelte';

  import {
    t,
    lang,
    translate_org_type,
  } from '../../i18n/i18n.js';

  $: _lang = $lang;
  $: _translate_org_type =
    $translate_org_type;

  let productBrands = [];
  let loading = true;
  let modalRef = null;

  async function loadProductBrands() {
    loading = true;

    try {
      const brandResponse =
        await productBrandApi.getAll({
          status: 1,
        });

      productBrands =
        brandResponse?.data || [];
    } catch (err) {
      console.error(
        'Failed to load product brands:',
        err,
      );

      productBrands = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadProductBrands();
  });
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Product Brands')}
  toolbarWidth="25rem"
  showFooter={false}
  dense={true}
  contained={true}
  contentClass="brands-index-content"
  tablePadding={true}
>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('Create Product Brand')}`}
      on:click={() => {
        modalRef?.openProductBrandModal();
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
  {:else if productBrands.length === 0}
    <div class="index-table-state">
      <EmptyState
        icon="bi-award"
        message={t('No product brands found.')}
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
            <th>{t('Code')}</th>
            <th>{t('Actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each productBrands as brand}
            {#if Number(brand.status) !== 0}
              <tr>
                <td>{brand.id}</td>
                <td>{brand.name}</td>

                <td>
                  <strong>
                    {brand.code || ''}
                  </strong>
                </td>

                <td>
                  <button
                    class="btn btn-sm btn-outline-secondary me-1"
                    on:click={() => {
                      modalRef?.editProductBrand(
                        brand,
                      );
                    }}
                  >
                    <i class="bi bi-pencil"></i>
                  </button>

                  <!--
                  <button
                    class="btn btn-sm btn-outline-danger"
                    on:click={() =>
                      deleteProductBrand(brand.id)}
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                  -->
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</IndexPageLayout>

<BrandModal
  bind:this={modalRef}
  on:saved={loadProductBrands}
/>
