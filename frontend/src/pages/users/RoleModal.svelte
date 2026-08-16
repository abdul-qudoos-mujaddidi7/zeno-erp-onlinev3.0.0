<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { userRoleApi } from '../../api/userRoleApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let userRoles = [];
  let userRolesModalEl;

  let name = '';
  let description = '';
  let status = 1;
  let parsedPermissions = [];
  let editingId = null;
  let saving = false;

  const permissionItems = [
    'Products',
    'POS',
    'Sales',
    'Benefit',
    'Purchases',
    'Accounts',
    'Journals',
    'Exchange',
    'Services',
    'Users',
    'Settings',
  ];

  function setDefaultPermissions() {
    parsedPermissions = permissionItems.map((item) => ({
      code: item,
      view: false,
      create: false,
      edit: false,
      approve: false,
      delete: false,
    }));
  }

  function getModalInstance() {
    if (!userRolesModalEl) {
      console.error('User role modal element was not found.');
      return null;
    }

    if (!window.mdb?.Modal) {
      console.error('MDB Modal is not available.');
      return null;
    }

    return window.mdb.Modal.getOrCreateInstance(
      userRolesModalEl
    );
  }

  async function loadUserRoles() {
    try {
      userRoles = (await userRoleApi.getAll({ status: 1 }))?.data || [];
    } catch (error) {
      console.error('Failed to load user roles:', error);
      userRoles = [];
    }
  }

  function resetForm() {
    editingId = null;
    name = '';
    description = '';
    status = 1;

    setDefaultPermissions();
  }

  function toggleAll(permission, checked) {
    permission.view = checked;
    permission.create = checked;
    permission.edit = checked;
    permission.approve = checked;
    permission.delete = checked;

    parsedPermissions = [...parsedPermissions];
  }

  function isAllSelected(permission) {
    return (
      permission.view &&
      permission.create &&
      permission.edit &&
      permission.approve &&
      permission.delete
    );
  }

  function parsePermissions(value) {
    if (!value) {
      return [];
    }

    try {
      const parsed =
        typeof value === 'string'
          ? JSON.parse(value)
          : value;

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse permissions:', error);
      return [];
    }
  }

  onMount(() => {
    setDefaultPermissions();
    loadUserRoles();
  });

  export async function openUserRoleModal() {
    resetForm();

    await tick();

    getModalInstance()?.show();

    setTimeout(() => {
      document.getElementById('role-name')?.focus();
    }, 200);
  }

  export async function editUserRole(role) {
    editingId = role.id;
    name = role.name || '';
    description = role.description || '';
    status = Number(role.status ?? 1);

    setDefaultPermissions();

    const savedPermissions = parsePermissions(
      role.permissions
    );

    parsedPermissions = parsedPermissions.map(
      (defaultPermission) => {
        const existingPermission =
          savedPermissions.find(
            (permission) =>
              permission.code === defaultPermission.code
          );

        return existingPermission
          ? {
              ...defaultPermission,
              ...existingPermission,
            }
          : defaultPermission;
      }
    );

    await tick();

    getModalInstance()?.show();

    setTimeout(() => {
      document.getElementById('role-name')?.focus();
    }, 200);
  }

  async function saveUserRole() {
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      alert(t('Name is required.'));
      document.getElementById('role-name')?.focus();
      return;
    }

    saving = true;

    try {
      const roleData = {
        name: cleanName,
        description: cleanDescription,
        permissions: JSON.stringify(parsedPermissions),
        status: Number(status) || 1,
      };

      let savedId = editingId;

      if (editingId) {
        const response = await userRoleApi.update(
          editingId,
          roleData
        );
        savedId = response?.data?.id || editingId;
      } else {
        const response = await userRoleApi.create(roleData);
        savedId = response?.data?.id;
      }

      await loadUserRoles();

      dispatch('saved', {
        id: savedId,
        ...roleData,
      });

      getModalInstance()?.hide();
      resetForm();
    } catch (error) {
      console.error('Failed to save user role:', error);

      alert(
        `${t('Error saving user role')}: ${error.message}`
      );
    } finally {
      saving = false;
    }
  }

  async function deleteUserRole(id) {
    if (!confirm(t('Delete this user role?'))) {
      return;
    }

    try {
      await userRoleApi.remove(id);

      await loadUserRoles();
      dispatch('saved');
    } catch (error) {
      console.error('Failed to delete user role:', error);

      alert(
        `${t('Error deleting user role')}: ${error.message}`
      );
    }
  }
</script>

