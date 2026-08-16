<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { toast } from '../../../ToastUI/toast.js';

  import { t, lang, translate_org_type, settings_all,refreshSettings } from '../../../i18n/i18n';
  import AccountGroupModal from '../../accounts/AccountGroupModal.svelte';

  import WhatsappModal from '../../WhatsappModal.svelte';
  import { accountGroupApi } from '../../../api/accountGroupApi.js';
  import { settingsApi } from '../../../api/settingsApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { accountImageApi } from '../../../api/accountImageApi.js';

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let patientTypes = [];

  let WhatsappModalRef = null;

  let main_group = null;
  async function loadMainGroup() {
    try {
      const response = await accountGroupApi.getById(1);
      main_group = response?.data || null;
    } catch (err) {
      if (err?.status === 404) {
        // Main group missing - create it through the backend API
        try {
          const created = await accountGroupApi.create({
            name: 'عمومی',
            code: 'عمومی',
            description: 'Main Group',
            status: 1,
          });
          main_group = created?.data || null;
        } catch (createErr) {
          console.error('Failed to create main account group:', createErr);
        }
      } else {
        console.error('Failed to load main account group:', err);
      }
    }
  }

  let catModalRef = null;

  let currencies = [];
  export let defaultCurrency = 'AFN';

  let account_groups = [];

  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

  const dispatch = createEventDispatcher();

  // Form fields
  export let patient = null; // if editing, pass the patient object

  function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  $: patient_index = Number($settings_all.find((s) => s.key === 'patient_index')?.value) || 1;
  $: patient_index_prefix = $settings_all.find((s) => s.key === 'patient_index_prefix')?.value || 'P';

  function generatePatientCode() {
    const index = Number(patient_index) || 1;
    return patient_index_prefix + index.toString().padStart(6, '0');
  }
  export let showPatientModal = false;

  let patient_type_id = 1;
  let account_group_id = 1;
  let code = generatePatientCode();
  let nid = '';
  let password = '';
  let name = '';
  let main_acc = false;
  let name_fa = '';
  $: name_fa = name;
  $: name_ps = name;


  let description = '';
  let account_status = 'active';
  let phone = '';
  let phone2 = '';
  let email = '';
  let address = '';
  let status = 1;

  let initialBalanceType = 'Debit'; // or "credit"

  let imageBase64 = null;
  let modalImageUrl = null;

  
  async function loadAll() {
    let allAccounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    if (allAccounts.length < 10) {
      setTimeout(() => {
        loadAll();
      }, 2000);
      return;
    }
    await loadMainGroup();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }

    account_groups = (await accountGroupApi.getAll({ status: 1 }))?.data || [];
    if (patient) await loadPatient(patient);
  }
  onMount(async () => {
    await loadAll();
  });
  onMount(async () => {
      await loadAll();
    
  });

  $: if (patient) {
    async () => {
      await loadPatient(patient);
    };
  }
  async function loadPatient(acc) {
    if (acc) {
      patient_type_id = acc.patient_type_id;
      account_group_id = acc.account_group_id;
      code = acc.code;
      password = acc.password;
      nid = acc.nid;
      name = acc.name;
      name_fa = acc.name;
      account_status = acc.account_status || 'active';
      name_ps = acc.name;
      description = acc.description;
      phone = acc.phone || '';
      phone2 = acc.phone2 || '';
      email = acc.email || '';
      address = acc.address || '';
      status = acc.status;
      modalImageUrl = acc.imageUrl;
      imageBase64 = null;
      patient = acc;
    } else {
      patient_type_id = patientTypes.length == 1 ? patientTypes[0].id : 1;
      account_group_id = 1;
      code = generatePatientCode();
      nid = '';
      password = '';
      name = '';
      account_status = 'active';
      name_fa = '';
      name_ps = name_fa;
      description = '';
      phone = '';
      phone2 = '';
      email = '';
      address = '';
      status = 1;
      modalImageUrl = null;
      imageBase64 = null;
      patient = null;
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files[0];
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

          // keep aspect ratio
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;

          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;

          canvas.width = canvasSize;
          canvas.height = canvasSize;

          // white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // draw contained image
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

  async function savePatient() {
    const nidTrimmed = (nid || '').trim();
    const codeTrimmed = (code || '').trim();
    const nameTrimmed = (name || '').trim();
    const passwordTrimmed = (password || '').trim();

    if (!patient_type_id) {
      toast.error(t('Error'), t('Please select an patient type.'));
      return;
    }

    if (enable_account_groups && !account_group_id) {
      toast.error(t('Error'), t('Please select an patient group'));
      return;
    }

    if (!codeTrimmed || !nameTrimmed) {
      toast.error(t('Error'), t('Name is required'));
      return;
    }

    try {
      const existing = await (await accountApi.getAll({ status: 1, code: codeTrimmed }))?.data?.[0];
      if (existing && existing.id !== patient?.id) {
        toast.error(t('Error'), t('Code already exists! Please choose a different code.'));
        return;
      }

      let patientId;
      if (patient?.id) {
        await accountApi.update(patient.id, {
          account_type_id: 4,
          patient_type_id,
          account_group_id,
          code: codeTrimmed,
          nid: nidTrimmed,
          name: nameTrimmed,
          name_fa,
          name_ps,
          account_status,
          description,
          phone,
          phone2,
          email,
          address,
          status: parseInt(status) || 1,
        });
        patientId = patient.id;
      } else {
        let newData = {
          account_type_id: 4,
          patient_type_id,
          account_group_id,
          code: codeTrimmed,
          password: passwordTrimmed,
          nid: nidTrimmed,
          name: nameTrimmed,
          name_fa,
          name_ps,
          account_status,
          description,
          phone,
          phone2,
          email,
          address,
          status: parseInt(status) || 1,
        };
        const created = await accountApi.create({
          account_type_id: 4,
          patient_type_id,
          account_group_id,
          code: codeTrimmed,
          nid: nidTrimmed,
          name: nameTrimmed,
          name_fa,
          name_ps,
          account_status,
          description,
          phone,
          phone2,
          email,
          address,
          status: parseInt(status) || 1,
        });
        patientId = created?.data?.id;

        const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'patient_index' }))?.data?.[0];
        if (_indexSetting) {
          await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
        }
        await refreshSettings();

        if (!patientId) throw new Error('Failed to create patient');
        if (newData.phone.length >= 10) {
          WhatsappModalRef.openModal('patient_created_template', patientId, newData);
        }
      }
      if (imageBase64) {
        const existingImages =
          (await accountImageApi.getAll({
            status: 1,
            account_id: patientId,
          }))?.data || [];

        for (const img of existingImages) {
          await accountImageApi.remove(img.id);
        }

        await accountImageApi.create({
          account_id: patientId,
          image: imageBase64,
          status: 1,
        });
      }
      dispatch('saved', {
        patient: {
          id: patientId,
          name,
          name_fa,
          name_ps,
          account_type_id:4,
          patient_type_id,
          account_group_id,
        },
      });
      showPatientModal = false;

      toast.success(t('Success'), t('Patient created successfully.'));
    } catch (err) {
      console.error('Failed to save patient:', err);
      toast.error(t('Error'), t('An error occurred while saving the patient. Please try again.'));
    }
  }
  // Expose openModal to parent via component instance
  export async function openModal(patient = null) {
    await loadPatient(patient);
    showPatientModal = true;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 10);
  }

  export function closeModal() {
    showPatientModal = false;
  }

  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary', 'secondary', 'danger', 'success', 'info', 'warning', 'dark', 'secondary'];
    return colors[type];
  }
