<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type, settings_all } from '../../../i18n/i18n.js';
  import { showDate } from '../../../calendar.js';
  import { push } from 'svelte-spa-router';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { toast } from '../../../ToastUI/toast.js';
  export let labtest_type = {};
  import LabTestCategoryModal from './LabTestCategoryModal.svelte';
import { currencyApi } from '../../../api/currencyApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { labtestTypeApi } from '../../../api/labtestTypeApi.js';
import { labtestCategoryApi } from '../../../api/labtestCategoryApi.js';
  let settings = [];


  $: brand_primary_color = $settings_all.find((s) => s.key === 'brand_primary_color')?.value||"#3B71CA";

  $: brand_secondary_color = $settings_all.find((s) => s.key === 'brand_secondary_color')?.value||"#54B4D3";

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }


  async function saveLabTestType() {
        
    let newId = null;
    const payload = {
      labtest_category_id,
      name: name.trim(),
      description,
      parameters: JSON.stringify(parameters),
      price,
      currency,
      status: parseInt(status) || 1,
    };
    if (labtest_type) {
      await labtestTypeApi.update(labtest_type.id, payload);
    } else {
      const created = await labtestTypeApi.create(payload);
      newId = created?.data?.id;
    }
    toast.success(t("Success"),t("Lab Test Type Saved Successfully"));
    dispatch('saved');
  }

  let catModalRef = null;

  let labtest_categories = [];
  let currencies = [];
  let parameters = [];
  let name = "";
  let description = "";
  let price = 0;
  let currency = "AFN";
  let labtest_category_id = "";

  async function loadItems() {
    labtest_categories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    currency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
  }
  $: if (labtest_type) {
    name = labtest_type.name;
    description = labtest_type.description;
    labtest_category_id = labtest_type.labtest_category_id;
    price = labtest_type.price;
    currency = labtest_type.currency || currency;
    parameters = JSON.parse(labtest_type.parameters);
  }

  function addParameter() {
    parameters.push({
      type:"parameter",
      name:"",
      range_from:"",
      range_to:"",
      unit:""
    })
    parameters = [...parameters];
  }
  function removeParameter(index) {
    parameters.splice(index, 1);
    parameters = [...parameters];
  }
  function makeCatParameter(index) {
    parameters[index].type = 'category';
    parameters = [...parameters];
  }

  function makeParParameter(index) {
    parameters[index].type = 'parameter';
    parameters = [...parameters];
  }



  onMount(async () => {
    await loadItems();
    
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


</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{#if labtest_type}{t('Edit LabTestType')} — {labtest_type?.id}{:else}{t('New LabTestType')}{/if}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="labtest_type-content" class="labtest_type-container">
          <!-- Header -->
           <div class="row">
            <div class="col-md-8">

            <div class="input-group mb-3">
            
                  
              <button
                id="showCategoryDropdown"
                class="btn btn-info btn-sm w-100 dropdown-toggle p-2"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {labtest_category_id ? labtest_categories.find((c) => c.id == labtest_category_id)?.name : t('Select Category')}
              </button>

              <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                <li>
                  <button
                    class="dropdown-item text-info"
                    on:click={() => {
                      catModalRef.openLabTestCategoryModal();
                    }}
                    type="button">
                    <i class="bi bi-plus me-2"></i>{t('Create Category')}
                  </button>
                </li>
                {#each labtest_categories as category}
                  <li>
                    <button
                      class="dropdown-item {labtest_category_id == category.id ? 'bg-info text-white' : ''}"
                      on:click={() => (labtest_category_id = category.id)}
                      type="button">
                      {t(category.name)}
                    </button>
                  </li>
                {/each}
              </ul>
                  <div class="form-outline" data-mdb-input-init>
                      <input
                          type="text"
                          id="c-name"
                          class="form-control"
                          bind:value={name}
                      />
                      <label class="form-label" for="c-name"
                          >{t("Name")}</label
                      >
                  </div>

              <button class="btn btn-primary px-3" on:click={addParameter}>
                <i class='bi bi-plus-circle'></i>
              </button>
                



            </div>
            </div>
            <div class="col-md-4">
               <div class="input-group input-group-sm mb-3">
              <!-- Floating label input -->
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input type="number" id="price" class="form-control form-control-sm" bind:value={price} />
                <label class="form-label" for="price">{t('Price')}</label>
              </div>

              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary dropdown-toggle btn-sm pt-1"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : t(currency)}
              </button>

              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button
                      class="dropdown-item"
                      style={currency == cur.code
                        ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                        : ''}
                      on:click={() => (currency = cur.code)}
                      type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
            </div>
           </div>
         

            <table class="table table-striped">
            <thead>
              <tr style="border-bottom:1px solid #000000;font-size:11pt;">
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold">{t('Investigation')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Reference Range From')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Reference Range To')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Unit')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Actions')}



                </th>
              </tr>
            </thead>
            <tbody style="font-size: 9pt;">
              {#each parameters as it, index}
                  <tr style="height:30px">
                    <td class="p-2 py-0" colspan={it.type == 'category'?"4":"0"} style="vertical-align: middle;">
                      <input type='text' class='form-control form-control-sm' bind:value={it.name} />
                    </td>
                    {#if it.type != 'category'}
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">

                      <input type='text' class='form-control form-control-sm' bind:value={it.range_from} />
                    </td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      <input type='text' class='form-control form-control-sm' bind:value={it.range_to} />
                    </td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      <input type='text' class='form-control form-control-sm' bind:value={it.unit} />
                    </td>
                    {/if}
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      <div class='input-group input-group-sm'>
                        <button class="btn btn-danger btn-sm px-2" on:click={()=>{removeParameter(index)}}><i class='bi bi-trash'></i></button>
                         {#if it.type != 'category'}
                        <button class="btn btn-info btn-sm px-2" on:click={()=>{makeCatParameter(index)}}><i class='bi bi-list'></i></button>
                        {:else}
                        <button class="btn btn-success btn-sm px-2" on:click={()=>{makeParParameter(index)}}><i class='bi bi-list'></i></button>

                        {/if}
                      </div>
                    </td>
                  </tr>
              {/each}
            </tbody>
          </table>
          <div class="p-0 mt-3" style="">
              <div class="form-outline" data-mdb-input-init>
                  <textarea
                      id="c-description"
                      class="form-control"
                      bind:value={description}
                  ></textarea>
                  <label class="form-label" for="c-description"
                      >{t("Description")}</label
                  >
              </div>
          </div>
         
          
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}>{t('Close')}</button>
        <button class="btn btn-primary" on:click={saveLabTestType}>{t('Save')}</button>
      </div>
    </div>
  </div>
</div>



<LabTestCategoryModal
  bind:this={catModalRef}
  on:saved={async (e) => {
    labtest_categories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
    labtest_category_id = e.detail.id;
  }} />