<div
  bind:this={userRolesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createUserRoleModal"
  tabindex="-1"
  aria-hidden="true"
>
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog role-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button
        type="button"
        class="qa-modal__close"
        data-mdb-dismiss="modal"
        aria-label={t('Close')}
      >
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-shield-lock"></i>
        </div>

        <div>
          <span class="qa-modal__eyebrow">
            {t('User Role')}
          </span>

          <h3>{t('Users quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>
          {editingId
            ? t('Update User Role')
            : t('Create User Role')}
        </h2>
        
      </div>

      <form
        class="qa-modal__form"
        on:submit|preventDefault={saveUserRole}
      >
        <div class="role-fields-row">
          <label class="qa-modal__field">
            <span>{t('Description')}</span>

            <input
              type="text"
              id="role-description"
              bind:value={description}
              autocomplete="off"
            />
          </label>

          <label class="qa-modal__field">
            <span>{t('Name')}</span>

            <input
              type="text"
              id="role-name"
              bind:value={name}
              autocomplete="off"
            />
          </label>
        </div>

        <div class="permission-card">
          <div class="permission-card__header">
            <h4>{t('Permissions')}</h4>

            <div class="permission-card__icon">
              <i class="bi bi-key"></i>
            </div>
          </div>

          <div class="permission-table-wrap">
            <table
              class="permission-table"
            >
              <thead>
                <tr>
                  <th>{t('Module')}</th>

                  <th class="text-center">
                    {t('All')}
                  </th>

                  <th class="text-center">
                    {t('View')}
                  </th>

                  <th class="text-center">
                    {t('Create')}
                  </th>

                  <th class="text-center">
                    {t('Edit')}
                  </th>

                  <th class="text-center">
                    {t('Approve')}
                  </th>

                  <th class="text-center">
                    {t('Delete')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {#each parsedPermissions as permission}
                  <tr>
                    <td>
                      <strong>
                        {t(permission.code)}
                      </strong>
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        checked={isAllSelected(permission)}
                        aria-label={`${t(
                          permission.code
                        )} ${t('All')}`}
                        on:change={(event) =>
                          toggleAll(
                            permission,
                            event.currentTarget.checked
                          )}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.view}
                        aria-label={`${t(
                          permission.code
                        )} ${t('View')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.create}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Create')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.edit}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Edit')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.approve}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Approve')}`}
                      />
                    </td>

                    <td class="text-center">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        bind:checked={permission.delete}
                        aria-label={`${t(
                          permission.code
                        )} ${t('Delete')}`}
                      />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <button
          type="submit"
          class="qa-modal__submit"
          disabled={saving}
        >
          {#if saving}
            <span
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>

            <span>{t('Saving')}</span>
          {:else}
            <span>
              {editingId
                ? t('Update User Role')
                : t('Create User Role')}
            </span>
          {/if}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  .role-modal__dialog {
    width: min(1180px, calc(100vw - 2rem));
    max-width: min(1180px, calc(100vw - 2rem));
  }

  .role-modal__dialog :global(.qa-modal__panel) {
    max-height: calc(100dvh - 3rem);
    overflow: hidden;
  }

  .role-modal__dialog :global(.qa-modal__form) {
    overflow: hidden;
  }

  .role-fields-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 18px;
    width: 100%;
  }

  .role-fields-row .qa-modal__field {
    width: 100%;
    min-width: 0;
    margin: 0;
  }

  .role-fields-row input {
    width: 100%;
    height: 3.15rem;
    min-height: 3.15rem;
    max-height: 3.15rem;
    box-sizing: border-box;
  }

  /* Permissions card */

  .permission-card {
    grid-column: 1 / -1;
    width: 100%;
    overflow: hidden;
    border: 1px solid #dfe6f1;
    border-radius: 0.75rem;
    background: #ffffff;
  }

  .permission-card__header {
    display: flex;
    min-height: 3.25rem;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid #e7ebf1;
    background: #f8fafc;
  }

  .permission-card__header h4 {
    margin: 0;
    color: #263247;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
  }

  .permission-card__icon {
    display: grid;
    flex: 0 0 auto;
    width: 29px;
    height: 29px;
    place-items: center;
    border-radius: 7px;
    color: var(--bs-primary, #2f6fed);
    background: rgba(47, 111, 237, 0.1);
    font-size: 12px;
  }

.permission-table-wrap {
  width: 100%;
  max-height: none;
  overflow-x: hidden;
  overflow-y: visible;
}

.permission-table {
  width: 100%;
  min-width: 0;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.permission-table thead th {
  position: static;
  top: 0;
  z-index: 2;
  height: 2.5rem;
  padding: 0.5rem 0.35rem !important;
  border-bottom: 1px solid #dfe5ed;
  color: #667085;
  background: #f8fafc;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}

.permission-table tbody td {
  height: 2.15rem !important;
  padding: 0.35rem !important;
  border-bottom: 1px solid #e3e8ef;
  color: #344054;
  font-size: 0.74rem;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
}

/* Smaller module column */
.permission-table th:first-child,
.permission-table td:first-child {
  width: 20%;
  min-width: 0;
  padding-inline: 8px 4px !important;
  text-align: start !important;
}

.permission-table td:first-child strong {
  display: block;
  width: 100%;
  margin: 0;
  color: #667892;
  font-size: 0.74rem;
  font-weight: 800;
  line-height: 1;
  text-align: start;
}

/* Keep permission columns close together */
.permission-table th:not(:first-child),
.permission-table td:not(:first-child) {
  width: 13.333%;
  padding-inline: 1px !important;
  text-align: center;
}

/* Smaller checkboxes */
.permission-table .form-check-input {
  float: none;
  width: 1rem;
  height: 1rem;
  min-width: 1rem;
  margin: 0;
  padding: 0;
  vertical-align: middle;
  cursor: pointer;
  border-width: 1px;
}

.permission-table .form-check-input:checked {
  border-color: var(--bs-primary, #2f6fed);
  background-color: var(--bs-primary, #2f6fed);
}

.permission-table tbody tr:last-child td {
  border-bottom: 0;
}

.permission-table tbody tr:hover td {
  background: #f8fafc;
}

  /* Module column */

  .permission-table th:first-child,
  .permission-table td:first-child {
    padding-inline-start: 10px !important;
    padding-inline-end: 5px !important;
    text-align: start !important;
  }

  .permission-table td:first-child strong {
    display: block;
    width: 100%;
    margin: 0;
    color: #667892;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    text-align: start;
  }

  /* Permission action columns */

  .permission-table th:not(:first-child),
  .permission-table td:not(:first-child) {
    padding-inline: 3px !important;
    text-align: center;
  }

  

  .permission-table .form-check-input:checked {
    border-color: var(--bs-primary, #2f6fed);
    background-color: var(--bs-primary, #2f6fed);
  }

  .permission-table .form-check-input:focus {
    border-color: var(--bs-primary, #2f6fed);
    box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.13);
  }

  :global(html.dark) .role-modal__dialog :global(.qa-modal__panel) {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0b1426;
    color: #e5edf9;
  }

  :global(html.dark) .role-modal__dialog :global(.qa-modal__field span) {
    color: #8fa0ba;
  }

  :global(html.dark) .role-modal__dialog :global(.qa-modal__field input) {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .role-modal__dialog :global(.qa-modal__close) {
    border-color: rgba(148, 163, 184, 0.34);
    background: #111c31;
    color: #dbe7ff;
  }

  :global(html.dark) .permission-card {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0f1a2d;
  }

  :global(html.dark) .permission-card__header {
    border-color: rgba(148, 163, 184, 0.28);
    background: #111c31;
  }

  :global(html.dark) .permission-card__header h4,
  :global(html.dark) .permission-table tbody td {
    color: #dbe7ff;
  }

  :global(html.dark) .permission-table thead th {
    border-color: rgba(148, 163, 184, 0.28);
    background: #18243a;
    color: #b9c7dd;
  }

  :global(html.dark) .permission-table tbody td {
    border-color: rgba(148, 163, 184, 0.22);
    background: #0f1a2d;
  }

  :global(html.dark) .permission-table tbody tr:hover td {
    background: rgba(111, 156, 255, 0.08);
  }

  :global(html.dark) .permission-table td:first-child strong {
    color: #9fb0c8;
  }

  :global(html.dark) .permission-table .form-check-input {
    border-color: rgba(148, 163, 184, 0.5);
    background-color: #0b1426;
  }

  .qa-modal__submit {
    grid-column: 1 / -1;
    width: 100%;
  }

  /* RTL */

  .qa-modal[dir='rtl'] .permission-card__header {
    text-align: right;
  }

  .qa-modal[dir='rtl'] .permission-table th:first-child,
  .qa-modal[dir='rtl'] .permission-table td:first-child,
  .qa-modal[dir='rtl'] .permission-table td:first-child strong {
    text-align: right !important;
  }

  /* LTR */

  .qa-modal[dir='ltr'] .permission-card__header {
    text-align: left;
  }

  .qa-modal[dir='ltr'] .permission-table th:first-child,
  .qa-modal[dir='ltr'] .permission-table td:first-child,
  .qa-modal[dir='ltr'] .permission-table td:first-child strong {
    text-align: left !important;
  }

  .qa-modal[dir='rtl'] .role-fields-row {
    direction: rtl;
  }

  .qa-modal[dir='ltr'] .role-fields-row {
    direction: ltr;
  }

  @media (max-width: 767.98px) {
    .role-fields-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .permission-table th:first-child,
    .permission-table td:first-child {
      width: 145px;
      min-width: 145px;
    }
  }
</style>
