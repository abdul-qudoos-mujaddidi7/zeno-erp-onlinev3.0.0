<script>
  import { onMount } from "svelte";
  import GenericModal from "./GenericModal.svelte";
  import { t, lang, translate_org_type } from "../../i18n/i18n.js";
  import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
  import ActionButton from "../../components/common/ActionButton.svelte";
  import EmptyState from "../../components/common/EmptyState.svelte";
  import { productGenericApi } from "../../api/productGenericApi.js";
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let productGenerics = [];
  let loading = true;
  async function loadProductGenerics() {
    loading = true;
    try {
      const response = await productGenericApi.getAll({
        status: 1,
      });
      productGenerics = response?.data || [];
    } catch (err) {
      console.error("Failed to load:", err);
      productGenerics = [];
    } finally {
      loading = false;
    }
  }
  let modalRef = null;
  onMount(() => {
    loadProductGenerics();
  });
</script>
<IndexPageLayout
    dir={t("dir")}
    ariaLabel={t("Product Generics")}
    toolbarWidth="25rem"
    showFooter={false}
    dense={true}
    contained={true}
    contentClass="generics-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton icon="bi-plus-lg" label={`+ ${t("Create Product Generic")}`} on:click={()=>{modalRef.openProductGenericModal()}} />
    </svelte:fragment>

        {#if loading}
            <div class="index-table-state">
                <EmptyState loading message={t("Loading...")} />
            </div>
        {:else if productGenerics.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-capsule" message={t("No product generics found.")} />
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0 settings-index-table">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Code")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each productGenerics as generic}
                            {#if generic.status !== 0}
                                <tr>
                                    <td>{generic.id}</td>
                                    <td>{generic.name}</td>
                                    <td><strong>{generic.code}</strong></td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editProductGeneric(generic)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteProductGeneric(generic.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
</IndexPageLayout>
<GenericModal bind:this={modalRef} on:saved={loadProductGenerics} />
