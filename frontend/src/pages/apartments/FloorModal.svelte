<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { floorApi } from '../../api/floorApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { toast } from '../../ToastUI/toast.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let floorsModal;

  let building_id = '';
  let floor_number = '';
  let total_units_on_floor = '';
  let description = '';
  let status = 1;
  let editingId = null;
  let buildings = [];

  async function loadBuildings() {
    try {
      const response = await buildingApi.getAll({ status: 1 });
      buildings = response?.data || [];
    } catch (err) {
      console.error('Failed to load buildings:', err);
      buildings = [];
    }
  }

  onMount(async () => {
    const modalEl = document.getElementById('createFloorModal');
    if (window.mdb) {
      floorsModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    loadBuildings();
  });

  export function openFloorModal() {
    loadBuildings();
    editingId = null;
    floor_number = '';
    total_units_on_floor = '';
    building_id = '';
    description = '';
    status = 1;
    floorsModal.show();
  }

  export function editFloor(floor) {
    loadBuildings();
    editingId = floor.id;
    description = floor.description || '';
    floor_number = floor.floor_number || '';
    total_units_on_floor = floor.total_units_on_floor || '';
    building_id = floor.building_id || '';
    status = floor.status;
    floorsModal.show();
  }

  async function saveFloor() {
    if (!building_id) {
      toast.error(t('Error'), 'Building is required.');
      return;
    }
    if (!floor_number && floor_number !== 0) {
      toast.error(t('Error'), 'floor_number is required.');
      return;
    }

    if (!total_units_on_floor) {
      toast.error(t('Error'), 'total_units_on_floor is required.');
      return;
    }

    const payload = {
      floor_number: parseInt(floor_number) || 0,
      total_units_on_floor: parseInt(total_units_on_floor) || 0,
      building_id: building_id || 0,
      description: (description || '').trim() || null,
      status: parseInt(status) || 1,
    };

    try {
      let response;

      if (editingId) {
        response = await floorApi.update(Number(editingId), payload);
      } else {
        response = await floorApi.create(payload);
      }

      const saved = response?.data || {};

      dispatch('saved', {
        id: saved.id ?? editingId,
        floor_number: saved.floor_number ?? payload.floor_number,
        total_units_on_floor: saved.total_units_on_floor ?? payload.total_units_on_floor,
        building_id: saved.building_id ?? payload.building_id,
        description: saved.description ?? payload.description,
        status: saved.status ?? payload.status,
      });
      toast.success(
        t('Success'),
        editingId ? t('Floor updated successfully.') : t('Floor created successfully.'),
      );
      floorsModal.hide();
    } catch (err) {
      console.error('Failed to save floor:', err);
      toast.error(t('Error'), t('Error saving floor: ') + (err.message || err));
    }
  }

  async function deleteFloor(id) {
    if (!confirm('Delete this floor?')) return;

    try {
      await floorApi.remove(id);
      dispatch('saved');
    } catch (err) {
      console.error('Failed to delete floor:', err);
      toast.error(t('Error'), err.message || 'Failed to delete floor.');
    }
  }
</script>

<div class="modal fade" id="createFloorModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Floor') : t('New Floor')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
         
          <div class="col-md-12 mb-4">
          
              <select class="form-select" id="c-floor-type" bind:value={building_id}>
                <option value="" disabled>{t('Select')+' '+t('Building')}</option>
                {#each buildings as building}
                  <option value={building.id}>{building.name} ({building.code})</option>
                {/each}
              </select>
          </div>


          
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-floors" class="form-control" bind:value={floor_number} />
              <label class="form-label" for="c-total-floors">{t('Floor Number')}</label>
            </div>
          </div>

          
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-total-units" class="form-control" bind:value={total_units_on_floor} />
              <label class="form-label" for="c-total-units">{t('Total')} {t('Units')}</label>
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
        <button type="button" class="btn btn-primary" on:click={saveFloor}>
          {editingId ? t('Update Floor') : t('Save Floor')}
        </button>
      </div>
    </div>
  </div>
</div>
