<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { hashPassword, validatePasswordStrength, generateTemporaryPassword } from '../../utils/passwordHelper.js';
  import { lang } from '../../i18n/i18n.js';

  import { t } from '../../i18n/i18n.js';
  import { DASHBOARD_CARD_CODES, expandDashboardCards } from '../../auth/permissions.js';
import { accountApi } from '../../api/accountApi.js';
import { userApi } from '../../api/userApi.js';
import { userImageApi } from '../../api/userImageApi.js';
import { accountImageApi } from '../../api/accountImageApi.js';
  $: _lang = $lang;
  export let userRoles = [];
  export let departments = [];
  export let user = null;

  const dispatch = createEventDispatcher();

  let org_id = 'z' + localStorage.getItem('org_id') || null;

  // Form fields
  let role_id = '';
  let department_id = '';
  let username = '';
  let email = '';
  let first_name = '';
  let last_name = '';
  let phone = '';
  let address = '';
  let description = '';
  let permissions = '';

  let parsedPermissions = [];

  const permission_items = ['Dashboard', ...DASHBOARD_CARD_CODES, 'Products', 'POS','Sales','Benefit', 'Purchases', 'Accounts', 'Journals','Exchange','Services', 'Users', 'Settings'];

  function setDefaultPermissions() {
    parsedPermissions = permission_items.map((item) => ({
      code: item,
      // Dashboard stays visible by default: it is the landing page and older
      // permission sets have no Dashboard row at all. Unchecking it hides the
      // page, its sidebar link and every card it cannot justify.
      view: item === 'Dashboard',
      create: false,
      edit: false,
      approve: false,
      delete: false,
    }));
  }

  setDefaultPermissions();
  function toggleAll(permission, checked) {
    permission.view = checked;
    permission.create = checked;
    permission.edit = checked;
    permission.approve = checked;
    permission.delete = checked;
    parsedPermissions = [...parsedPermissions];
  }
  let password = '';
  let confirmPassword = '';
  let status = 1;
  let showPassword = false;
  let passwordStrength = null;
  let modal;
  let imageBase64 = null;
  let modalImageUrl = null;
  const passwordHelper = { hashPassword, validatePasswordStrength, generateTemporaryPassword };
  onMount(() => {
    const modalEl = document.getElementById('userModal');
    if (window.mdb) {
      modal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
    }
    if (user) loadUser(user);
  });

  $: if (user) loadUser(user);

  function loadUser(usr) {
    if (usr) {
      role_id = usr.role_id || '';
      department_id = usr.department_id || '';
      username = usr.username.startsWith(org_id) ? usr.username.slice(org_id.length) : usr.username || '';
      email = usr.email || '';
      first_name = usr.first_name || '';
      last_name = usr.last_name || '';
      phone = usr.phone || '';
      address = usr.address || '';
      description = usr.description || '';
      permissions = usr.permissions || '';
      status = usr.status || 1;
      password = '';
      confirmPassword = '';
      modalImageUrl = usr.imageUrl;
      imageBase64 = null;
      user = usr;
      if (usr.permissions) {
        const savedPermissions = JSON.parse(usr.permissions);
        parsedPermissions = parsedPermissions.map((defaultPermission) => {
          const existing = savedPermissions.find((p) => p.code === defaultPermission.code);
          return existing ? { ...defaultPermission, ...existing } : defaultPermission;
        });
        parsedPermissions = expandDashboardCards(
          parsedPermissions,
          savedPermissions.map((permission) => permission && permission.code),
        );
      } else {
        setDefaultPermissions();
      }
    } else {
      resetForm();
    }
  }
  function resetForm() {
    role_id = '';
    department_id = '';
    username = '';
    email = '';
    first_name = '';
    last_name = '';
    phone = '';
    address = '';
    description = '';
    permissions = '';
    password = '';
    confirmPassword = '';
    status = 1;
    passwordStrength = null;
    modalImageUrl = null;
    imageBase64 = null;
    user = null;
    showPassword = false;
    setDefaultPermissions();
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    imageBase64 = await convertToWebP(file, 400, 400);
    modalImageUrl = imageBase64;
  }

  function convertToWebP(file, maxWidth = 800, fixedSize = null) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;
        if (fixedSize) {
          const canvasSize = fixedSize;
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;
          canvas.width = canvasSize;
          canvas.height = canvasSize;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
        } else {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      reader.readAsDataURL(file);
    });
  }

  function checkPasswordStrength() {
    passwordStrength = validatePasswordStrength(password);
  }

  function generatePassword() {
    password = generateTemporaryPassword();
    confirmPassword = password;
    checkPasswordStrength();
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }

  async function saveUser() {
    const usernameTrimmed = (username || '').trim();
    const emailTrimmed = (email || '').trim();
    if (!usernameTrimmed || !first_name.trim()) {
      alert('Username and First Name are required.');
      return;
    }
    if (!department_id) {
      alert('Department is required.');
      return;
    }
    if (!role_id) {
      alert('Role is required.');
      return;
    }
    if (!emailTrimmed) {
      alert('Email is required.');
      return;
    }
    if (!user?.id) {
      if (!password.trim()) {
        alert('Password is required for new users.');
        return;
      }
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
      }
    } else if (password.trim()) {
      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
      }
    }

    try {
      let userId;
      if (user?.id) {
        const updateData = {
          department_id: parseInt(department_id) || 0,
          role_id: parseInt(role_id) || 0,
          username: org_id + '' + usernameTrimmed,
          email: emailTrimmed,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          description: description.trim(),
          permissions: JSON.stringify(parsedPermissions),
          language: 'en',
          theme: 'light',
          status: parseInt(status) || 1,
        };
        if (password.trim()) {
          updateData.password = password;
        }
        await userApi.update(user.id, updateData);
        userId = user.id;
        const userAccount = (await accountApi.getAll({ status: 1, code: String(userId) }))?.data?.[0];
        if (userAccount) {
          await accountApi.update(userAccount.id, {
            name: first_name.trim() + ' ' + last_name.trim(),
            name_fa: first_name.trim() + ' ' + last_name.trim(),
            name_ps: first_name.trim() + ' ' + last_name.trim(),
            description: description.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
          });
        }
      } else {
        const created = await userApi.create({
          department_id: parseInt(department_id) || 0,
          role_id: parseInt(role_id) || 0,
          username: org_id + '' + usernameTrimmed,
          email: emailTrimmed,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          description: description.trim(),
          permissions: JSON.stringify(parsedPermissions),
          language: 'en',
          theme: 'light',
          password,
          status: parseInt(status) || 1,
        });
        userId = created?.data?.id;
        await accountApi.create({
          account_type_id: 8,
          account_group_id: 1,
          code: String(userId),
          name: first_name.trim() + ' ' + last_name.trim(),
          main_acc: 'false',
          name_fa: first_name.trim() + ' ' + last_name.trim(),
          name_ps: first_name.trim() + ' ' + last_name.trim(),
          balance: 0,
          currency: 'AFN',
          description: description.trim(),
          percentage: 0,
          phone: phone.trim(),
          phone2: '',
          email: email.trim(),
          address: address.trim(),
          status: parseInt(status) || 1,
        });
      }
      if (imageBase64) {
        const existingUserImages =
          (await userImageApi.getAll({
            status: 1,
            user_id: userId,
          }))?.data || [];

        for (const img of existingUserImages) {
          await userImageApi.remove(img.id);
        }

        await userImageApi.create({
          user_id: userId,
          image: imageBase64,
          status: 1,
        });

        const existingAccountImages =
          (await accountImageApi.getAll({
            status: 1,
            account_id: userId,
          }))?.data || [];

        for (const img of existingAccountImages) {
          await accountImageApi.remove(img.id);
        }

        await accountImageApi.create({
          account_id: userId,
          image: imageBase64,
          status: 1,
        });
      }
      resetForm();
      modal.hide();
      dispatch('saved');
    } catch (err) {
      console.error('Error saving user:', err);
      alert('Error saving user: ' + err.message);
    }
  }
  export function openModal(usr = null) {
    if (usr) {
      loadUser(usr);
    } else {
      resetForm();
    }
    modal?.show();
  }
  function loadPermissions() {
    if (!role_id) {
      alert('Please select a role first.');
      return;
    }
    const selectedRole = userRoles.find((r) => r.id === parseInt(role_id));
    if (selectedRole && selectedRole.permissions) {
      const rolePermissions = JSON.parse(selectedRole.permissions);
      parsedPermissions = parsedPermissions.map((defaultPermission) => {
        const existing = rolePermissions.find((p) => p.code === defaultPermission.code);
        return existing ? { ...defaultPermission, ...existing } : defaultPermission;
      });
      parsedPermissions = expandDashboardCards(
        parsedPermissions,
        rolePermissions.map((permission) => permission && permission.code),
      );
    } else {
      setDefaultPermissions();
    }
  }
