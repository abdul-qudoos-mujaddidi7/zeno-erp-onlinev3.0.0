<script>
    import { onMount, createEventDispatcher } from "svelte";

    import { t, lang, translate_org_type } from "../../i18n/i18n.js";
    import { accountGroupApi } from "../../api/accountGroupApi.js";

    $: _lang = $lang;
    $: _translate_org_type = $translate_org_type;

    const dispatch = createEventDispatcher();

    let accountGroupsModal;

    // Form fields
    let name = "";
    let code = "";
    let description = "";
    let status = 1;

    // Track editing
    let editingId = null;

    onMount(() => {
        const modalEl = document.getElementById("createAccountGroupModal");
        if (window.mdb) {
            accountGroupsModal = new window.mdb.Modal(modalEl);
            document.querySelectorAll("[data-mdb-input-init]").forEach((el) => {
                new window.mdb.Input(el);
            });
        }
    });

    export async function openAccountGroupModal() {
        console.log("OK");
        editingId = null;
        name = "";
        code = "";
        description = "";
        status = 1;
        accountGroupsModal.show();
    }

    export async function editAccountGroup(group) {
        editingId = group.id;
        name = group.name;
        code = group.code;
        description = group.description;
        status = group.status;
        accountGroupsModal.show();
    }

    async function saveAccountGroup() {
        if (!name.trim()) {
            alert("Name is required.");
            return;
        }

        const payload = {
            name: name.trim(),
            code: code.trim() || null,
            description: description.trim() || null,
            status: parseInt(status) || 1,
        };

        try {
            let response;

            if (editingId) {
                response = await accountGroupApi.update(
                    editingId,
                    payload,
                );
            } else {
                response = await accountGroupApi.create(
                    payload,
                );
            }

            dispatch("saved", {
                id: response?.data?.id || editingId,
                name: response?.data?.name || payload.name,
                code: response?.data?.code || payload.code,
                description:
                    response?.data?.description ||
                    payload.description,
            });

            accountGroupsModal.hide();
        } catch (err) {
            console.error("Failed to save account group:", err);
            alert("Error saving account group: " + err.message);
        }
    }

    async function deleteAccountGroup(id) {
        if (confirm("Delete this account group?")) {
            try {
                await accountGroupApi.remove(id);
            } catch (err) {
                console.error("Failed to delete account group:", err);
                alert("Error deleting account group: " + err.message);
            }
        }
    }
</script>

<div
    class="modal fade qa-modal"
    dir={t('dir')}
    id="createAccountGroupModal"
    tabindex="-1"
    aria-hidden="true"
>
    <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
        <div class="modal-content qa-modal__panel">
            <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t("Close")}>
                <i class="bi bi-x-lg"></i>
            </button>

            <div class="qa-modal__header">
                <div class="qa-modal__icon">
                    <i class="bi bi-folder2-open"></i>
                </div>
                <div>
                    <span class="qa-modal__eyebrow">{t("Account Groups")}</span>
                    <h3>{t("System Settings")}</h3>
                </div>
            </div>

            <div class="qa-modal__intro">
                <h2>{editingId ? t("Update Account Group") : t("Create Account Group")}</h2>
                <p>{editingId ? t("Update account group subtitle") : t("Create account group subtitle")}</p>
            </div>

            <form class="qa-modal__form" on:submit|preventDefault={saveAccountGroup}>
                <label class="qa-modal__field qa-modal__field--full">
                    <span>{t("Name")}</span>
                    <input type="text" id="account-group-name" bind:value={name} autocomplete="off" />
                </label>

                <label class="qa-modal__field qa-modal__field--full">
                    <span>{t("Description")}</span>
                    <textarea id="account-group-description" rows="3" bind:value={description}></textarea>
                </label>

                <button type="submit" class="qa-modal__submit">
                    {editingId ? t("Update Account Group") : t("Create Account Group")}
                </button>
            </form>
        </div>
    </div>
</div>
