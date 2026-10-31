<script>
    import { onMount } from "svelte";
    import { labtestCategoryApi } from "../../../api/labtestCategoryApi.js";

    import CategoryModal from "./LabTestCategoryModal.svelte";

    import { t, lang, translate_org_type,shortID } from "../../../i18n/i18n";
    import TableSkeleton from "../../../components/common/TableSkeleton.svelte";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;



    let labtestCategories = [];
    let loading = true;



    async function loadLabTestCategories() {
        loading = true;
        try {
            labtestCategories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    let modalRef = null;


    onMount(() => {
        loadLabTestCategories();
    });
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("LabTest Categories")}</p>
    <button type="button" class="btn btn-primary" on:click={()=>{modalRef.openLabTestCategoryModal()}}>
        <i class="bi bi-plus-circle"></i> {t("Create LabTest Category")}
    </button>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        {#if loading}
            <TableSkeleton ariaLabel={t('Loading...')} colCount={4} minWidth="720px" />
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Description")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each labtestCategories as category}
                            {#if category.status !== 0}
                                <tr>
                                    <td>{shortID(category.id)}</td>
                                    <td>{category.name}</td>
                                    <td><strong>{category.description}</strong></td>
                                
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editLabTestCategory(category)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteLabTestCategory(category.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button> -->
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if labtestCategories.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="text-center text-muted p-4"
                                    >{t("No labtest categories found.")}</td
                                >
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>
<CategoryModal bind:this={modalRef} on:saved={loadLabTestCategories} />