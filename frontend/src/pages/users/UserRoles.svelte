<script>
    import { onMount } from "svelte";
    import RoleModal from "./RoleModal.svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
    import DataTable from "../../components/common/DataTable.svelte";
    import TableActions from "../../components/common/TableActions.svelte";
    import EmptyState from "../../components/common/EmptyState.svelte";
    import { userRoleApi } from "../../api/userRoleApi.js";
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    let userRoles = [];
    let loading = true;
    async function loadUserRoles() {
        loading = true;
        try {
            userRoles = (await userRoleApi.getAll({ status: 1 }))?.data || [];
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }
    let modalRef = null;
    onMount(() => {
        loadUserRoles();
    });
</script>

<IndexPageLayout
    dir={t("dir")}
    ariaLabel={t("User Roles")}
    toolbarWidth="25rem"
    showFooter={false}
    dense={true}
    contained={true}
    contentClass="roles-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
        <ActionButton icon="bi-plus-lg" label={`+ ${t("Create User Role")}`} on:click={()=>{modalRef.openUserRoleModal()}} />
    </svelte:fragment>

        {#if loading}
            <div class="index-table-state">
                <EmptyState loading message={t("Loading...")} />
            </div>
        {:else if userRoles.length === 0}
            <div class="index-table-state">
                <EmptyState icon="bi-person-gear" message={t("No user roles found.")} />
            </div>
        {:else}
            <DataTable ariaLabel={t("User Roles")} minWidth="640px">
                <svelte:fragment slot="head">
                    <tr>
                        <th>{t("ID")}</th>
                        <th>{t("Name")}</th>
                        <th>{t("Code")}</th>
                        <th class="col-end">{t("Actions")}</th>
                    </tr>
                </svelte:fragment>

                {#each userRoles as role (role.id)}
                    {#if role.status !== 0}
                        <tr>
                            <td class="cell-muted">{role.id}</td>
                            <td>{t(role.name)}</td>
                            <td><strong>{role.code}</strong></td>
                            <td class="col-end">
                                <TableActions
                                    actions={[
                                        {
                                            icon: 'bi-pencil',
                                            label: t('Edit'),
                                            tone: 'edit',
                                            onClick: () => modalRef?.editUserRole(role),
                                        },
                                    ]} />
                            </td>
                        </tr>
                    {/if}
                {/each}
            </DataTable>
        {/if}
</IndexPageLayout>
<RoleModal bind:this={modalRef} on:saved={loadUserRoles} />
