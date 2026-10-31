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

  import DataTable
    from '../../components/common/DataTable.svelte';

  import TableSkeleton
    from '../../components/common/TableSkeleton.svelte';

  import TableActions
    from '../../components/common/TableActions.svelte';

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
    <TableSkeleton ariaLabel={t('Loading...')} colCount={4} minWidth="640px" />
  {:else if productBrands.length === 0}
    <div class="index-table-state">
      <EmptyState
        icon="bi-award"
        message={t('No product brands found.')}
      />
    </div>
  {:else}
    <DataTable ariaLabel={t('Product Brands')} minWidth="640px">
      <svelte:fragment slot="head">
        <tr>
          <th>{t('ID')}</th>
          <th>{t('Name')}</th>
          <th>{t('Code')}</th>
          <th class="col-end">{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each productBrands as brand (brand.id)}
        {#if Number(brand.status) !== 0}
          <tr>
            <td class="cell-muted">{brand.id}</td>
            <td>{brand.name}</td>

            <td>
              <strong>
                {brand.code || ''}
              </strong>
            </td>

            <td class="col-end">
              <TableActions
                actions={[
                  {
                    icon: 'bi-pencil',
                    label: t('Edit'),
                    tone: 'edit',
                    onClick: () => modalRef?.editProductBrand(brand),
                  },
                ]} />
            </td>
          </tr>
        {/if}
      {/each}
    </DataTable>
  {/if}
</IndexPageLayout>

<BrandModal
  bind:this={modalRef}
  on:saved={loadProductBrands}
/>