</script>
<div class="modal fade user-modal" id="userModal" tabindex="-1" aria-hidden="true" dir={$lang === 'fa' || $lang === 'ps' ? 'rtl' : 'ltr'}>
  <div class="modal-dialog modal-dialog-centered user-modal-dialog">
    <div class="modal-content user-modal-content border-0 shadow-lg">
      <div class="modal-header user-modal-header">
        <h5 class="modal-title">
          <i class="bi bi-person-check me-2"></i>
          {user?.id ? 'Edit User' : 'Create New User'}
        </h5>
        <button type="button" class="btn-close user-modal-close" data-mdb-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body user-modal-body">
        <div class="user-modal-grid">
          <div class="user-card user-profile-card">
            <div class="section-heading">
              <div class="h3">{t('Personal Information')}</div>
            </div>
            <div class="text-center mb-4 pb-3 user-photo-section">
              <div class="mb-3">
                <img
                  src={modalImageUrl || '/img/no-image.png'}
                  alt="User Profile"
                  width="100"
                  height="100"
                  style="object-fit: cover; border-radius: 50%; border: 3px solid #e9ecef;" />
              </div>
              <div class="d-flex justify-content-center">
                <label class="btn btn-outline-primary btn-sm">
                  <i class="bi bi-camera"></i>
                  {t('Upload Photo')}
                  <input type="file" accept="image/*" on:change={handleImageUpload} hidden />
                </label>
              </div>
            </div>
            <div class="row compact-row">
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" id="first-name" class="form-control form-control-sm" bind:value={first_name} />
                  <label class="form-label" for="first-name">{t('First Name')}*</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" id="last-name" class="form-control form-control-sm" bind:value={last_name} />
                  <label class="form-label" for="last-name">{t('Last Name')}</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="email" id="email" class="form-control form-control-sm" bind:value={email} />
                  <label class="form-label" for="email">{t('Email')}*</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <input type="tel" id="phone" class="form-control form-control-sm" bind:value={phone} />
                  <label class="form-label" for="phone">{t('Phone')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <textarea id="address" class="form-control form-control-sm" bind:value={address}></textarea>
                  <label class="form-label" for="address">{t('Address')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3">
                <div class="form-outline" data-mdb-input-init>
                  <textarea id="description" class="form-control form-control-sm" bind:value={description}></textarea>
                  <label class="form-label" for="description">{t('Description')}</label>
                </div>
              </div>
              <div class="col-md-12 mb-3"></div>
            </div>
            <div class="mb-4">
              <div class="row compact-row">
                <div class="col-md-12 mb-3">
                  <select id="department-select" class="form-select form-select-sm" bind:value={department_id}>
                    <option value="">{t('Select a department...')}</option>
                    {#each departments as department}
                      {#if department.status === 1}
                        <option value={department.id}>{t(department.name)}</option>
                      {/if}
                    {/each}
                  </select>
                </div>
                <div class="col-md-12 mb-3">
                  <div class="form-outline" data-mdb-input-init>
                    <input type="text" id="username" class="form-control form-control-sm" bind:value={username} />
                    <label class="form-label" for="username">{t('Username')}*</label>
                  </div>
                </div>
                <div class="col-md-6 mb-3">
                  <div class="form-outline position-relative" data-mdb-input-init>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      class="form-control form-control-sm"
                      bind:value={password}
                      on:input={checkPasswordStrength}
                      placeholder="••••••••" />
                    <label class="form-label" for="password">{t('Password')} {user?.id ? '' : '*'}</label>
                    <button
                      type="button"
                      class="btn btn-link position-absolute end-0 top-50 translate-middle-y"
                      on:click={() => (showPassword = !showPassword)}
                      style="z-index: 10;">
                      <i class={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                    </button>
                  </div>
                </div>
                <div class="col-md-6 mb-3">
                  <div class="form-outline" data-mdb-input-init>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="confirm-password"
                      class="form-control form-control-sm"
                      bind:value={confirmPassword}
                      placeholder="••••••••" />
                    <label class="form-label" for="confirm-password"
                      >{t('Confirm Password')} {user?.id ? '' : '*'}</label>
                  </div>
                </div>
              </div>
              {#if password && passwordStrength}
                <div class="mt-3 p-3 rounded bg-body-tertiary">
                  <div class="mb-2">
                    <small class="text-muted">{t('Password Strength')}:</small>
                    <span
                      class="badge ms-2 {passwordStrength.score <= 2
                        ? 'bg-danger'
                        : passwordStrength.score <= 4
                          ? 'bg-warning'
                          : 'bg-success'}">
                      {passwordStrength.strength}
                    </span>
                  </div>
                  <div class="progress" style="height: 5px;">
                    <div
                      class="progress-bar {passwordStrength.score <= 2
                        ? 'bg-danger'
                        : passwordStrength.score <= 4
                          ? 'bg-warning'
                          : 'bg-success'}"
                      style="width: {Math.min((passwordStrength.score / 6) * 100, 100)}%">
                    </div>
                  </div>
                  {#if passwordStrength.feedback.length > 0}
                    <div class="mt-2 small">
                      {#each passwordStrength.feedback as item}
                        <div class="text-muted">
                          <i class="bi bi-info-circle me-1"></i>{item}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
              <button type="button" class="btn btn-outline-secondary btn-sm mt-3" on:click={generatePassword}>
                <i class="bi bi-arrow-repeat me-2"></i>{t('Generate Password')}
              </button>
            </div>
            <div class="mb-4 d-none">
              <label class="form-label" for="status">{t('Status')}</label>
              <select id="status" class="form-select form-select-sm" bind:value={status}>
                <option value={1}>{t('Active')}</option>
                <option value={0}>{t('Inactive')}</option>
              </select>
            </div>
          </div>
          <div class="user-card user-permissions-card">
            <div class="permissions-toolbar input-group mb-3">
              <select id="role-select" class="form-select" bind:value={role_id}>
                <option value="">{t('Select a role...')}</option>
                {#each userRoles as role}
                  {#if role.status === 1}
                    <option value={role.id}>{t(role.name)}</option>
                  {/if}
                {/each}
              </select>
              <button class="btn btn-primary" on:click={loadPermissions}>
                <i class="bi bi-arrow-clockwise me-2"></i>{t("Load Permissions")}
              </button>
            </div>
            <div class="permission-card__header">
              <h4>{t('Permissions')}</h4>

              <div class="permission-card__icon">
                <i class="bi bi-key"></i>
              </div>
            </div>
            <div class="table-responsive permissions-table-wrap">
              <table class="table table-sm align-middle permissions-table">
                <thead>
                  <tr>
                    <th>{t('Module')}</th>
                    <th class="text-center">{t('All')}</th>
                    <th class="text-center">{t('View')}</th>
                    <th class="text-center">{t('Create')}</th>
                    <th class="text-center">{t('Edit')}</th>
                    <th class="text-center">{t('Approve')}</th>
                    <th class="text-center">{t('Delete')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each parsedPermissions as permission}
                    <tr>
                      <td>
                        <strong>{t(permission.code)}</strong>
                      </td>
                      <td class="text-center">
                        <input
                          type="checkbox"
                          checked={permission.view &&
                            permission.create &&
                            permission.edit &&
                            permission.approve &&
                            permission.delete}
                          on:change={(e) => toggleAll(permission, e.target.checked)} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.view} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.create} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.edit} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.approve} />
                      </td>
                      <td class="text-center">
                        <input type="checkbox" bind:checked={permission.delete} />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer user-modal-footer border-0 pt-0">
        <button type="button" class="btn btn-outline-secondary" data-mdb-dismiss="modal"> {t('Cancel')} </button>
        <button type="button" class="btn btn-primary" on:click={saveUser}>
          <i class="bi bi-check-circle me-2"></i>{user?.id ? t('Update User') : t('Create User')}
        </button>
      </div>
    </div>
  </div>
</div>
<style>
  .user-modal :global(.user-modal-dialog) {
    width: min(980px, calc(100vw - 1.5rem));
    max-width: min(980px, calc(100vw - 1.5rem));
    margin: 0.75rem auto;
  }

  .user-modal-content {
    max-height: calc(100dvh - 1.5rem);
    overflow: hidden;
    border-radius: 0.75rem;
    background: #ffffff;
    color: #0f172a;
    border: 1px solid #dfe6f1 !important;
  }

  .user-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.4rem;
    padding: 0.6rem 1rem;
    background: #ffffff;
    border-bottom: 1px solid #dfe6f1 !important;
    color: #0f172a;
  }

  .user-modal-header .modal-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: inherit;
  }

  .user-modal-close {
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border-radius: 0.65rem;
    background-color: #f8fafc;
    border: 1px solid #dbe5f3;
    opacity: 1;
  }

  .user-modal-body {
    overflow: auto;
    min-height: 0;
    padding: 0.7rem;
    background: #f8fafc;
    scrollbar-width: thin;
    scrollbar-color: #b6c2d4 transparent;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .user-modal-body::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .user-modal-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .user-modal-body::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
    background-color: #b6c2d4;
  }

  .user-modal-body::-webkit-scrollbar-thumb:hover {
    background-color: #94a3b8;
  }

  .user-modal-grid {
    display: grid;
    grid-template-columns: minmax(340px, 0.9fr) minmax(0, 1.1fr);
    gap: 0.7rem;
    align-items: start;
  }

  .user-modal[dir='rtl'] .user-modal-grid {
    direction: rtl;
  }

  .user-card {
    min-width: 0;
    height: 100%;
    padding: 0.7rem;
    border-radius: 0.75rem;
    background: #ffffff;
    border: 1px solid #dfe6f1;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.55rem;
  }

  .section-heading .h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 850;
    color: #0f172a;
  }

  .user-photo-section {
    border-bottom: 1px solid #dbe5f3;
    padding-bottom: 0.45rem !important;
    margin-bottom: 0.55rem !important;
  }

  .user-photo-section :global(.mb-3) {
    margin-bottom: 0.35rem !important;
  }

  .user-photo-section img {
    width: 54px;
    height: 54px;
    object-fit: cover;
    border-radius: 999px !important;
    border: 3px solid #ffffff !important;
    box-shadow: 0 0 0 1px #dbe5f3, 0 8px 20px rgba(15, 23, 42, 0.12);
  }

  .user-photo-section :global(.btn) {
    min-height: 1.85rem;
    padding: 0.22rem 0.55rem;
    border-radius: 0.5rem;
    font-size: 0.74rem;
    font-weight: 800;
    line-height: 1.1;
  }

  .compact-row {
    --bs-gutter-x: 0.55rem;
  }

  .compact-row :global(.mb-3),
  .user-profile-card :global(.mb-3) {
    margin-bottom: 0.4rem !important;
  }

  .user-modal :global(.form-control),
  .user-modal :global(.form-select),
  .user-modal :global(.input-group-text) {
    height: 2.55rem;
    min-height: 2.55rem;
    max-height: 2.55rem;
    border-radius: 0.48rem;
    padding-top: 0.28rem;
    padding-bottom: 0.28rem;
    font-size: 0.82rem;
    border-color: #cbd7ea;
    background-color: #ffffff;
    color: #0f172a;
    font-weight: 700;
    box-shadow: none;
  }

  .user-modal :global(.form-outline .form-notch),
  .user-modal :global(.form-outline .form-notch-leading),
  .user-modal :global(.form-outline .form-notch-middle),
  .user-modal :global(.form-outline .form-notch-trailing) {
    border: 0 !important;
    box-shadow: none !important;
  }

  .user-modal :global(textarea.form-control) {
    height: 2.55rem;
    min-height: 2.55rem;
    max-height: 2.55rem;
    overflow: hidden;
    resize: none;
    scrollbar-width: none;
  }

  .user-modal :global(textarea.form-control::-webkit-resizer),
  .user-modal :global(textarea.form-control::-webkit-scrollbar) {
    display: none;
  }

  .user-modal :global(.form-label) {
    color: #64748b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .user-modal :global(.form-outline .form-control:focus),
  .user-modal :global(.form-select:focus) {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
  }

  .permissions-toolbar {
    align-items: stretch;
    gap: 0.4rem;
    margin-bottom: 0.65rem !important;
  }

  .permissions-toolbar .form-select {
    border-radius: 0.55rem !important;
  }

  .permissions-toolbar .btn {
    border-radius: 0.55rem !important;
    font-weight: 800;
    white-space: nowrap;
  }

  .permissions-table-wrap {
    border: 1px solid #dfe6f1;
    border-radius: 0 0 0.75rem 0.75rem;
    /* The permission matrix outgrew the viewport: scroll the rows inside the
       card so the modal keeps its two-column layout and stays reachable. */
    max-height: min(52vh, 30rem);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #b6c2d4 transparent;
    background: #ffffff;
  }

  .permissions-table-wrap::-webkit-scrollbar {
    width: 10px;
  }

  .permissions-table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .permissions-table-wrap::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: content-box;
    background-color: #b6c2d4;
  }

  .permissions-table-wrap::-webkit-scrollbar-thumb:hover {
    background-color: #94a3b8;
  }

  .permissions-table {
    width: 100%;
    table-layout: fixed;
    margin: 0;
    color: #0f172a;
    border-collapse: separate;
    border-spacing: 0;
  }

  .permission-card__header {
    display: flex;
    min-height: 2.8rem;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0.5rem 0.75rem;
    border: 1px solid #dfe6f1;
    border-bottom: 0;
    border-radius: 0.75rem 0.75rem 0 0;
    background: #f8fafc;
  }

  .permission-card__header h4 {
    margin: 0;
    color: #263247;
    font-size: 13px;
    font-weight: 800;
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

  .permissions-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    height: 2.25rem;
    padding: 0.42rem 0.3rem !important;
    background: #f8fafc;
    border-bottom: 1px solid #dfe5ed;
    color: #667085;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  .permissions-table tbody td {
    height: 1.95rem !important;
    padding: 0.28rem !important;
    border-color: #e3e8ef;
    background: #ffffff;
    color: #344054;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1;
    text-align: center;
    vertical-align: middle;
  }

  .permissions-table tbody tr:nth-child(even) td {
    background: #f8fbff;
  }

  .permissions-table input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
    min-width: 1rem;
    margin: 0;
    accent-color: #1f74ff;
  }

  .permissions-table th:first-child,
  .permissions-table td:first-child,
  .permissions-table td:first-child strong {
    text-align: start !important;
  }

  .permissions-table td:first-child strong {
    color: #667892;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }

  .user-modal-footer {
    gap: 0.75rem;
    padding: 0.55rem 0.8rem;
    background: #ffffff;
    border-top: 1px solid #dbe5f3 !important;
  }

  .user-modal-footer .btn {
    min-width: 112px;
    border-radius: 0.55rem;
    font-weight: 850;
  }

  :global(html.dark) .user-modal-content,
  :global(body.dark) .user-modal-content,
  :global([data-theme='dark']) .user-modal-content {
    background: #111827;
    color: #e5edf8;
    border-color: #334155 !important;
  }

  :global(html.dark) .user-modal-header,
  :global(body.dark) .user-modal-header,
  :global([data-theme='dark']) .user-modal-header,
  :global(html.dark) .user-modal-footer,
  :global(body.dark) .user-modal-footer,
  :global([data-theme='dark']) .user-modal-footer {
    background: #111827;
    border-color: #334155 !important;
    color: #e5edf8;
  }

  :global(html.dark) .user-modal-body,
  :global(body.dark) .user-modal-body,
  :global([data-theme='dark']) .user-modal-body {
    background: #07111f;
  }

  :global(html.dark) .user-card,
  :global(body.dark) .user-card,
  :global([data-theme='dark']) .user-card,
  :global(html.dark) .permissions-table-wrap,
  :global(body.dark) .permissions-table-wrap,
  :global([data-theme='dark']) .permissions-table-wrap,
  :global(html.dark) .permission-card__header,
  :global(body.dark) .permission-card__header,
  :global([data-theme='dark']) .permission-card__header {
    background: #111827;
    border-color: #334155;
  }

  :global(html.dark) .section-heading .h3,
  :global(body.dark) .section-heading .h3,
  :global([data-theme='dark']) .section-heading .h3,
  :global(html.dark) .user-modal-header .modal-title,
  :global(body.dark) .user-modal-header .modal-title,
  :global([data-theme='dark']) .user-modal-header .modal-title {
    color: #f8fafc;
  }

  :global(html.dark) .permission-card__header h4,
  :global(body.dark) .permission-card__header h4,
  :global([data-theme='dark']) .permission-card__header h4 {
    color: #dbe7ff;
  }

  :global(html.dark) .user-photo-section,
  :global(body.dark) .user-photo-section,
  :global([data-theme='dark']) .user-photo-section {
    border-color: #334155;
  }

  :global(html.dark) .user-modal :global(.form-control),
  :global(html.dark) .user-modal :global(.form-select),
  :global(html.dark) .user-modal :global(.input-group-text),
  :global(body.dark) .user-modal :global(.form-control),
  :global(body.dark) .user-modal :global(.form-select),
  :global(body.dark) .user-modal :global(.input-group-text),
  :global([data-theme='dark']) .user-modal :global(.form-control),
  :global([data-theme='dark']) .user-modal :global(.form-select),
  :global([data-theme='dark']) .user-modal :global(.input-group-text) {
    background-color: #0f1b2d;
    border-color: #48617e;
    color: #f8fafc;
  }

  :global(html.dark) .user-modal :global(.form-label),
  :global(body.dark) .user-modal :global(.form-label),
  :global([data-theme='dark']) .user-modal :global(.form-label) {
    color: #b8c6d9;
  }

  :global(html.dark) .permissions-table,
  :global(body.dark) .permissions-table,
  :global([data-theme='dark']) .permissions-table {
    color: #e5edf8;
  }

  :global(html.dark) .user-modal-body::-webkit-scrollbar-thumb,
  :global(body.dark) .user-modal-body::-webkit-scrollbar-thumb,
  :global([data-theme='dark']) .user-modal-body::-webkit-scrollbar-thumb {
    background-color: #3f5470;
  }

  :global(html.dark) .permissions-table-wrap,
  :global(body.dark) .permissions-table-wrap,
  :global([data-theme='dark']) .permissions-table-wrap {
    scrollbar-color: #3f5470 transparent;
  }

  :global(html.dark) .permissions-table-wrap::-webkit-scrollbar-thumb,
  :global(body.dark) .permissions-table-wrap::-webkit-scrollbar-thumb,
  :global([data-theme='dark']) .permissions-table-wrap::-webkit-scrollbar-thumb {
    background-color: #3f5470;
  }

  :global(html.dark) .permissions-table thead th,
  :global(body.dark) .permissions-table thead th,
  :global([data-theme='dark']) .permissions-table thead th {
    background: #18243a;
    border-color: rgba(148, 163, 184, 0.28);
    color: #b9c7dd;
  }

  :global(html.dark) .permissions-table tbody td,
  :global(body.dark) .permissions-table tbody td,
  :global([data-theme='dark']) .permissions-table tbody td {
    background: #0f1a2d;
    border-color: rgba(148, 163, 184, 0.22);
    color: #dbeafe;
  }

  :global(html.dark) .permissions-table tbody tr:nth-child(even) td,
  :global(body.dark) .permissions-table tbody tr:nth-child(even) td,
  :global([data-theme='dark']) .permissions-table tbody tr:nth-child(even) td {
    background: #16233a;
  }

  :global(html.dark) .permissions-table td:first-child strong,
  :global(body.dark) .permissions-table td:first-child strong,
  :global([data-theme='dark']) .permissions-table td:first-child strong {
    color: #9fb0c8;
  }

  :global(html.dark) .user-modal-close,
  :global(body.dark) .user-modal-close,
  :global([data-theme='dark']) .user-modal-close {
    background-color: #f8fafc;
    border-color: #cbd5e1;
    filter: none;
  }

  :global(html.dark) .bg-body-tertiary,
  :global(body.dark) .bg-body-tertiary,
  :global([data-theme='dark']) .bg-body-tertiary {
    background-color: #0f1b2d !important;
    border: 1px solid #334155;
  }

  .user-modal[dir='rtl'] .permission-card__header,
  .user-modal[dir='rtl'] .permissions-table th:first-child,
  .user-modal[dir='rtl'] .permissions-table td:first-child,
  .user-modal[dir='rtl'] .permissions-table td:first-child strong {
    text-align: right !important;
  }

  .user-modal[dir='ltr'] .permission-card__header,
  .user-modal[dir='ltr'] .permissions-table th:first-child,
  .user-modal[dir='ltr'] .permissions-table td:first-child,
  .user-modal[dir='ltr'] .permissions-table td:first-child strong {
    text-align: left !important;
  }

  @media (max-width: 991.98px) {
    .user-modal-grid,
    .user-modal[dir='rtl'] .user-modal-grid {
      grid-template-columns: 1fr;
    }

    .user-modal[dir='rtl'] .user-profile-card,
    .user-modal[dir='rtl'] .user-permissions-card {
      grid-column: auto;
    }
  }

  @media (max-width: 575.98px) {
    .user-modal :global(.user-modal-dialog) {
      width: calc(100vw - 1rem);
      max-width: calc(100vw - 1rem);
      margin: 0.5rem auto;
    }

    .user-modal-body {
      padding: 0.8rem;
    }

    .user-card {
      padding: 0.85rem;
    }

    .permissions-toolbar {
      flex-direction: column;
    }

    .permissions-toolbar .btn,
    .user-modal-footer .btn {
      width: 100%;
    }
  }

  :global(.form-outline input:focus ~ label),
  :global(.form-outline textarea:focus ~ label) {
    color: #0d6efd;
  }
  :global(.position-relative) {
    position: relative;
  }
  :global(.btn-link) {
    text-decoration: none;
    color: #0d6efd;
  }
</style>
