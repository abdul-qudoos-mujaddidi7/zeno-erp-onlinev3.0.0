<script>
  import { workCenterApi } from '../../../api/workCenterApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import ProductModal from '../../products/ProductModal.svelte';

  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  import '../production-ledger.css';
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

    return s;
  }, 0);
</script>

<div class="card shadow-2 production-ledger-card">
  <header class="production-ledger-header">
    <h5 class="production-ledger-title">
      <span class="production-ledger-icon" aria-hidden="true"><i class="bi bi-gear-wide-connected"></i></span>
      {t('Production Operations')}
    </h5>

    <button type="button" class="production-ledger-action" on:click={() => openModal()}>
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
      <span>{t('New Operation')}</span>
    </button>
  </header>

  <div class="production-ledger-scroll">
    <table class="table table-hover align-middle production-ledger-table">
      <thead>
        <tr>
          <th class="production-ledger-col-index">#</th>
          <th class="production-ledger-col-center">{t('Work Center')}</th>
          <th class="production-ledger-col-name">{t('Name')}{t('-of-')}{t('Operation')}</th>
          <th class="production-ledger-col-time text-center">{t('Setup Time')}</th>
          <th class="production-ledger-col-time text-center">{t('Run Time')}</th>
          <th class="production-ledger-col-total-time text-center">{t('Operation Total Time')}</th>
          <th class="production-ledger-col-cost text-center">{t('Cost')}</th>
          <th class="production-ledger-col-total-cost text-center">{t('Total Cost')}</th>
          <th class="production-ledger-col-actions text-center">{t('Actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each operations as operation, index}
          <tr>
            <td class="production-ledger-col-index">
              <span class="production-ledger-cell-text production-ledger-cell-text--muted">{index + 1}</span>
            </td>

            <td class="production-ledger-col-center">
              <div class="production-ledger-product">
                <span class="production-ledger-product-copy">
                  <strong class="production-ledger-product-name">
                    {work_centers.find((wc) => wc.id == operation.work_center_id)?.name || '-'}
                  </strong>
                  {#if operation.sequence}
                    <small>{t('Sequence')}: {operation.sequence}</small>
                  {/if}
                </span>
              </div>
            </td>

            <td class="production-ledger-col-name">
              <div class="production-ledger-product">
                <span class="production-ledger-product-copy">
                  <strong class="production-ledger-product-name">{operation.operation_name || '-'}</strong>
                  {#if operation.description}
                    <small>{operation.description}</small>
                  {/if}
                </span>
              </div>
            </td>

            <td class="production-ledger-col-time text-center">
              <span class="production-ledger-readonly">
                {#if operation.setup_time}
                  {operation.setup_time} {t(operation.setup_time_unit)}
                {:else}
                  -
                {/if}
              </span>
            </td>

            <td class="production-ledger-col-time text-center">
              <span class="production-ledger-readonly">
                {#if operation.run_time}
                  {operation.run_time} {t(operation.run_time_unit)}
                {:else}
                  -
                {/if}
              </span>
            </td>

            <td class="production-ledger-col-total-time text-center">
              <span class="production-ledger-cell-text">
                {Object.entries(
                  seperateTime(
                    (Number(operation.run_time) || 0) * (Number(quantity) || 1) +
                      convertTime(
                        Number(operation.setup_time) || 0,
                        operation.setup_time_unit,
                        operation.run_time_unit,
                      ),
                    operation.run_time_unit,
                  ),
                )
                  .map(([cur, amt]) => `${amt} ${t(cur)} `)
                  .join(' ' + t('and') + ' ')}
              </span>
            </td>

            <td class="production-ledger-col-cost text-center">
              {#if operation.cost_per_hour}
                <span class="production-ledger-readonly production-ledger-readonly--stacked">
                  <small>{t('Cost per Hour')}</small>
                  <span dir="ltr">
                    {Number(operation.cost_per_hour || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </span>
                  <small>{t(operation.cost_currency)}</small>
                </span>
              {:else if operation.fixed_cost}
                <span class="production-ledger-readonly production-ledger-readonly--stacked">
                  <small>{t('Fixed Cost')}</small>
                  <span dir="ltr">
                    {Number(operation.fixed_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </span>
                  <small>{t(operation.cost_currency)}</small>
                </span>
              {:else}
                <span class="production-ledger-cell-text production-ledger-cell-text--muted">-</span>
              {/if}
            </td>

            <td class="production-ledger-col-total-cost text-center">
              <div class="production-ledger-money">
                {#if operation.cost_per_hour}
                  <strong>
                    {(
                      (convertTime(
                        (Number(operation.run_time) || 0) * (Number(quantity) || 1),
                        operation.run_time_unit,
                        'hour',
                      ) +
                        convertTime(Number(operation.setup_time) || 0, operation.setup_time_unit, 'hour')) *
                      Number(operation.cost_per_hour)
                    ).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </strong>
                  <small>{t(operation.cost_currency)}</small>
                {:else if operation.fixed_cost}
                  <strong>
                    {Number(operation.fixed_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </strong>
                  <small>{t(operation.cost_currency)}</small>
                {:else}
                  <strong>-</strong>
                {/if}
              </div>
            </td>

            <td class="production-ledger-col-actions production-ledger-actions-cell">
              <div class="production-ledger-row-buttons">
                <button
                  type="button"
                  class="btn btn-sm production-ledger-row-button"
                  title={t('Edit')}
                  aria-label={t('Edit')}
                  on:click={() => openModal(index)}>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>

                <button
                  type="button"
                  class="btn btn-sm production-ledger-row-button production-ledger-row-button--danger"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeOperation(index)}>
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
        {/each}

        {#if operations.length === 0}
          <tr>
            <td colspan="9">
              <div class="production-ledger-empty-state">
                <i class="bi bi-gear-wide-connected" aria-hidden="true"></i>
                <strong>{t('No Data')}</strong>
              </div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if operations.length > 0}
    <footer class="production-ledger-footer">
      <button
        type="button"
        class="production-ledger-clear"
        on:click={() => {
          operations = [];
          dispatch('update', { operations });
        }}>
        <i class="bi bi-trash3" aria-hidden="true"></i>
        <span>{t('Clear All')}</span>
      </button>

      <div class="production-ledger-total">
        <span>{t('Total')}{t('-of-')}{t('Production Operations')}</span>

        <strong dir="ltr">{Number(total || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>

        <small>{t(currency)}</small>
      </div>
    </footer>
  {/if}
</div>



<div class="modal fade" id="createOperationModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          {editingId != null ? t('Update Operation') : t('New Operation')}
        </h5>
        <button type="button" class="btn-close" aria-label={t('Close')} data-mdb-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="row">
          <div class="col-md-12 mb-3">
            <div class="input-group input-group-sm">
              <!-- Floating label input -->

              <button
                id="showCategoryDropdown"
                class="btn btn-info btn-sm w-100 dropdown-toggle p-2"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {work_center_id ? work_centers.find((c) => c.id == work_center_id)?.name : t('Select Work Center')}
              </button>

              <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                <li>
                  <button
                    class="dropdown-item text-info"
                    on:click={() => {
                      work_centerModalRef?.openWorkCenterModal();
                    }}
                    type="button">
                    <i class="bi bi-plus me-2"></i>{t('New Work Center')}
                  </button>
                </li>
                {#each work_centers as work_center}
                  <li>
                    <button
                      class="dropdown-item {work_center_id == work_center.id ? 'bg-info text-white' : ''}"
                      on:click={() => {


                        selectWorkCenter(work_center);
                        
                      }}
                      type="button">
                      {t(work_center.name)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>

          <div class="col-md-12 mb-3">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                id="inp_operation_name"
                class="form-control form-control-sm"
                bind:value={operation_name} />
              <label class="form-label" for="inp_operation_name">{t('Name')}{t('-of-')}{t('Operation')}</label>
            </div>
          </div>


          <div class="col-md-6 mb-3 d-none">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                id="inp_sequence"
                class="form-control form-control-sm"
                bind:value={sequence} />
              <label class="form-label" for="inp_sequence">{t('Sequence')}</label>
            </div>
          </div>



          <div class="col-md-6 {run_time || setup_time?"":"mb-3"}">
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
                {setup_time_unit ? t(time_units.find((c) => c == setup_time_unit)) : t('Select Unit')}
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


          <div class="col-md-6 {run_time || setup_time?"":"mb-3"}">
            <div class="input-group input-group-sm">
             

                <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="text"
                    id="inp_setup_time"
                    class="form-control form-control-sm"
                    bind:value={run_time} />
                  <label class="form-label" for="inp_run_time">{t('Run Time per Product')}</label>
                </div>
              <button
                id="showCategoryDropdown"
                class="btn btn-info btn-sm dropdown-toggle p-2"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {run_time_unit ? t(time_units.find((c) => c == run_time_unit)) : t('Select Unit')}
              </button>

              <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                {#each time_units as tu}
                  <li>
                    <button
                      class="dropdown-item {run_time_unit == tu ? 'bg-info text-white' : ''}"
                      on:click={() => (run_time_unit = tu)}
                      type="button">
                      {t(tu)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          {#if run_time || setup_time}
          <div class="col-md-12 mb-3 text-end">
            <small style="font-size:8pt">{t("Operation Total Time")}: <strong>{Object.entries(seperateTime((Number(run_time)||0)*(Number(quantity)||1)+convertTime(Number(setup_time)||0,setup_time_unit,run_time_unit),run_time_unit)).map(([cur, amt]) => `${amt} ${t(cur)} `).join(" "+t('and')+t(" "))}</strong></small>

          </div>
          {/if}



          
          <div class="col-md-12 mb-3">
            
            <div class="input-group input-group-sm">


            <button class='btn text-nowrap pt-1 btn-outline-{cost_type=="cost_per_hour"?"primary":"danger"} btn-sm'
            on:click={()=>{
              cost_type=cost_type=="cost_per_hour"?"fixed_cost":"cost_per_hour";
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
            }}
            
            >{t(cost_type=="cost_per_hour"?"Cost per Hour":"Fixed Cost")}</button>


            {#if cost_type == "cost_per_hour"}


              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input
                  type="text"
                  id="inp_cost_per_hour"
                  class="form-control form-control-sm"
                  bind:value={cost_per_hour} />
                <label class="form-label" for="inp_cost_per_hour">{t('Cost per Hour')}</label>
              </div>


            {:else}
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input
                  type="text"
                  id="inp_fixed_cost"
                  class="form-control form-control-sm"
                  bind:value={fixed_cost} />
                <label class="form-label" for="inp_fixed_cost">{t('Fixed Cost')}</label>
              </div>

            {/if}



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

          {#if (run_time || setup_time)&&cost_per_hour&&cost_type=="cost_per_hour"}
            <div class="col-md-12 mb-3 text-end" style="margin-top: -1rem !important;">
              <small style="font-size:8pt">{t("Total Cost")}: <strong>{((convertTime((Number(run_time)||0)*(Number(quantity)||1),run_time_unit,'hour')+convertTime(Number(setup_time)||0,setup_time_unit,'hour'))*Number(cost_per_hour)).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(cost_currency)}</strong></small>
            </div>
          {/if}


          <div class="col-md-6 mb-3 d-none">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                id="inp_labor_count"
                class="form-control form-control-sm"
                bind:value={labor_count} />
              <label class="form-label" for="inp_labor_count">{t('Labor Count')}</label>
            </div>
          </div>


          <div class="col-md-6 mb-3 d-none">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                id="inp_efficiency"
                class="form-control form-control-sm"
                bind:value={efficiency} />
              <label class="form-label" for="inp_efficiency">{t('Efficiency')}</label>
            </div>
          </div>

          <div class="col-md-12 mb-3">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <textarea
                id="inp_description"
                class="form-control form-control-sm"
                bind:value={description}></textarea>
              <label class="form-label" for="inp_description">{t('Description')}</label>
            </div>
          </div>

        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-link text-dark" data-mdb-dismiss="modal">{t('Close')}</button>
        <button type="button" class="btn btn-primary" on:click={addOperation}>
          {editingId != null ? t('Update Operation') : t('Save Operation')}
        </button>
      </div>
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
