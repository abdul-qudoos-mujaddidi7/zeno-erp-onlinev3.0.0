<script>
  import { workCenterApi } from '../../../api/workCenterApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import ProductModal from '../../products/ProductModal.svelte';

  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;



  import WorkCenterModal from '../WorkCenterModal.svelte';
    import Swal from 'sweetalert2';

    import { toast } from '../../../ToastUI/toast.js';



  // bom_operations: `id, bom_id, work_center_id, operation_name, sequence, setup_time,setup_time_unit, run_time,run_time_unit, cost_per_hour, cost_currency , fixed_cost,labor_count,efficiency,status, version, updated_at, last_synced_at`,
  
  let defaultCurrency = "AFN";


  let cost_type = "cost_per_hour";

  let bom_id = null;
  let work_center_id = null;
  let operation_name = null;
  let sequence = null;
  let setup_time = null;
  let run_time = null;
  let cost_per_hour = null;
  let cost_currency = defaultCurrency;
  let fixed_cost = null;
  let labor_count = null;
  let efficiency = null;
  let setup_time_unit = "minute";
  let description = "";
  let run_time_unit = "minute";


  import { time_units,convertTime,seperateTime } from '../../../time.js';
import { currencyApi } from '../../../api/currencyApi.js';




  let editingId = null;
  let operationModal = null;



  let currencies = [];

  let work_centerModalRef = null;

  export let operations = [];
  export let quantity = 0;
  export let currency = "";
  export let product_unit_id = null;

  const dispatch = createEventDispatcher();

  let work_centers = [];
  async function loadAll() {

    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    defaultCurrency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    cost_currency = defaultCurrency;
    work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    loadAll();
    const modalEl = document.getElementById('createOperationModal');
    if (window.mdb) {
      operationModal = new window.mdb.Modal(modalEl);
    }
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
  });
  function addOperation() {
    if (!work_center_id) {
      toast.error(t('Error'),t(
          'Please Select Work Center.',
        ));
      return;
    }

    if (!operation_name) {

      toast.error(t('Error'),t(
          'Please Enter Operation Name.',
        ));
      return;
    }

    if (editingId==null) {
      operations.push({
        work_center_id,
        operation_name,
        sequence,
        setup_time,
        run_time,
        cost_per_hour:cost_type=='cost_per_hour'?cost_per_hour:0,
        cost_currency,
        fixed_cost:cost_type=='fixed_cost'?fixed_cost:0,
        labor_count,
        description,
        efficiency,
        setup_time_unit,
        run_time_unit
      });

      toast.success(t('Success'),t('Operation')+t(' was successfully added!'));
    } else {
      operations[editingId] = {
        work_center_id,
        operation_name,
        sequence,
        setup_time,
        run_time,
        cost_per_hour:cost_type=='cost_per_hour'?cost_per_hour:0,
        cost_currency,
        fixed_cost:cost_type=='fixed_cost'?fixed_cost:0,
        labor_count,
        description,
        efficiency,
        setup_time_unit,
        run_time_unit
      };

      toast.success(t('Success'),t('Operation')+t(' was successfully updated!'));
    }


      
    operations = [...operations];
    operationModal.hide();
    dispatch('update', { operations });
  }
  function removeOperation(index) {
    operations.splice(index, 1);
    operations = [...operations];
    dispatch('update', { operations });


    toast.info(t('Deleted!'),t('Operation')+t(' was successfully deleted!'));
  }

  function resetForm() {
    work_center_id = null;
    operation_name = null;
    sequence = null;
    setup_time = null;
    run_time = null;
    cost_per_hour = null;
    cost_currency = defaultCurrency;
    fixed_cost = null;
    labor_count = null;
    efficiency = null;
    description = "";
    setup_time_unit = "minute";
    run_time_unit = "minute";
  }
  export function openModal(editIndex=null) {
    console.log(editIndex);
    if (editIndex!=null) {
      const op = operations[editIndex];
      editingId = editIndex;
      work_center_id = op.work_center_id;
      operation_name = op.operation_name;
      sequence = op.sequence;
      setup_time = op.setup_time;
      run_time = op.run_time;
      cost_per_hour = op.cost_per_hour;
      cost_currency = op.cost_currency;
      fixed_cost = op.fixed_cost;
      labor_count = op.labor_count;
      description = op.description;
      efficiency = op.efficiency;
      cost_type = op.fixed_cost?"fixed_cost":"cost_per_hour";
      setup_time_unit = op.setup_time_unit;
      run_time_unit = op.run_time_unit;
    } else {
      editingId = null;
      resetForm();
    }
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
    operationModal.show();
  }


  function selectWorkCenter(work_center) {


    work_center_id = work_center.id;
    operation_name = t("Work on ")+work_center.name;
    if (work_center.cost_per_hour) {
      cost_per_hour = work_center.cost_per_hour;
      cost_currency = work_center.cost_currency;
    }

    if (work_center.setup_time) {
      setup_time = work_center.setup_time;
      setup_time_unit = work_center.setup_time_unit;
    }


    if (work_center.capacity_per_hour && true || work_center.capacity_unit_id == product_unit_id) {
      run_time = 1/Number(work_center.capacity_per_hour);
      if (run_time>=1) {
        run_time_unit = "hour";
      } else {
        run_time = convertTime(run_time,'hour','minute');
        run_time_unit = "minute";
        if (run_time<1) {
          run_time = convertTime(run_time,'minute','second');
          run_time_unit = "second";
        }
      }
      run_time = run_time.toFixed(3);
    }

    
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



  $: total = operations.reduce((s, operation) => {
    if (operation.cost_per_hour) {
      if (operation.cost_currency == currency) {

        return s + ((convertTime((Number(operation.run_time)||0)*(Number(quantity)||1),operation.run_time_unit,'hour')+convertTime(Number(operation.setup_time)||0,operation.setup_time_unit,'hour'))*Number(operation.cost_per_hour))
      } else {
        // convert to exchagned currency;
        return s + 0;
      }
    } else if (operation.fixed_cost) {
      if (operation.cost_currency == currency) {
        return s + Number(operation.fixed_cost||0)
      } else {
        // convert to exchagned currency;
        return s + 0;
      }
    }
  }, 0);

  function operationTotalTime(operation) {
    return Object.entries(seperateTime((Number(operation.run_time) || 0) * (Number(quantity) || 1) + convertTime(Number(operation.setup_time) || 0, operation.setup_time_unit, operation.run_time_unit), operation.run_time_unit)).map(([cur, amt]) => `${amt} ${t(cur)} `).join(" " + t('and') + t(" "));
  }

  function operationTotalCost(operation) {
    if (operation.cost_per_hour) {
      const hours =
        convertTime((Number(operation.run_time) || 0) * (Number(quantity) || 1), operation.run_time_unit, 'hour') +
        convertTime(Number(operation.setup_time) || 0, operation.setup_time_unit, 'hour');
      return (hours * Number(operation.cost_per_hour)).toLocaleString(undefined, { maximumFractionDigits: 3 });
    } else if (operation.fixed_cost) {
      return Number(operation.fixed_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return '0';
  }

  function clearOperations() {
    operations = [];
    dispatch('update', { operations });
  }

  function formTotalTime() {
    return Object.entries(seperateTime((Number(run_time) || 0) * (Number(quantity) || 1) + convertTime(Number(setup_time) || 0, setup_time_unit, run_time_unit), run_time_unit)).map(([cur, amt]) => `${amt} ${t(cur)} `).join(" " + t('and') + t(" "));
  }

  function formTotalCost() {
    if (cost_type == 'cost_per_hour' && cost_per_hour) {
      const hours =
        convertTime((Number(run_time) || 0) * (Number(quantity) || 1), run_time_unit, 'hour') +
        convertTime(Number(setup_time) || 0, setup_time_unit, 'hour');
      return (
        (hours * Number(cost_per_hour)).toLocaleString(undefined, { maximumFractionDigits: 3 }) +
        ' ' +
        t(cost_currency)
      );
    }
    return null;
  }
</script>

<div class="card shadow-2 mt-4 purchase-items-card">
  <div class="card-body">
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h5 class="mb-0 purchase-items-title">{t('BOM Operations')}</h5>

      <button class="operations-add-btn" type="button" on:click={() => openModal()}>
        <i class="bi bi-plus-lg"></i>
        <span>{t('New Operation')}</span>
      </button>
    </div>

    <div class="table-responsive sale-items-scroll-area">
      <table class="table table-hover align-middle purchase-items-table">
        <thead class="table-light">
          <tr>
            <th class="purchase-item-col-product">{t('Name')}{t('-of-')}{t('Operation')}</th>
            <th class="text-center purchase-item-col-setup">{t('Setup Time')}</th>
            <th class="text-center purchase-item-col-run">{t('Run Time')}</th>
            <th class="text-center purchase-item-col-time">{t('Operation Total Time')}</th>
            <th class="text-center purchase-item-col-cost">{t('Cost')}</th>
            <th class="text-center purchase-item-col-total">{t('Total Cost')}</th>
            <th class="text-center purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each operations as operation, index}
            <tr>
              <td class="purchase-item-product-cell purchase-item-col-product">
                <div class="purchase-item-product">
                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">{operation.operation_name}</strong>
                    <small>{work_centers.find((wc) => wc.id == operation.work_center_id)?.name || '-'}</small>
                  </span>
                </div>
              </td>

              <td class="text-center purchase-item-col-setup">
                <span class="purchase-item-readonly">
                  {operation.setup_time ? `${operation.setup_time} ${t(operation.setup_time_unit)}` : '-'}
                </span>
              </td>

              <td class="text-center purchase-item-col-run">
                <span class="purchase-item-readonly">
                  {operation.run_time ? `${operation.run_time} ${t(operation.run_time_unit)}` : '-'}
                </span>
              </td>

              <td class="text-center purchase-item-col-time">
                <span class="purchase-item-readonly">{operationTotalTime(operation)}</span>
              </td>

              <td class="text-center purchase-item-col-cost">
                {#if operation.cost_per_hour}
                  <div class="operation-cost">
                    <strong>
                      {Number(operation.cost_per_hour || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(operation.cost_currency)}
                    </strong>
                    <small>{t('Cost per Hour')}</small>
                  </div>
                {:else if operation.fixed_cost}
                  <div class="operation-cost">
                    <strong>
                      {Number(operation.fixed_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(operation.cost_currency)}
                    </strong>
                    <small>{t('Fixed Cost')}</small>
                  </div>
                {/if}
              </td>

              <td class="text-center purchase-item-col-total">
                <div class="purchase-item-money">
                  <strong>{operationTotalCost(operation)}</strong>
                  <small>{t(operation.cost_currency)}</small>
                </div>
              </td>

              <td class="text-center purchase-item-actions purchase-item-col-actions">
                <div class="operation-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    title={t('Edit')}
                    aria-label={t('Edit')}
                    on:click={() => openModal(index)}><i class="bi bi-pencil" aria-hidden="true"></i></button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    title={t('Delete')}
                    aria-label={t('Delete')}
                    on:click={() => removeOperation(index)}><i class="bi bi-trash" aria-hidden="true"></i></button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if operations.length > 0}
      <footer class="purchase-items-total-row">
        <button type="button" class="purchase-items-clear-btn" on:click={clearOperations}>
          <i class="bi bi-trash3" aria-hidden="true"></i>
          <span>{t('Clear All')}</span>
        </button>

        <div class="purchase-items-grand-total">
          <span>{t('Total')}</span>

          <strong dir="ltr">
            {Number(total || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
          </strong>

          <small>{t(currency || 'AFN')}</small>
        </div>
      </footer>
    {/if}
  </div>
</div>



<div class="modal fade qa-modal" dir={t('dir')} id="createOperationModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
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
          <i class="bi bi-gear"></i>
        </div>

        <div>
          <span class="qa-modal__eyebrow">
            {t('Operation')}
          </span>

          <h3>
            {t('BOM Operations')}
          </h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>
          {editingId != null
            ? t('Update Operation')
            : t('New Operation')}
        </h2>

        <p>
          {editingId != null
            ? t('Update operation subtitle')
            : t('Create operation subtitle')}
        </p>
      </div>

      <form
        class="qa-modal__form"
        on:submit|preventDefault={addOperation}
      >
        <div class="qa-modal__field qa-modal__field--full">
          <span>{t('Work Center')}</span>

          <div class="qa-op-picker">
            <select
              bind:value={work_center_id}
              on:change={(event) => {
                const wc = work_centers.find(
                  (c) => String(c.id) == String(event.currentTarget.value),
                );
                if (wc) {
                  selectWorkCenter(wc);
                }
              }}>
              <option value="">{t('Select Work Center')}</option>
              {#each work_centers as work_center}
                <option value={work_center.id}>{t(work_center.name)}</option>
              {/each}
            </select>

            <button
              type="button"
              class="qa-op-new"
              on:click={() => {
                work_centerModalRef?.openWorkCenterModal();
              }}>
              <i class="bi bi-plus-lg"></i>
              {t('New Work Center')}
            </button>
          </div>
        </div>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}{t('-of-')}{t('Operation')}</span>

          <input
            type="text"
            id="inp_operation_name"
            bind:value={operation_name}
            autocomplete="off"
          />
        </label>

        <label class="qa-modal__field">
          <span>{t('Setup Time')}</span>

          <input
            type="number"
            step="any"
            id="inp_setup_time"
            bind:value={setup_time}
          />
        </label>

        <label class="qa-modal__field">
          <span>{t('Unit')}</span>

          <select bind:value={setup_time_unit}>
            {#each time_units as tu}
              <option value={tu}>{t(tu)}</option>
            {/each}
          </select>
        </label>

        <label class="qa-modal__field">
          <span>{t('Run Time per Product')}</span>

          <input
            type="number"
            step="any"
            id="inp_run_time"
            bind:value={run_time}
          />
        </label>

        <label class="qa-modal__field">
          <span>{t('Unit')}</span>

          <select bind:value={run_time_unit}>
            {#each time_units as tu}
              <option value={tu}>{t(tu)}</option>
            {/each}
          </select>
        </label>

        {#if run_time || setup_time}
          <div class="qa-op-preview">
            <span>{t('Operation Total Time')}:</span>
            <strong>{formTotalTime()}</strong>
          </div>
        {/if}

        <div class="qa-modal__field qa-modal__field--full">
          <span>{t('Cost')}</span>

          <div class="qa-op-cost">
            <select bind:value={cost_type}>
              <option value="cost_per_hour">{t('Cost per Hour')}</option>
              <option value="fixed_cost">{t('Fixed Cost')}</option>
            </select>

            {#if cost_type == "cost_per_hour"}
              <input
                type="number"
                step="any"
                id="inp_cost_per_hour"
                bind:value={cost_per_hour}
                placeholder={t('Cost per Hour')}
              />
            {:else}
              <input
                type="number"
                step="any"
                id="inp_fixed_cost"
                bind:value={fixed_cost}
                placeholder={t('Fixed Cost')}
              />
            {/if}

            <select class="qa-op-currency" bind:value={cost_currency}>
              {#each currencies as cur}
                <option value={cur.code}>{t(cur.code)}</option>
              {/each}
            </select>
          </div>
        </div>

        {#if (run_time || setup_time) && cost_per_hour && cost_type == "cost_per_hour"}
          <div class="qa-op-preview">
            <span>{t('Total Cost')}:</span>
            <strong>{formTotalCost()}</strong>
          </div>
        {/if}

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>

          <textarea
            id="inp_description"
            rows="3"
            bind:value={description}
          ></textarea>
        </label>

        <button
          type="submit"
          class="qa-modal__submit"
        >
          {editingId != null
            ? t('Update Operation')
            : t('Save Operation')}
        </button>
      </form>
    </div>
  </div>
</div>


<WorkCenterModal bind:this={work_centerModalRef} on:saved={async (e)=>{
    work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];
    work_center_id = e.detail.id;
    let work_center = work_centers.find(wc=>wc.id==e.detail.id);
    if (work_center) {
      selectWorkCenter(work_center);
    }
}} />

<style>
  .purchase-items-card {
    --sale-primary: var(--bs-primary, #2f6fed);
    --sale-primary-dark: #1d4ed8;
    --sale-border: #dfe6ef;
    --sale-border-soft: #edf1f6;
    --sale-text: #172033;
    --sale-muted: #718096;

    position: relative;
    z-index: 35;
    width: 100%;
    margin-top: 1rem !important;
    overflow: visible;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

  .purchase-items-card :global(.card-body) {
    padding: 0;
    overflow: visible;
  }

  /* BOM Operations heading — same visual language as the Sale Items card. */
  .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
    display: flex !important;
    align-items: center !important;
    min-height: 4.75rem;
    margin: 0 !important;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #ffffff;
  }

  .purchase-items-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: var(--sale-text);
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .purchase-items-title::before {
    content: '\F3E5';
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-family: 'bootstrap-icons';
    font-size: 1rem;
    font-weight: 400;
  }

  .operations-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid transparent;
    border-radius: 0.55rem;
    background: var(--sale-primary);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }

  .operations-add-btn:hover {
    transform: translateY(-1px);
    background: var(--sale-primary-dark);
  }

  .operations-add-btn i {
    font-size: 0.72rem;
  }

  /*
   * Table shell
   */
  /*
   * Keep ONE table grid: the wrapper is the only scroll container and the
   * header sticks inside it. Splitting into a separate <thead> table and a
   * scrolling block <tbody> made every body row re-derive its own column
   * widths on a narrower box, so the columns drifted away from their headers.
   */
  .purchase-items-card :global(.table-responsive),
  .purchase-items-card :global(.sale-items-scroll-area) {
    width: 100%;
    max-width: 100%;
    min-height: 0;
    height: auto;
    max-height: calc(2.875rem + 21.25rem + 4.25rem);

    overflow-x: auto !important;
    overflow-y: auto !important;

    border: 0;
    background: #ffffff;

    overscroll-behavior: auto;

    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar) {
    width: 0.45rem;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-track) {
    background: transparent;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-thumb:hover) {
    background: #94a3b8;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar) {
    width: 0.45rem;
    height: 0.45rem;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-track) {
    background: transparent;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb:hover) {
    background: #94a3b8;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 48rem;
    margin: 0 !important;
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    color: #42516a;
  }

  .purchase-items-table :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2.875rem;
    padding: 0.55rem 0.5rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #f7f9fc !important;
    color: #67768a;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.2;
    letter-spacing: 0;
    text-align: center;
    text-transform: none;
    vertical-align: middle;
    white-space: nowrap;
  }

  .purchase-items-table :global(thead th:first-child) {
    text-align: start;
  }

  .purchase-items-table :global(tbody tr) {
    height: 4.25rem;
    background: #ffffff;
    transition: background 0.12s ease;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfcfe;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(tbody td) {
    height: 4.25rem;
    padding: 0.45rem 0.25rem;
    border: 0;
    border-bottom: 1px solid #e9eef5;
    background: transparent;
    color: #46566d;
    font-size: 0.74rem;
    text-align: center;
    vertical-align: middle;
  }

  .purchase-item-col-product {
    width: 24%;
    min-width: 10rem;
  }

  .purchase-item-col-setup {
    width: 11%;
    min-width: 6.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-run {
    width: 11%;
    min-width: 6.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-time {
    width: 14%;
    min-width: 8.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-cost {
    width: 12%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-total {
    width: 12%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-actions {
    width: 7%;
    min-width: 5.5rem;
    white-space: nowrap;
  }

  .purchase-item-product-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 2;
    padding-inline: 0.625rem !important;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
  }

  .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #fbfcfe !important;
  }

  .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(thead .purchase-item-col-product) {
    inset-inline-start: 0;
    z-index: 6;
    background: #f7f9fc !important;
    box-shadow: 1px 0 0 #dfe5ed;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    max-width: none;
    overflow: visible;
    white-space: normal;
  }

  .purchase-item-product-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  .purchase-item-product-name {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 850;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-product-copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-readonly {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    max-width: 100%;
    padding: 0 0.6rem;
    overflow: hidden;
    border: 1px solid #e3e8ef;
    border-radius: 0.5rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Cost cell */
  .operation-cost {
    display: inline-grid;
    justify-items: center;
    gap: 0.1rem;
    min-width: 0;
    white-space: nowrap;
  }

  .operation-cost strong {
    color: #172033;
    font-size: 0.75rem;
    font-weight: 850;
  }

  .operation-cost small {
    color: #8491a4;
    font-size: 0.58rem;
    font-weight: 650;
  }

  /* Total cost */
  .purchase-item-money {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.3rem;
    width: fit-content;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-item-money strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .purchase-item-money small {
    margin: 0;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
  }

  /* Actions */
  .purchase-item-actions {
    text-align: center !important;
  }

  .operation-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .purchase-items-table :global(.btn-outline-primary),
  .purchase-items-table :global(.btn-outline-danger) {
    display: inline-grid;
    width: 2rem !important;
    min-width: 2rem !important;
    height: 2rem !important;
    min-height: 2rem !important;
    padding: 0 !important;
    place-items: center;
    border-radius: 0.5rem !important;
    font-size: 0.75rem;
    line-height: 1;
    box-shadow: none !important;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-items-table :global(.btn-outline-primary) {
    border: 1px solid #d8e4f8 !important;
    background: #f3f7fe !important;
    color: var(--sale-primary) !important;
  }

  .purchase-items-table :global(.btn-outline-primary:hover) {
    transform: translateY(-1px);
    border-color: #bad0f5 !important;
    background: #e8f1fe !important;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    border: 1px solid #f3cccc !important;
    background: #fff7f7 !important;
    color: #d64545 !important;
  }

  .purchase-items-table :global(.btn-outline-danger:hover) {
    transform: translateY(-1px);
    border-color: #efaaaa !important;
    background: #feecec !important;
    color: #c53030 !important;
  }

  /* Footer total row */
  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4rem;
    margin: 0 !important;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--sale-border-soft);
    border-radius: 0 0 0.875rem 0.875rem;
    background: #fbfcfe;
  }

  .purchase-items-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid #f3cccc;
    border-radius: 0.55rem;
    background: #ffffff;
    color: #dc2626;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-items-clear-btn:hover {
    transform: translateY(-1px);
    border-color: #efaaaa;
    background: #fff5f5;
  }

  .purchase-items-clear-btn i {
    font-size: 0.72rem;
  }

  .purchase-items-grand-total {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-items-grand-total > span {
    color: #526176;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .purchase-items-grand-total > strong {
    color: var(--sale-primary);
    font-size: 1.05rem;
    font-weight: 900;
    line-height: 1;
  }

  .purchase-items-grand-total > small {
    color: #718096;
    font-size: 0.64rem;
    font-weight: 800;
  }

  /* RTL */
  :global(html[dir='rtl']) .purchase-item-product-cell {
    box-shadow: -1px 0 0 #e9eef5;
  }

  :global(html[dir='rtl']) .purchase-items-table thead .purchase-item-col-product {
    box-shadow: -1px 0 0 #dfe5ed;
  }

  /* Responsive */
  @media (max-width: 767.98px) {
    .purchase-items-card {
      border-radius: 0.75rem;
    }

    .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
      min-height: 4.25rem;
      padding: 0.8rem;
    }

    .purchase-items-table {
      min-width: 42rem;
    }

    .purchase-items-card :global(.table-responsive),
    .purchase-items-card :global(.sale-items-scroll-area) {
      min-height: 0;
      height: auto;
      max-height: calc(2.875rem + 17rem + 4.25rem);
      overflow-y: auto !important;
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }

  /* Dark theme */
  :global(html.dark) .purchase-items-card {
    --sale-border: var(--erp-border, #2b3a4f);
    --sale-border-soft: var(--erp-border, #2b3a4f);
    --sale-text: var(--erp-text, #e5edf8);
    --sale-muted: var(--erp-muted, #94a3b8);
    border-color: var(--sale-border);
    background: var(--erp-surface, #111827);
    color-scheme: dark;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
  }

  :global(html.dark) .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
    border-color: var(--sale-border);
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .purchase-items-title {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-items-title::before {
    background: rgba(47, 111, 237, 0.16);
  }

  :global(html.dark) .purchase-items-total-row {
    border-color: var(--sale-border) !important;
    background: #0f1726 !important;
  }

  :global(html.dark) .purchase-items-card :global(.table-responsive) {
    background: var(--erp-surface, #111827);
    scrollbar-color: #52647d transparent;
  }

  :global(html.dark) .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb) {
    background: #52647d;
  }

  :global(html.dark) .purchase-items-table {
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-items-table :global(thead th),
  :global(html.dark) .purchase-items-table :global(thead .purchase-item-col-product) {
    border-color: var(--sale-border);
    background: #172033 !important;
    color: #a9b7ca;
    box-shadow: 1px 0 0 var(--sale-border);
  }

  :global(html.dark) .purchase-items-table :global(tbody tr) {
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #141d2c;
  }

  :global(html.dark) .purchase-items-table :global(tbody tr:hover) {
    background: #1a2638 !important;
  }

  :global(html.dark) .purchase-items-table :global(tbody td) {
    border-color: var(--sale-border);
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-item-product-cell {
    background: var(--erp-surface, #111827) !important;
    box-shadow: 1px 0 0 var(--sale-border);
  }

  :global(html.dark) .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #141d2c !important;
  }

  :global(html.dark) .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #1a2638 !important;
  }

  :global(html.dark) .purchase-item-product-name,
  :global(html.dark) .operation-cost strong,
  :global(html.dark) .purchase-item-money strong {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-item-product-copy small,
  :global(html.dark) .operation-cost small,
  :global(html.dark) .purchase-item-money small,
  :global(html.dark) .purchase-items-grand-total > span,
  :global(html.dark) .purchase-items-grand-total > small {
    color: var(--sale-muted);
  }

  :global(html.dark) .purchase-item-readonly {
    border-color: var(--sale-border);
    background: #202b3d;
    color: #a9b7ca;
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-primary) {
    border-color: #2d4770 !important;
    background: #16243a !important;
    color: #8bb7ff !important;
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-primary:hover) {
    border-color: #3b5a8c !important;
    background: #1d2f4a !important;
    color: #a5c8ff !important;
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-danger) {
    border-color: #74333c !important;
    background: #321c25 !important;
    color: #ff8d98 !important;
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-danger:hover) {
    border-color: #9a4350 !important;
    background: #44222c !important;
    color: #ffabb3 !important;
  }

  :global(html.dark) .purchase-items-clear-btn {
    border-color: #74333c;
    background: var(--erp-surface, #111827);
    color: #ff8d98;
  }

  :global(html.dark) .purchase-items-clear-btn:hover {
    border-color: #9a4350;
    background: #321c25;
  }

  /* New Operation quick-action modal (qa-modal) */
  .qa-op-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
  }

  .qa-op-new {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: var(--button-height, var(--control-height));
    padding-inline: 0.85rem;
    border: 1px solid #d8e4f8;
    border-radius: var(--control-radius, 0.625rem);
    background: #f3f7fe;
    color: #0f6efd;
    font-size: 0.84rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .qa-op-new:hover {
    border-color: #bad0f5;
    background: #edf4ff;
  }

  .qa-op-new i {
    font-size: 0.78rem;
  }

  .qa-op-cost {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 0.7fr);
    gap: 0.55rem;
  }

  .qa-op-preview {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid #dbeafe;
    border-radius: 0.5625rem;
    background: #f5f9ff;
    color: #475569;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .qa-op-preview strong {
    color: var(--bs-primary, #2f6fed);
    font-size: 0.78rem;
    font-weight: 850;
  }

  /* Dark theme for the operation quick-action modal */
  :global(html.dark) .qa-modal__panel {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0b1426;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__intro {
    border-color: rgba(148, 163, 184, 0.26);
  }

  :global(html.dark) .qa-modal__intro h2 {
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__intro p {
    color: #8fa0ba;
  }

  :global(html.dark) .qa-modal__field {
    color: #c8d3e2;
  }

  :global(html.dark) .qa-modal__field span {
    color: #8fa0ba;
  }

  :global(html.dark) .qa-modal__close {
    border-color: rgba(148, 163, 184, 0.34);
    background: #111c31;
    color: #dbe7ff;
  }

  :global(html.dark) .qa-modal__field input,
  :global(html.dark) .qa-modal__field textarea,
  :global(html.dark) .qa-modal__field select,
  :global(html.dark) .qa-op-cost select,
  :global(html.dark) .qa-op-cost input {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field input:focus,
  :global(html.dark) .qa-modal__field textarea:focus,
  :global(html.dark) .qa-modal__field select:focus {
    border-color: #6f9cff;
    box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
  }

  :global(html.dark) .qa-op-new {
    border-color: #2d4770;
    background: #16243a;
    color: #8bb7ff;
  }

  :global(html.dark) .qa-op-new:hover {
    border-color: #3b5a8c;
    background: #1d2f4a;
  }

  :global(html.dark) .qa-op-preview {
    border-color: #2d4770;
    background: #16243a;
    color: #a9b7ca;
  }

  :global(html.dark) .qa-op-preview strong {
    color: #8bb7ff;
  }
</style>
