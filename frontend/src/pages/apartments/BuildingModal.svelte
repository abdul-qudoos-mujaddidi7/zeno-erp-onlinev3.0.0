<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { buildingApi } from '../../api/buildingApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { toast } from '../../ToastUI/toast.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let buildingsModal;

  let name = '';
  let address = '';
  let total_floors = '';
  let total_units = '';
  let building_type = '';
  let description = '';
  let code = '';
  let status = 1;
  let editingId = null;

  onMount(async () => {
    const modalEl = document.getElementById('createBuildingModal');
    if (window.mdb) {
      buildingsModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
  });

  export function openBuildingModal() {
    editingId = null;
    name = '';
    address = '';
    total_floors = '';
    total_units = '';
    building_type = '';
    description = '';
    code = '';
    status = 1;
    buildingsModal.show();
  }

  export function editBuilding(building) {
    editingId = building.id;
    description = building.description || '';
    address = building.address || '';
    total_floors = building.total_floors || '';
    total_units = building.total_units || '';
    building_type = building.building_type || '';
    name = building.name || '';
    status = building.status;
    code = building.code || '';
    buildingsModal.show();
  }

  async function saveBuilding() {
    if (!name?.trim()) {
      toast.error(t('Error'), 'Building name is required.');
      return;
    }
    if (!code?.trim()) {
      toast.error(t('Error'), 'Building code is required.');
      return;
    }
    if (!total_floors) {
      toast.error(t('Error'), 'total_floors is required.');
      return;
    }

    const payload = {
      name: (name || '').trim(),
      address: (address || '').trim() || null,
      code: (code || '').trim(),
      total_floors: parseInt(total_floors) || 0,
      total_units: parseInt(total_units) || 0,
      building_type: (building_type || '').trim() || null,
      description: (description || '').trim() || null,
      status: parseInt(status) || 1,
    };

    try {
      let response;

      if (editingId) {
        response = await buildingApi.update(Number(editingId), payload);
      } else {
        response = await buildingApi.create(payload);
      }

      const saved = response?.data || {};

      dispatch('saved', {
        id: saved.id ?? editingId,
        name: saved.name ?? payload.name,
        address: saved.address ?? payload.address,
        code: saved.code ?? payload.code,
        total_floors: saved.total_floors ?? payload.total_floors,
        total_units: saved.total_units ?? payload.total_units,
        building_type: saved.building_type ?? payload.building_type,
        description: saved.description ?? payload.description,
        status: saved.status ?? payload.status,
      });
      toast.success(
        t('Success'),
        editingId ? t('Building updated successfully.') : t('Building created successfully.'),
      );
      buildingsModal.hide();
    } catch (err) {
      console.error('Failed to save building:', err);
      toast.error(t('Error'), t('Error saving building: ') + (err.message || err));
    }
  }

  async function deleteBuilding(id) {
    if (!confirm('Delete this building?')) return;

    try {
      await buildingApi.remove(id);
      dispatch('saved');
    } catch (err) {
      console.error('Failed to delete building:', err);
      toast.error(t('Error'), err.message || 'Failed to delete building.');
    }
  }
</script>

<div class="modal fade" id="createBuildingModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Building') : t('New Building')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-name" class="form-control" bind:value={name} />
              <label class="form-label" for="c-name">{t('Name')}{t('-of-')}{t('Building')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-code" class="form-control" bind:value={code} />
              <label class="form-label" for="c-code">{t('Code')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-floors" class="form-control" bind:value={total_floors} />
              <label class="form-label" for="c-total-floors">{t('Total')} {t('Floors')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-units" class="form-control" bind:value={total_units} />
              <label class="form-label" for="c-total-units">{t('Total')} {t('Units')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-building-type" class="form-control" bind:value={building_type} />
              <label class="form-label" for="c-building-type">{t('Type')}{t('-of-')}{t('Building')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-address" class="form-control" bind:value={address} />
              <label class="form-label" for="c-address">{t('Address')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>

          <!-- <div class="col-md-12 mb-4">
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
                    </div> -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveBuilding}>
          {editingId ? t('Update Building') : t('Save Building')}
        </button>
      </div>
    </div>
  </div>
</div>
