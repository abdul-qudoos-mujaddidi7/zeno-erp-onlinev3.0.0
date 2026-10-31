<script>
    import { onMount } from "svelte";

    import AccountGroupModal from "./AccountGroupModal.svelte";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import DataTable from "../../components/common/DataTable.svelte";
    import TableActions from "../../components/common/TableActions.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";
    import TableSkeleton from "../../components/common/TableSkeleton.svelte";

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
    showFooter={false}
    dense={true}
    contained={true}
    contentClass="account-groups-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton icon="bi-plus-lg" label={`+ ${t("Create Account Group")}`} on:click={()=>{modalRef.openAccountGroupModal()}} />
    </svelte:fragment>

        {#if loading}
            <TableSkeleton ariaLabel={t("Loading...")} colCount={4} minWidth="640px" />
        {:else if accountGroups.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-folder2-open" message={t("No account groups found.")} />
            </div>
        {:else}
            <DataTable ariaLabel={t("Account Groups")} minWidth="640px">
                <svelte:fragment slot="head">
                    <tr>
                        <th>{t("ID")}</th>
                        <th>{t("Name")}</th>
                        <th>{t("Description")}</th>
                        <th class="col-end">{t("Actions")}</th>
                    </tr>
                </svelte:fragment>

                {#each accountGroups as group (group.id)}
                    {#if group.status !== 0}
                        <tr>
                            <td class="cell-muted">{shortID(group.id)}</td>
                            <td>{group.name}</td>
                            <td><strong>{group.description}</strong></td>

                            <td class="col-end">
                                <TableActions
                                    actions={[
                                        {
                                            icon: 'bi-pencil',
                                            label: t('Edit'),
                                            tone: 'edit',
                                            disabled: group.id == 1,
                                            onClick: () => modalRef?.editAccountGroup(group),
                                        },
                                    ]} />
                            </td>
                        </tr>
                    {/if}
                {/each}
            </DataTable>
        {/if}
</IndexPageLayout>
<AccountGroupModal bind:this={modalRef} on:saved={loadAccountGroups} />
