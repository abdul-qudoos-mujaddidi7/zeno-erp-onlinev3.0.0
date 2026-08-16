<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { meterReadingApi } from '../../api/meterReadingApi.js';
  import { utilityMeterApi } from '../../api/utilityMeterApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { leaseApi } from '../../api/leaseApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { journalApi } from '../../api/journalApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let meter_readingsModal;

  let currencies = [];
  let meter_id = '';
  let previous_reading = '';
  let current_reading = '';
  let consumption = '';
  let now = new Date().toISOString().slice(0, 10);
  let reading_date = now;
  let rate_per_unit = '';
  let calculated_amount = '';
  let defaultCurrency = 'AFN';
  let currency = 'AFN';

  let description = '';
  let status = 1;
  let editingId = null;
  let meters = [];
  let buildings = [];
  let floors = [];
  let apartments = [];

  async function loadApartments() {
    try {
      const response = await apartmentApi.getAll({ status: 1 });
      apartments = response?.data || [];
    } catch (err) {
      console.error('Failed to load apartments:', err);
      apartments = [];
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'reading_date') reading_date = value;
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

  async function loadMeters() {
    try {
      const response = await utilityMeterApi.getAll({ status: 1 });
      meters = response?.data || [];
    } catch (err) {
      console.error('Failed to load meters:', err);
      meters = [];
    }
  }

  let componentRoot;

  onMount(async () => {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = defaultCurrency;
    const modalEl = document.getElementById('createMeterReadingModal');
    if (window.mdb) {
      meter_readingsModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadMeters();
    loadBuildings();
    loadFloors();
    loadApartments();
    setDatePickers(handleDateChange, componentRoot);
  });

  export function openMeterReadingModal() {
    loadMeters();
    editingId = null;
    current_reading = '';
    consumption = '';
    meter_id = '';
    reading_date = now;
    rate_per_unit = '';
    calculated_amount = '';
    currency = defaultCurrency;
    previous_reading = '';
    description = '';
    status = 1;
    meter_readingsModal.show();
  }

  export function editMeterReading(meter_reading) {
    loadMeters();
    editingId = meter_reading.id;
    description = meter_reading.description || '';
    current_reading = meter_reading.current_reading || '';
    consumption = meter_reading.consumption || '';
    meter_id = meter_reading.meter_id || '';
    previous_reading = meter_reading.previous_reading || '';
    status = meter_reading.status;
    reading_date = meter_reading.reading_date;
    rate_per_unit = meter_reading.rate_per_unit;
    calculated_amount = meter_reading.calculated_amount;
    currency = meter_reading.currency;
    meter_readingsModal.show();
  }

  async function saveMeterReading() {
    if (!meter_id) {
      toast.error(t('Error'), 'Apartment is required.');
      return;
    }
    if (!previous_reading) {
      toast.error(t('Error'), 'Account is required.');
      return;
    }
    if (!current_reading) {
      toast.error(t('Error'), 'current_reading is required.');
      return;
    }
    if (!consumption) {
      toast.error(t('Error'), 'consumption is required.');
      return;
    }
    try {
      const receivableAccount = await (await accountApi.getAll({ status: 1, code: 'RECEIVABLE' }))?.data?.[0];

      if (!receivableAccount) {
        throw new Error('RECEIVABLE account not found');
      }

      const myMeter = meters.find((l) => l.id == meter_id);
      let myApartment = null;
      if (myMeter?.apartment_id) {
        myApartment =
          apartments.find((a) => a.id == myMeter.apartment_id) ||
          (await apartmentApi.getById(myMeter.apartment_id))?.data ||
          null;
      }
      let customerAccount = null;
      if (myApartment?.id) {
        const leaseRes = await leaseApi.getAll({ status: 1, apartment_id: myApartment.id });
        const leaseList = leaseRes?.data || [];
        const myLease = leaseList.length
          ? leaseList.sort((a, b) => Number(a.id) - Number(b.id))[leaseList.length - 1]
          : null;
        customerAccount = myLease?.tenant_account_id;
      }

      const payload = {
        current_reading: parseInt(current_reading) || 0,
        consumption: parseInt(consumption) || 0,
        meter_id: meter_id || 0,
        previous_reading: previous_reading || 0,
        description: (description || '').trim() || null,
        status: parseInt(status) || 1,
        reading_date: reading_date,
        rate_per_unit: parseFloat(rate_per_unit) || 0,
        calculated_amount: parseFloat(calculated_amount) || 0,
        currency: currency || '',
      };

      let newId = Number(editingId);
      let response;

      if (editingId) {
        response = await meterReadingApi.update(Number(editingId), payload);
        const saved = response?.data || {};
        newId = saved.id ?? Number(editingId);

        let oldJournal =
          (await journalApi.getAll({
            status: 1,
            reference_type: 'meter_reading',
            reference_id: Number(editingId),
          }))?.data?.[0] || null;
        if (oldJournal) {
          await journalApi.update(oldJournal.id, {
            date: reading_date,
            description: description || `meter_reading Reading #${parseInt(meter_id)}`,
            currency: currency || '',
            first_entry_account: customerAccount,
            first_entry_debit: parseFloat(calculated_amount) || 0,
            first_entry_credit: 0,
            second_entry_account: receivableAccount.id,
            second_entry_debit: 0,
            second_entry_credit: parseFloat(calculated_amount) || 0,
            status: 1,
          });
        }
      } else {
        response = await meterReadingApi.create(payload);
        const saved = response?.data || {};
        newId = saved.id;
        await journalApi.create({
          date: reading_date,
          reference_id: newId,
          reference_type: 'meter_reading',
          description: description || `meter_reading Reading #${parseInt(meter_id)}`,
          currency: currency || '',
          first_entry_account: customerAccount,
          first_entry_debit: parseFloat(calculated_amount) || 0,
          first_entry_credit: 0,
          second_entry_account: receivableAccount.id,
          second_entry_debit: 0,
          second_entry_credit: parseFloat(calculated_amount) || 0,
          status: 1,
        });
      }

      const saved = response?.data || {};
      dispatch('saved', {
        id: saved.id ?? newId,
        current_reading: saved.current_reading ?? payload.current_reading,
        consumption: saved.consumption ?? payload.consumption,
        meter_id: saved.meter_id ?? payload.meter_id,
        previous_reading: saved.previous_reading ?? payload.previous_reading,
        description: saved.description ?? payload.description,
        status: saved.status ?? payload.status,
        reading_date: saved.reading_date ?? payload.reading_date,
        rate_per_unit: saved.rate_per_unit ?? payload.rate_per_unit,
        calculated_amount: saved.calculated_amount ?? payload.calculated_amount,
        currency: saved.currency ?? payload.currency,
      });
      toast.success(
        t('Success'),
        editingId ? t('Meter Reading updated successfully.') : t('Meter Reading created successfully.'),
      );
      meter_readingsModal.hide();
    } catch (err) {
      console.error('Failed to save meter_reading:', err);
      toast.error(t('Error'), t('Error saving meter_reading: ') + (err.message || err));
    }
  }

  async function deleteMeterReading(id) {
    if (!confirm('Delete this meter_reading?')) return;

    try {
      await meterReadingApi.remove(id);
      dispatch('saved');
    } catch (err) {
      console.error('Failed to delete meter reading:', err);
      toast.error(t('Error'), err.message || 'Failed to delete meter reading.');
    }
  }

  $: consumption = (parseInt(current_reading) || 0) - (parseInt(previous_reading) || 0);
  $: calculated_amount = (parseFloat(consumption) || 0) * (parseFloat(rate_per_unit) || 0);
</script>

<div class="modal fade" id="createMeterReadingModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Meter Reading') : t('New Meter Reading')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <select
              class="form-select"
              id="c-meter_reading-type"
              bind:value={meter_id}>
              <option value="" disabled>{t('Select') + ' ' + t('Meter')}</option>
              {#each meters as meter}
                <option value={meter.id}>{t("Meter")}: {meter.meter_number} - {t('Apartment')}: {apartments.find((b) => b.id === meter.apartment_id)?.unit_number || ''} - {t('Floor')}: {floors.find((b) => b.id === apartments.find((a) => a.id === meter.apartment_id)?.floor_id)?.floor_number || 0} - {t('Building')}: {buildings.find((b) => b.id === apartments.find((a) => a.id === meter.apartment_id)?.building_id)?.name || ''}</option>
              {/each}
            </select>
          </div>
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-previous_reading" class="form-control" bind:value={previous_reading} />
              <label class="form-label" for="c-previous_reading">{t('Previous Reading')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-reading_date" class="form-control form-control-sm" data-bind="reading_date" bind:value={reading_date} />
                <label class="form-label" for="c-reading_date">{t('Reading Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>
          
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-current_reading" class="form-control" bind:value={current_reading} />
              <label class="form-label" for="c-current_reading">{t('Current Reading')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-area" class="form-control" readonly bind:value={consumption} />
              <label class="form-label" for="c-area">{t('Consumption')}</label>
            </div>
          </div>
          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-rate_per_unit" class="form-control" bind:value={rate_per_unit} />
                <label class="form-label" for="c-rate_per_unit">{t('Rate Per Unit')}</label>
              </div>
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
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
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-calculated_amount" class="form-control" readonly bind:value={calculated_amount} />
                <label class="form-label" for="c-calculated_amount">{t('Calculated Amount')}</label>
              </div>
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : ''}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => {
                        currency = cur.code;
                      }}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
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
        <button type="button" class="btn btn-primary" on:click={saveMeterReading}>
          {editingId ? t('Update Meter Reading') : t('Save Meter Reading')}
        </button>
      </div>
    </div>
  </div>
</div>
