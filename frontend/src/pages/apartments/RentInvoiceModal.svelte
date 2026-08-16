<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { rentInvoiceApi } from '../../api/rentInvoiceApi.js';
  import { leaseApi } from '../../api/leaseApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';

  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();
  import { showDate, setDatePickers } from '../../calendar.js';

  let rent_invoicesModal;

  import { toast } from '../../ToastUI/toast.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { journalApi } from '../../api/journalApi.js';

  let currencies = [];

  let componentRoot = null;

  let lease_id = '';
  let invoice_number = '';

  function handleDateChange(inputName, value) {
    if (inputName === 'issue_date') issue_date = value;
    if (inputName === 'due_date') due_date = value;
    if (inputName === 'billing_period_start') billing_period_start = value;
    if (inputName === 'billing_period_end') billing_period_end = value;
  }

  let now = new Date().toISOString().slice(0, 10);

  let issue_date = now;
  let due_date = now;

  let billing_period_start = now;
  let billing_period_end = now;
  let total_amount = '';
  let invoice_status = '';
  let base_rent = '';
  let utility_charges = '';
  let defaultCurrency = 'AFN';
  let currency = 'AFN';
  let late_fee = '';

  $: total_amount =
    (parseFloat(base_rent) || 0) +
    (parseFloat(utility_charges) || 0) +
    (parseFloat(late_fee) || 0) +
    (parseFloat(other_charges) || 0);

  let other_charges = '';
  let paid_amount = '';

  let description = '';
  let status = 1;
  let editingId = null;
  let leases = [];
  let apartments = [];
  let floors = [];
  let buildings = [];
  let accounts = [];

  async function loadApartments() {
    try {
      const [aptRes, flrRes, bldRes] = await Promise.all([
        apartmentApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
        buildingApi.getAll({ status: 1 }),
      ]);
      apartments = aptRes?.data || [];
      floors = flrRes?.data || [];
      buildings = bldRes?.data || [];
    } catch (err) {
      console.error('Failed to load apartments/floors/buildings:', err);
      apartments = [];
      floors = [];
      buildings = [];
    }
  }

  async function loadLeases() {
    try {
      const response = await leaseApi.getAll({ status: 1 });
      leases = response?.data || [];
    } catch (err) {
      console.error('Failed to load leases:', err);
      leases = [];
    }
  }

  async function loadAccounts() {
    accounts = ((await accountApi.getAll({ status: 1 }))?.data || []).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    );
    accounts = accounts.filter((w) => w.status === 1 && w.account_type_id == 4);
  }

  onMount(async () => {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    currency = defaultCurrency;
    const modalEl = document.getElementById('createRentInvoiceModal');
    if (window.mdb) {
      rent_invoicesModal = new window.mdb.Modal(modalEl);
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
    loadLeases();
    loadApartments();
    loadAccounts();
    setDatePickers(handleDateChange, componentRoot);
  });

  export function openRentInvoiceModal() {
    loadLeases();
    loadAccounts();
    editingId = null;
    invoice_number = '';
    lease_id = '';

    billing_period_start = now;
    billing_period_end = now;
    total_amount = '';

    issue_date = now;
    due_date = now;
    invoice_status = '';
    base_rent = '';
    utility_charges = '';
    currency = defaultCurrency;
    late_fee = '';

    other_charges = '';
    paid_amount = '';
    description = '';
    status = 1;
    rent_invoicesModal.show();
  }

  export function editRentInvoice(rent_invoice) {
    loadLeases();
    loadAccounts();
    editingId = rent_invoice.id;
    description = rent_invoice.description || '';
    invoice_number = rent_invoice.invoice_number || '';
    lease_id = rent_invoice.lease_id || '';
    status = rent_invoice.status;
    issue_date = rent_invoice.issue_date;
    due_date = rent_invoice.due_date;
    invoice_status = rent_invoice.invoice_status;
    base_rent = rent_invoice.base_rent;
    utility_charges = rent_invoice.utility_charges;
    currency = rent_invoice.currency;
    late_fee = rent_invoice.late_fee;
    other_charges = rent_invoice.other_charges || '';
    paid_amount = rent_invoice.paid_amount || '';

    billing_period_start = rent_invoice.billing_period_start;
    billing_period_end = rent_invoice.billing_period_end;
    total_amount = rent_invoice.total_amount;
    rent_invoicesModal.show();
  }

  async function saveRentInvoice() {
    if (!lease_id) {
      toast.error(t('Error'), 'Lease is required.');
      return;
    }
    if (!invoice_number) {
      toast.error(t('Error'), 'invoice_number is required.');
      return;
    }

    const payload = {
      invoice_number: invoice_number || '',
      lease_id: lease_id || 0,
      description: (description || '').trim() || null,
      status: parseInt(status) || 1,
      issue_date: issue_date,
      due_date: due_date,
      billing_period_start: billing_period_start,
      billing_period_end: billing_period_end,
      total_amount: parseFloat(total_amount) || 0,
      invoice_status: invoice_status || '',
      base_rent: parseFloat(base_rent) || 0,
      utility_charges: parseFloat(utility_charges) || 0,
      other_charges: parseFloat(other_charges) || 0,
      paid_amount: parseFloat(paid_amount) || 0,
      currency: currency || '',
      late_fee: parseFloat(late_fee) || 0,
    };

    try {
      let response;

      if (editingId) {
        response = await rentInvoiceApi.update(Number(editingId), payload);

        const receivableAccount = (await accountApi.getAll({ status: 1, code: 'RECEIVABLE' }))?.data?.[0];

        if (!receivableAccount) {
          throw new Error('RECEIVABLE account not found');
        }

        const customerAccount = leases.find((l) => Number(l.id) === Number(lease_id))?.tenant_account_id;

        let oldJournal =
          (
            await journalApi.getAll({
              status: 1,
              reference_type: 'rent_invoice',
              reference_id: Number(editingId),
            })
          )?.data?.[0] || null;
        if (oldJournal) {
          await journalApi.update(oldJournal.id, {
            date: issue_date,
            description: description || `rent_invoice Invoice #${parseInt(invoice_number)}`,
            currency: currency || '',
            first_entry_account: customerAccount,
            first_entry_debit: parseFloat(total_amount) || 0,
            first_entry_credit: 0,
            second_entry_account: receivableAccount.id,
            second_entry_debit: 0,
            second_entry_credit: parseFloat(total_amount) || 0,
            status: 1,
          });
        }
      } else {
        response = await rentInvoiceApi.create(payload);
        const newId = response?.data?.id;

        const receivableAccount = (await accountApi.getAll({ status: 1, code: 'RECEIVABLE' }))?.data?.[0];

        if (!receivableAccount) {
          throw new Error('RECEIVABLE account not found');
        }

        const customerAccount = leases.find((l) => Number(l.id) === Number(lease_id))?.tenant_account_id;

        await journalApi.create({
          date: issue_date,
          reference_id: newId,
          reference_type: 'rent_invoice',
          description: description || `rent_invoice Invoice #${parseInt(invoice_number)}`,
          currency: currency || '',
          first_entry_account: customerAccount,
          first_entry_debit: parseFloat(total_amount) || 0,
          first_entry_credit: 0,
          second_entry_account: receivableAccount.id,
          second_entry_debit: 0,
          second_entry_credit: parseFloat(total_amount) || 0,
          status: 1,
        });
      }

      const saved = response?.data || {};

      dispatch('saved', {
        id: saved.id ?? editingId,
        invoice_number: saved.invoice_number ?? payload.invoice_number,
        lease_id: saved.lease_id ?? payload.lease_id,
        description: saved.description ?? payload.description,
        status: saved.status ?? payload.status,
        issue_date: saved.issue_date ?? payload.issue_date,
        due_date: saved.due_date ?? payload.due_date,
        billing_period_start: saved.billing_period_start ?? payload.billing_period_start,
        billing_period_end: saved.billing_period_end ?? payload.billing_period_end,
        total_amount: saved.total_amount ?? payload.total_amount,
        invoice_status: saved.invoice_status ?? payload.invoice_status,
        base_rent: saved.base_rent ?? payload.base_rent,
        utility_charges: saved.utility_charges ?? payload.utility_charges,
        other_charges: saved.other_charges ?? payload.other_charges,
        paid_amount: saved.paid_amount ?? payload.paid_amount,
        currency: saved.currency ?? payload.currency,
        late_fee: saved.late_fee ?? payload.late_fee,
      });
      toast.success(
        t('Success'),
        editingId ? t('Rent Invoice updated successfully.') : t('Rent Invoice created successfully.'),
      );
      rent_invoicesModal.hide();
    } catch (err) {
      console.error('Failed to save rent_invoice:', err);
      toast.error(t('Error'), t('Error saving rent_invoice: ') + (err.message || err));
    }
  }

  async function deleteRentInvoice(id) {
    if (!confirm('Delete this rent_invoice?')) return;

    try {
      await rentInvoiceApi.remove(id);
      dispatch('saved');
    } catch (err) {
      console.error('Failed to delete rent_invoice:', err);
      toast.error(t('Error'), err.message || 'Failed to delete rent_invoice.');
    }
  }

  $: if (lease_id) {
    base_rent = leases.find((l) => Number(l.id) === Number(lease_id))?.monthly_rent || 0;
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  }
</script>

<div class="modal fade" id="createRentInvoiceModal" tabindex="-1" aria-hidden="true" bind:this={componentRoot}>
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-plus-circle"></i>
          {editingId ? t('Update Rent Invoice') : t('New Rent Invoice')}
        </h5>
        <button type="button" class="btn-close" data-mdb-dismiss="modal"></button>
      </div>

      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-4">
            <select
              class="form-select"
              id="c-rent_invoice-type"
              bind:value={lease_id}>
              <option value="" disabled>{t('Select') + ' ' + t('Lease')}</option>
              {#each leases as lease}
                <option value={lease.id}>{t('Lease')} {lease.lease_number} - {t('Apartment')}: {apartments.find((b) => b.id === lease.apartment_id)?.unit_number || ''} - {t('Floor')}: {floors.find((b) => b.id === apartments.find((a) => a.id === lease.apartment_id)?.floor_id)?.floor_number || 0} - {t('Building')}: {buildings.find((b) => b.id === apartments.find((a) => a.id === lease.apartment_id)?.building_id)?.name || ''}</option>
              {/each}
            </select>
          </div>


          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="number" id="c-invoice_number" class="form-control" bind:value={invoice_number} />
              <label class="form-label" for="c-invoice_number">{t('Rent Invoice Number')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="form-outline" data-mdb-input-init>
              <input type="text" id="c-invoice_status" class="form-control" bind:value={invoice_status} />
              <label class="form-label" for="c-invoice_status">{t('Invoice Status')}</label>
            </div>
          </div>

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-issue_date" class="form-control form-control-sm" data-bind="issue_date" bind:value={issue_date} />
                <label class="form-label" for="c-issue_date">{t('Issue Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>

          
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
            
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-due_date" class="form-control form-control-sm" data-bind="due_date" bind:value={due_date} />
                <label class="form-label" for="c-due_date">{t('Due Date')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          

          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-billing_period_start" class="form-control form-control-sm" data-bind="billing_period_start" bind:value={billing_period_start} />
                <label class="form-label" for="c-billing_period_start">{t('Billing Period Start')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          
          <div class="col-md-6 mb-4">
            <div class="input-group input-group-sm persianDatePicker">
              <div class="form-outline" data-mdb-input-init>
                <input type="date" id="c-billing_period_end" class="form-control form-control-sm" data-bind="billing_period_end" bind:value={billing_period_end} />
                <label class="form-label" for="c-billing_period_end">{t('Billing Period End')}</label>
              </div>
              <span class="input-group-text persian-date-text"></span>
            </div>
          </div>


          

          <div class="col-md-6 mb-4">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                <input type="number" id="c-base_rent" class="form-control" bind:value={base_rent} />
                <label class="form-label" for="c-base_rent">{t('Base Rent')}</label>
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
                <input type="number" id="c-late_fee" class="form-control" bind:value={late_fee} />
                <label class="form-label" for="c-late_fee">{t('Late Fee')}</label>
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
                <input type="number" id="c-utility_charges" class="form-control" bind:value={utility_charges} />
                <label class="form-label" for="c-utility_charges">{t('Utility Charges')}</label>
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
                
              <input type="text" id="c-other_charges" class="form-control" bind:value={other_charges} />
              <label class="form-label" for="c-other_charges">{t('Other Charges')}</label>
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
                
              <input type="text" id="c-total_amount" class="form-control" readonly bind:value={total_amount} />
              <label class="form-label" for="c-total_amount">{t('Total Amount')}</label>
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
          
          
          <div class="col-md-6 mb-4 d-none">
            <div class="input-group">
              <div class="form-outline" data-mdb-input-init>
                
              <input type="text" id="c-paid_amount" class="form-control" bind:value={paid_amount} />
              <label class="form-label" for="c-paid_amount">{t('Paid Amount')}</label>
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
        <button type="button" class="btn btn-primary" on:click={saveRentInvoice}>
          {editingId ? t('Update Rent Invoice') : t('Save Rent Invoice')}
        </button>
      </div>
    </div>
  </div>
</div>
