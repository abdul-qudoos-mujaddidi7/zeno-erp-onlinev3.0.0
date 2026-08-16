<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { workCenterApi } from '../../api/workCenterApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import UnitModal from '../products/UnitModal.svelte';
  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let unitModalRef = null;
  const dispatch = createEventDispatcher();
  import { time_units } from '../../time.js';
import { currencyApi } from '../../api/currencyApi.js';

  let units = [];
  let currencies = [];
  let defaultCurrency = 'AFN';
  let workcentersModal;
  let name = '';
  let code = '';
  let setup_time = '';
  let setup_time_unit = 'minute';
  let description = '';
  let cost_per_hour = '';
  let cost_currency = defaultCurrency;
  let capacity_per_hour = '';
  let capacity_unit_id = 1;
  let status = 1;
  let editingId = null;

  onMount(async () => {
    const modalEl = document.getElementById('createWorkCenterModal');
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    cost_currency = defaultCurrency;
    if (window.mdb) {
      workcentersModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
  });

  export function openWorkCenterModal() {
    editingId = null;
    name = '';
    code = '';
    setup_time = '';
    setup_time_unit = 'minute';
    description = '';
    cost_per_hour = '';
    cost_currency = defaultCurrency;
    capacity_per_hour = '';
    capacity_unit_id = 1;
    status = 1;
    workcentersModal.show();
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  }

  export function editWorkCenter(workcenter) {
    editingId = workcenter.id;
    description = workcenter.description || '';
    code = workcenter.code || '';
    name = workcenter.name || '';
    setup_time = workcenter.setup_time || '';
    setup_time_unit = workcenter.setup_time_unit || 'minute';
    status = workcenter.status;
    cost_per_hour = workcenter.cost_per_hour;
    cost_currency = workcenter.cost_currency;
    capacity_per_hour = workcenter.capacity_per_hour;
    capacity_unit_id = workcenter.capacity_unit_id;
    workcentersModal.show();
  }

  function buildPayload() {
    return {
      name: (name || '').trim(),
      code: (code || '').trim(),
      description: (description || '').trim(),
      cost_per_hour: Number(cost_per_hour),
      cost_currency: cost_currency,
      setup_time,
      setup_time_unit,
      capacity_per_hour: capacity_per_hour,
      capacity_unit_id: capacity_unit_id,
      status: parseInt(status) || 1,
    };
  }

  async function saveWorkCenter() {
    if (!name?.trim()) {
      toast.error(t("Error"),t('Name is required.'));
      return;
    }
    try {
      const payload = buildPayload();
      let newId = Number(editingId);
      if (editingId) {
        const response = await workCenterApi.update(Number(editingId), payload);
        newId = response?.data?.id || Number(editingId);
        toast.success(t("Success"),t("Work Center")+t(" was successfully updated!"));
      } else {
        const response = await workCenterApi.create(payload);
        newId = response?.data?.id;
        toast.success(t("Success"),t("Work Center")+t(" was successfully added!"));
      }
      dispatch('saved', {
        id: newId,
        name: name.trim(),
        code: code.trim(),
        cost_per_hour: Number(cost_per_hour),
        cost_currency: cost_currency,
        setup_time,
        setup_time_unit,
        capacity_per_hour: capacity_per_hour,
        capacity_unit_id: capacity_unit_id,
        description,
      });
      workcentersModal.hide();
    } catch (err) {
      console.error('Failed to save work center:', err);
      alert('Error saving work center: ' + err.message);
    }
  }
  async function deleteWorkCenter(id) {
    if (confirm('Delete this work center?')) {
      await workCenterApi.remove(id);
    }
  }
</script>

<div class="modal fade" id="createWorkCenterModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Work Center') : t('New Work Center')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-name" class="form-control form-control-sm" bind:value={name} />
              <label class="form-label" for="c-name">{t('Name')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-4 d-none">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-code" class="form-control form-control-sm" bind:value={code} />
              <label class="form-label" for="c-code">{t('Code')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-3">
            <div class="input-group input-group-sm">
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input
                  type="text"
                  id="inp_setup_time"
                  class="form-control form-control-sm"
                  bind:value={setup_time} />
                <label class="form-label" for="inp_setup_time">{t('Setup Time')}</label>
              </div>
              <button
                id="showCategoryDropdown"
                class="btn btn-info btn-sm dropdown-toggle p-2"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {setup_time_unit ? t(time_units.find((c) => c == setup_time_unit)) : t('Select Time Unit')}
              </button>
              <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                {#each time_units as tu}
                  <li>
                    <button
                      class="dropdown-item {setup_time_unit == tu ? 'bg-info text-white' : ''}"
                      on:click={() => (setup_time_unit = tu)}
                      type="button">
                      {t(tu)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-cost_per_hour" class="form-control form-control-sm" bind:value={cost_per_hour} />
                <label class="form-label" for="c-cost_per_hour">{t('Cost Per Hour')}</label>
              </div>
              <button
                id="currencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {cost_currency ? t(cost_currency) : t('Currency')}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={cost_currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        cost_currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-capacity_per_hour" class="form-control form-control-sm" bind:value={capacity_per_hour} />
                <label class="form-label" for="c-capacity_per_hour">{t('Capacity Per Hour')}</label>
              </div>
              <button
                id="showUnitDropdown"
                class="btn btn-info btn-sm dropdown-toggle pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {capacity_unit_id ? units.find((u) => u.id == capacity_unit_id)?.name : t('Select Unit')}
              </button>
              <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                <li>
                  <button
                    class="dropdown-item text-info"
                    on:click={() => {
                      unitModalRef.openUnitModal();
                    }}
                    type="button">
                    <i class="bi bi-plus me-2"></i>{t('Create Unit')}
                  </button>
                </li>
                {#each units as unit}
                  <li>
                    <button
                      class="dropdown-item {capacity_unit_id == unit.id ? 'bg-info text-white' : ''}"
                      on:click={() => {
                        capacity_unit_id = unit.id;
                      }}
                      type="button">
                      {t(unit.name)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          <div class="col-md-12 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <textarea id="c-description" class="form-control form-control-sm" bind:value={description}></textarea>
              <label class="form-label" for="c-description">{t('Description')}</label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={saveWorkCenter}>
          {editingId ? t('Update')+" "+t('WorkCenter') : t('Save')+" "+t('Work Center')}
        </button>
      </div>
    </div>
  </div>
</div>

<UnitModal
  bind:this={unitModalRef}
  on:saved={async (e) => {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    capacity_unit_id = e.detail.id;
  }} />
