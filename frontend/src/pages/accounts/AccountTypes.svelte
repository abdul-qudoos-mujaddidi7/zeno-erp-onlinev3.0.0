<script>
    import { onMount } from "svelte";
    import Swal from "sweetalert2";
    import { t, lang, translate_org_type } from '../../i18n/i18n';
    import TableSkeleton from '../../components/common/TableSkeleton.svelte';
    import { accountTypeApi } from '../../api/accountTypeApi.js';
    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;
    let accountTypes = [];
    let loading = true;
    let accountTypesModal;
    let name = "";
    let id = null;
    let name_fa = "";
    let name_ps = "";
    let code = "";
    let description = "";
    let status = 1;
    let can_be_customer = 0;
    let can_be_supplier = 0;
    let editingId = null;
    let maxID = 0;
    async function loadAccountTypes() {
        loading = true;
        try {
            const response = await accountTypeApi.getAll({ status: 1 });
            accountTypes = response?.data || [];
            maxID = 0;
            accountTypes.forEach(at=>{
                if (Number(at.id)>Number(maxID)) {
                    maxID = Number(at.id);
                }
            }) 
            id = maxID+1;
        } catch (err) {
            console.error("Failed to load:", err);
        } finally {
            loading = false;
        }
    }
    onMount(() => {
        const modalEl = document.getElementById("accountTypesModal");
        if (window.mdb) {
            accountTypesModal = new window.mdb.Modal(modalEl);
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => {
                new window.mdb.Input(el);
            });
        }
        loadAccountTypes();
    });
    function openAccountTypeModal() {
        editingId = null;
        name = "";
        id = maxID+1;
        name_fa = "";
        name_ps = "";
        code = "";
        description = "";
        status = 1;
        can_be_customer = 0;
        can_be_supplier = 0;
        accountTypesModal.show();
    }
    function editAccountType(category) {
        editingId = category.id;
        name = category.name;
        id = category.id;
        name_fa = category.name_fa;
        name_ps = category.name_ps;
        code = category.code;
        description = category.description;
        status = category.status;
        can_be_customer = Number(category.can_be_customer || category.id == 4);
        can_be_supplier = Number(category.can_be_supplier || category.id == 3);
        accountTypesModal.show();
    }
    async function saveAccountType() {
        if (!name.trim()) {
            Swal.fire({
                icon: 'error',
                title: t('Error'),
                text: t('Name is required'),
                confirmButtonText: t("OK"),
            });
            return;
        }
        try {
            const payload = {
                name: name.trim(),
                name_fa: name_fa.trim(),
                name_ps: name_ps.trim(),
                description,
                code: code.trim().toUpperCase() || null,
                can_be_customer: Number(can_be_customer),
                can_be_supplier: Number(can_be_supplier),
                status: parseInt(status) || 1,
            };
            if (editingId) {
                const response = await accountTypeApi.update(editingId, payload);
                id = response?.data?.id || id;
            } else {
                const response = await accountTypeApi.create(payload);
                id = response?.data?.id || id;
            }
            await loadAccountTypes();
            accountTypesModal.hide();
        } catch (err) {
            console.error("Failed to save account type:", err);
            Swal.fire({
                icon: 'error',
                title: t('Error'),
                text: t('An error occurred while saving the account type. Please try again.'),
                confirmButtonText: t("OK"),
            });
        }
    }
    async function deleteAccountType(id) {
        if (confirm("Delete this account type?")) {
            await accountTypeApi.remove(id);
            await loadAccountTypes();
        }
    }
</script>

