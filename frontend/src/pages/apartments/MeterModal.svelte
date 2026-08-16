<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { utilityMeterApi } from '../../api/utilityMeterApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let metersModal;

  let apartment_id = '';
  let meter_number = '';
  let now = new Date().toISOString().slice(0, 10);
  let installation_date = now;
  let utility_type = '';
  let initial_reading = '';
  let current_reading = '';
  let description = '';
  let status = 1;
  let editingId = null;
  let apartments = [];
  let buildings = [];
  let floors = [];

  function handleDateChange(inputName, value) {
    if (inputName === 'installation_date') installation_date = value;
  }

  async function loadBuildings() {
    try {
      const response = await buildingApi.getAll({ status: 1 });
      buildings = response?.data || [];
    } catch (err) {
      console.error('Failed to load buildings:', err);
      buildings = [];
    }
  }

  async function loadFloors() {
    try {
      const response = await floorApi.getAll({ status: 1 });
      floors = response?.data || [];
    } catch (err) {
      console.error('Failed to load floors:', err);
      floors = [];
    }
  }

  async function loadApartments() {
    try {
      const response = await apartmentApi.getAll({ status: 1 });
      apartments = response?.data || [];
    } catch (err) {
      console.error('Failed to load apartments:', err);
      apartments = [];
    }
  }

  let componentRoot;

  onMount(async () => {
    const modalEl = document.getElementById('createMeterModal');
    if (window.mdb) {
      metersModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadApartments();
    loadBuildings();
    loadFloors();

    setDatePickers(handleDateChange, componentRoot);
  });

  export function openMeterModal() {
    loadApartments();
    editingId = null;
    meter_number = '';
    apartment_id = '';
    installation_date = now;
    utility_type = '';
    initial_reading = '';
    current_reading = '';
    description = '';
    status = 1;
    metersModal.show();
  }

  export function editMeter(meter) {
    loadApartments();
    editingId = meter.id;
    description = meter.description || '';
    meter_number = meter.meter_number || '';
    apartment_id = meter.apartment_id || '';
    status = meter.status;
    installation_date = meter.installation_date;
    utility_type = meter.utility_type;
    initial_reading = meter.initial_reading;
    current_reading = meter.current_reading;
    metersModal.show();
  }

  async function saveMeter() {
    if (!apartment_id) {
      toast.error(t('Error'), 'Apartment is required.');
      return;
    }
    if (!meter_number) {
      toast.error(t('Error'), 'meter_number is required.');
      return;
    }

    const payload = {
      meter_number: meter_number || '',
      apartment_id: apartment_id || 0,
      description: (description || '').trim() || null,
      status: parseInt(status) || 1,
      installation_date: installation_date,
      utility_type: utility_type || '',
      initial_reading: parseFloat(initial_reading) || 0,
      current_reading: parseFloat(current_reading) || 0,
    };

    try {
      let response;

      if (editingId) {
        response = await utilityMeterApi.update(Number(editingId), payload);
      } else {
        response = await utilityMeterApi.create(payload);
      }

      const saved = response?.data || {};

      dispatch('saved', {
        id: saved.id ?? editingId,
        meter_number: saved.meter_number ?? payload.meter_number,
        apartment_id: saved.apartment_id ?? payload.apartment_id,
        description: saved.description ?? payload.description,
        status: saved.status ?? payload.status,
        installation_date: saved.installation_date ?? payload.installation_date,
        utility_type: saved.utility_type ?? payload.utility_type,
        initial_reading: saved.initial_reading ?? payload.initial_reading,
        current_reading: saved.current_reading ?? payload.current_reading,
      });
      toast.success(
        t('Success'),
        editingId ? t('Meter updated successfully.') : t('Meter created successfully.'),
      );
      metersModal.hide();
    } catch (err) {
      console.error('Failed to save meter:', err);
      toast.error(t('Error'), t('Error saving meter: ') + (err.message || err));
    }
  }

  async function deleteMeter(id) {
    if (!confirm('Delete this meter?')) return;

    try {
      await utilityMeterApi.remove(id);
      dispatch('saved');
    } catch (err) {
      console.error('Failed to delete meter:', err);
      toast.error(t('Error'), err.message || 'Failed to delete meter.');
    }
  }
</script>

<div class="modal fade" id="createMeterModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Meter') : t('New Meter')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <select
              class="form-select"
              id="c-meter-type"
              bind:value={apartment_id}>
              <option value="" disabled>{t('Select') + ' ' + t('Apartment')}</option>
              {#each apartments as apartment}
                <option value={apartment.id}>{t("Apartment")}: {apartment.unit_number} - {t("Floor")}: {floors.find((f) => f.id === apartment.floor_id)?.floor_number || ''} - {t("Building")}: {buildings.find((b) => b.id === apartment.building_id)?.name || ''} ({buildings.find((b) => b.id === apartment.building_id)?.code || ''})</option>
              {/each}
            </select>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-total-meters" class="form-control" bind:value={meter_number} />
              <label class="form-label" for="c-total-meters">{t('Meter Number')}</label>
            </div>
          </div>


          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-installation_date" class="form-control form-control-sm" data-bind="installation_date" bind:value={installation_date} />
                <label class="form-label" for="c-installation_date">{t('Installation Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-initial_reading" class="form-control" bind:value={initial_reading} />
                <label class="form-label" for="c-initial_reading">{t('Initial Reading')}</label>
              </div>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-current_reading" class="form-control" bind:value={current_reading} />
                <label class="form-label" for="c-current_reading">{t('Current Reading')}</label>
              </div>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-utility_type" class="form-control" bind:value={utility_type} />
              <label class="form-label" for="c-utility_type">{t('Utility Type')}</label>
            </div>
          </div>


          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>

        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveMeter}>
          {editingId ? t('Update Meter') : t('Save Meter')}
        </button>
      </div>
    </div>
  </div>
</div>
