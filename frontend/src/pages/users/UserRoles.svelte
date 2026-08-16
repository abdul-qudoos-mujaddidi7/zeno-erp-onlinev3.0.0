<script>
    import { onMount } from "svelte";
    import RoleModal from "./RoleModal.svelte";
    import { t, lang, translate_org_type } from "../../i18n/i18n";
    import IndexPageLayout from "../../lib/components/index/IndexPageLayout.svelte";
    import ActionButton from "../../components/common/ActionButton.svelte";
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
                        {#each userRoles as role}
                            {#if role.status !== 0}
                                <tr>
                                    <td>{role.id}</td>
                                    <td>{t(role.name)}</td>
                                    <td><strong>{role.code}</strong></td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={()=>{modalRef?.editUserRole(role)}}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <!-- <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteUserRole(role.id)}
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
<RoleModal bind:this={modalRef} on:saved={loadUserRoles} />