</script>

{#if showPatientModal}
  <!-- Modal -->
  <div class="modal show d-block" id="patientModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {@html patient?.id
              ? `<i class="bi bi-pencil"></i> ` + t('Edit Patient')
              : `<i class="bi bi-plus"></i> ` + t('New Patient')}
          </h5>
          <button type="button" class="btn-close" on:click={closeModal}></button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-4 pb-3 border-bottom">
            <div class="mb-2">
              <img
                src={modalImageUrl || '/img/no-photo.jpg'}
                alt="User Profile"
                width="100"
                height="100"
                style="object-fit: cover; border-radius: 50%; border: 3px solid #e9ecef;" />
            </div>
            <div class="d-flex justify-content-center">
              <label class="btn btn-outline-primary btn-sm px-2">
                <i class="bi bi-camera"></i>
                {t('Upload Photo')}
                <input type="file" accept="image/*" on:change={handleImageUpload} hidden />
              </label>
            </div>
          </div>
          <div class="row g-2">
            <div class="col-md-12">
              <div class="input-group input-group-sm">
                {#if enable_account_groups}
                  <button
                    id="showAccountGroupDropdown"
                    class="btn btn-primary btn-sm dropdown-toggle pt-1"
                    type="button"
                    data-mdb-toggle="dropdown"
                    aria-expanded="false">
                    {#if account_group_id}
                      {#each account_groups as group}
                        {#if group.id == account_group_id}
                          {group.name}
                        {/if}
                      {/each}
                    {:else}
                      {t('Select Patient Group')}
                    {/if}
                  </button>

                  <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                    <li>
                      <button
                        class="dropdown-item text-info"
                        on:click={() => {
                          catModalRef.openAccountGroupModal();
                        }}
                        type="button">
                        <i class="bi bi-plus me-2"></i>{t('Create Patient Group')}
                      </button>
                    </li>
                    {#each account_groups as group}
                      <li>
                        <button
                          class="dropdown-item {account_group_id == group.id ? 'bg-primary text-white' : ''}"
                          on:click={() => (account_group_id = group.id)}
                          type="button">
                          {group.name}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <div class="form-outline" data-mdb-input-init>
                  <input type="text" class="form-control form-control-sm" bind:value={name} />
                  <label class="form-label">{t('Name')}</label>
                </div>

                <button
                  id="showUnitDropdown"
                  class="btn btn-{getPatientTypeColor(patient_type_id || 0)} btn-sm dropdown-toggle pt-1"
                  type="button"
                  data-mdb-toggle="dropdown"
                  aria-expanded="false">
                  {#if patient_type_id}
                    {#each patientTypes as type}
                      {#if type.id == patient_type_id}
                        {#if t('Lang') === 'en' && type.name}{type.name}{/if}
                        {#if t('Lang') === 'fa' && type.name_fa}{type.name_fa}{/if}
                        {#if t('Lang') === 'ps' && type.name_ps}{type.name_ps}{/if}
                      {/if}
                    {/each}
                  {:else}
                    {t('Select Patient Type')}
                  {/if}
                </button>

                <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                  {#each patientTypes as type}
                    <li>
                      <button
                        class="dropdown-item {patient_type_id == type.id
                          ? 'bg-' + getPatientTypeColor(type.id) + ' text-white'
                          : ''}"
                        on:click={() => (patient_type_id = type.id)}
                        type="button">
                        {#if t('Lang') === 'en' && type.name}{type.name}{/if}
                        {#if t('Lang') === 'fa' && type.name_fa}{type.name_fa}{/if}
                        {#if t('Lang') === 'ps' && type.name_ps}{type.name_ps}{/if}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>

            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" readonly class="form-control form-control-sm" bind:value={code} />
                <label class="form-label">{t('Code')}</label>
              </div>
            </div>

            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" class="form-control form-control-sm" bind:value={nid} />
                <label class="form-label">{t('NID')}</label>
              </div>
            </div>

            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" class="form-control form-control-sm" bind:value={phone} />
                <label class="form-label">{t('Whatsapp Number')}</label>
              </div>
            </div>

            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" class="form-control form-control-sm" bind:value={phone2} />
                <label class="form-label">{t('Phone 2')}</label>
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" class="form-control form-control-sm" bind:value={email} />
                <label class="form-label">{t('Email')}</label>
              </div>
            </div>
            <div class="col-md-6">
              <div class="form-outline" data-mdb-input-init>
                <input type="text" class="form-control form-control-sm" bind:value={address} />
                <label class="form-label">{t('Address')}</label>
              </div>
            </div>
            <div class="col-md-12">
              <div class="form-outline" data-mdb-input-init>
                <textarea class="form-control form-control-sm" bind:value={description}></textarea>
                <label class="form-label">{t('Description')}</label>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-link text-dark" on:click={closeModal}
            ><i class="bi bi-x-lg"></i> {t('Close')}</button>
          <button type="button" class="btn btn-primary" on:click={savePatient}
            >{@html patient?.id
              ? `<i class="bi bi-pencil"></i> ` + t('Update')
              : `<i class="bi bi-save"></i> ` + t('Save')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<AccountGroupModal
  bind:this={catModalRef}
  on:saved={async (e) => {
    account_groups = (await accountGroupApi.getAll({ status: 1 }))?.data || [];
    account_group_id = e.detail.id;
  }} />

<WhatsappModal bind:this={WhatsappModalRef} />
