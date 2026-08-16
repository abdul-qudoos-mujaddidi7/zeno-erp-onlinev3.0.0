<script>
    import { onMount } from "svelte";

    import AccountGroupModal from "./AccountGroupModal.svelte";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";

    import { t, lang, translate_org_type,shortID } from "../../i18n/i18n.js";
    import { accountGroupApi } from "../../api/accountGroupApi.js";

    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;



    let accountGroups = [];
    let loading = true;



    async function loadAccountGroups() {
        loading = true;
        try {
            const response = await accountGroupApi.getAll({
                status: 1,
            });
            accountGroups = response?.data || [];
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }

    let modalRef = null;


    onMount(() => {
        loadAccountGroups();
    });
</script>

<IndexPageLayout
    dir={t("dir")}
    ariaLabel={t("Account Groups")}
    toolbarWidth="25rem"
    showFooter={false}
    dense={true}
    contained={true}
    contentClass="account-groups-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton icon="bi-plus-lg" label={`+ ${t("Create Account Group")}`} on:click={()=>{modalRef.openAccountGroupModal()}} />
    </svelte:fragment>

        {#if loading}
            <div class="index-table-state">
                <EmptyState loading message={t("Loading...")} />
            </div>
        {:else if accountGroups.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-folder2-open" message={t("No account groups found.")} />
            </div>
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0 settings-index-table">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Description")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each accountGroups as group}
                            {#if group.status !== 0}
                                <tr>
                                    <td>{shortID(group.id)}</td>
                                    <td>{group.name}</td>
                                    <td><strong>{group.description}</strong></td>
                                
                                    <td>
                                        <button
                                            disabled={group.id==1}
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editAccountGroup(group)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteAccountGroup(group.id)}
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
<AccountGroupModal bind:this={modalRef} on:saved={loadAccountGroups} />