<div class="my-4 d-flex justify-content-between align-items-center">
    <p class="h5 mb-0">{t("Account Types")}</p>
    <button type="button" class="btn btn-primary" on:click={openAccountTypeModal}>
        <i class="bi bi-plus-circle"></i> {t("Create Account Type")}
    </button>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        {#if loading}
            <TableSkeleton ariaLabel={t('Loading...')} colCount={9} minWidth="1000px" />
        {:else}
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>{t("ID")}</th>
                            <th>{t("Name (EN)")}</th>
                            <th>{t("Name (FA)")}</th>
                            <th>{t("Name (PS)")}</th>
                            <th>{t("Code")}</th>
                            <th>{t("Status")}</th>
                            <th>{t("Created At")}</th>
                            <th>{t("Updated At")}</th>
                            <th>{t("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each accountTypes as accountType}
                            {#if accountType.status !== 0}
                                <tr>
                                    <td>{accountType.id}</td>
                                    <td>{accountType.name}</td>
                                    <td>{accountType.name_fa}</td>
                                    <td>{accountType.name_ps}</td>
                                    <td><strong>{accountType.code}</strong></td>
                                    <td>{accountType.status === 1 ? "Active" : "Inactive"}</td>
                                    <td><small>{new Date(accountType.created_at).toLocaleString()}</small></td>
                                    <td><small>{new Date(accountType.updated_at).toLocaleString()}</small></td>
                                    <td>
                                        <button
                                            class="btn btn-sm btn-outline-secondary me-1"
                                            on:click={() => editAccountType(accountType)}
                                        >
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <button
                                            class="btn btn-sm btn-outline-danger"
                                            on:click={() =>
                                                deleteAccountType(accountType.id)}
                                        >
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                        {#if accountTypes.length === 0}
                            <tr>
                                <td colspan="9" class="text-center text-muted p-4" >{t("No account types found.")}</td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>

<div class="modal fade" id="accountTypesModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bi bi-plus-circle"></i> {t("New Account Type")}
                </h5>
                <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="row">
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                readonly={editingId?true:false}
                                type="text"
                                id="c-id"
                                class="form-control"
                                bind:value={id}
                            />
                            <label class="form-label" for="c-id">{t("ID")}</label
                            >
                        </div>
                    </div>
                    <div class="col-md-6 mb-3 form-check">
                        <input class="form-check-input" type="checkbox" id="can-customer" bind:checked={can_be_customer} />
                        <label class="form-check-label" for="can-customer">{t("Can be customer")}</label>
                    </div>
                    <div class="col-md-6 mb-3 form-check">
                        <input class="form-check-input" type="checkbox" id="can-supplier" bind:checked={can_be_supplier} />
                        <label class="form-check-label" for="can-supplier">{t("Can be supplier")}</label>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-name"
                                class="form-control"
                                bind:value={name}
                            />
                            <label class="form-label" for="c-name">{t("Name (EN)")}</label>
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-name_fa"
                                class="form-control"
                                bind:value={name_fa}
                            />
                            <label class="form-label" for="c-name_fa">{t("Name (FA)")}</label>
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-name_ps"
                                class="form-control"
                                bind:value={name_ps}
                            />
                            <label class="form-label" for="c-name_ps">{t("Name (PS)")}</label>
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="text"
                                id="c-value"
                                class="form-control"
                                bind:value={code}
                            />
                            <label class="form-label" for="c-code">{t("Code")}</label
                            >
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <input
                                type="number"
                                step="0.01"
                                id="c-status"
                                class="form-control"
                                bind:value={status}
                            />
                            <label class="form-label" for="c-status"
                                >{t("Status")}</label
                            >
                        </div>
                    </div>
                    <div class="col-md-6 mb-4">
                        <div class="form-outline" data-mdb-input-init>
                            <textarea
                                id="c-description"
                                class="form-control"
                                bind:value={description}
                            ></textarea>
                            <label class="form-label" for="c-description"
                                >{t("Description")}</label
                            >
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t("Close")}</button>
                <button type="button" class="btn btn-primary" on:click={saveAccountType}>
                    {editingId ? t("Update Account Type") : t("Save Account Type")}
                </button>
            </div>
        </div>
    </div>
</div>
