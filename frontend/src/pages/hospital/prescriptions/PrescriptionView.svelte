<script>
  import { onMount, createEventDispatcher } from 'svelte';
import { productUnitApi } from '../../../api/productUnitApi.js';
  import PrescriptionModal from './PrescriptionModal.svelte';
  import PrescriptionDeleteModal from './PrescriptionDeleteModal.svelte';
  import PrescriptionEditModal from './PrescriptionEditModal.svelte';
  import { showDate } from '../../../calendar.js';
  import {toast} from '../../../ToastUI/toast.js';



  import { convertUnit, getMultiple } from '../../stocktransactions/calculateStock.js';

  import { push } from 'svelte-spa-router';

  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import PrescriptionReturnModal from './PrescriptionReturnModal.svelte';
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { productApi } from '../../../api/productApi.js';
import { prescriptionApi } from '../../../api/prescriptionApi.js';

  export let prescriptionId;
  const dispatch = createEventDispatcher();

  let paymentSectionKey = 0;
  let prescription;
  let products;
  let currencies = [];

  let items = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let patient = null;
  let units = [];

  let showReturn = false;

  let showDelete = false;
  let showEdit = false;

  let calculatedItems = [];

  $: if (currencies.length && products.length) {
    calculateItems();
  }

  async function calculateItems() {
    calculatedItems = await Promise.all(
      items.map(async (item) => {
        let product = products.find((p) => p.id === item.product_id);

        if (!product) return item;

        let costPrice = Number(product.buy_price) || 0;

        if (product.buy_currency != prescription.currency) {
          costPrice = exchangeRate(costPrice, product.buy_currency, prescription.currency) || 0;
        }

        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }

        let benefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        return {
          ...item,
          calculated_unit_price: costPrice,
          benefit,
        };
      }),
    );
  }


  async function mount() {
    prescription = (await prescriptionApi.getById(Number(prescriptionId)))?.data || null;
    if (!prescription || Number(prescription.status) !== 1) {
      toast.error(t('Error'), t('Prescription not found.'));
      return;
    }
    // Load prescription items
    const prescriptionItems = (prescription.items || []).filter((item) => Number(item.status) === 1);

    // Get all products involved
    const productIds = prescriptionItems.map((i) => i.product_id);
    products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

    // Map product names into items
    items = prescriptionItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_buy_price: product?.buy_price || 'Unknown',
        product_buy_currency: product?.buy_currency || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    patient = await (async () => { const _a = (await accountApi.getById(prescription.patient_id))?.data; return _a && _a.status === 1 ? _a : null; })();
  }


  onMount(async () => {
    // Load prescription
    await mount();
  });

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }
</script>

<div>
  <div class="card shadow-2 mb-3">
    <div class="card-body">
      <div class="float-end hide-for-pdf">
        <button class="btn btn-primary btn-sm me-2" on:click={() => (showA4Receipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')} A4</button>

        <button class="btn btn-danger btn-sm me-2" on:click={() => (showDelete = true)}
          ><i class="bi bi-trash me-2"></i>{t('Delete')}</button>
        {#if prescription?.prescription_status === 'confirmed'}
          <button class="btn btn-warning btn-sm me-2" on:click={() => (showReturn = true)}
            ><i class="bi bi-arrow-return-left me-2"></i>{t('Return')}</button>

          <button class="btn btn-info btn-sm me-2" on:click={() => (showEdit = true)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {:else}
          <button class="btn btn-warning btn-sm me-2" on:click={() => push(`/dashboard/prescription-form/${prescriptionId}`)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {/if}
      </div>
      <div class="mb-3">
        {#if prescription?.prescription_status === 'draft'}
          <span class="badge badge-warning text-dark mb-3">{t('Draft')}</span>
        {:else if prescription?.prescription_status === 'confirmed'}
          <span class="badge badge-success mb-3">{t('confirmed')}</span>
        {/if}
        <h5 class="mb-3">
          {t('Prescription #')}:
          {prescription?.prescription_number}
        </h5>

        <strong>{t('Date')}:</strong>
        {@html prescription?.prescription_date ? showDate(prescription.prescription_date) : '-'}<br />

        <strong>{t('Created Date')}:</strong>
        <span dir="ltr">{@html prescription?.created_at ? new Date(prescription.created_at).toLocaleString() : '-'}</span><br />
        <strong>{t('Updated Date')}:</strong>
        <span dir="ltr">{@html prescription?.updated_at ? new Date(prescription.updated_at).toLocaleString() : '-'}</span><br />

        <strong>{t('Customer')}:</strong>
        {#if patient}
          <button class="btn btn-link text-success btn-sm" on:click={() => push(`/dashboard/account/${patient.id}`)}>
            {#if t('Lang') === 'en' && patient.name}{patient.name}{/if}
            {#if t('Lang') === 'fa' && patient.name_fa}{patient.name_fa}{/if}
            {#if t('Lang') === 'ps' && patient.name_ps}{patient.name_ps}{/if}
          </button>
        {/if}
        <br />
        {#if prescription?.description}<strong>{t('Description')}:</strong>
          {prescription?.description || t('No description.')}<br />{/if}
      </div>
      <hr />
      <div class="row">
        <div class="col-md-3">
          <strong>{t('Vitals')}:</strong><br />
          {prescription?.vitals || t('No Vitals.')}<br /><br />
          <strong>{t('Diagnosis')}:</strong><br />
          {prescription?.diagnosis || t('No diagnosis.')}<br /><br />
          <strong>{t('Notes')}:</strong><br />
          {prescription?.notes || t('No notes.')}

        </div>
        <div class="col-md-9">
<div class="table-responsive">
        <table class="table table-striped">
          <thead class="table-light">
            <tr>
              <th>{t('Product')}</th>
              <th class="text-center">{t('Dosage')}</th>
              <th class="text-center">{t('Frequency')}</th>
              <th class="text-center">{t('Duration')}</th>
              <th class="text-center">{t('Instructions')}</th>
              <th class="text-center">{t('Quantity')}</th>
            </tr>
          </thead>
          <tbody>
            {#each calculatedItems as i}
              <tr>
                <td class="fw-bold">
                  <button
                    class="btn btn-link text-primary btn-sm fw-bold px-2"
                    on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button>
                </td>
                <td class="text-center fw-bold"
                  >{i.dosage || '-'} {i.dosage_unit || ''}</td>
                <td class="text-center fw-bold"
                  >{i.frequency || '-'}</td>
                <td class="text-center fw-bold"
                  >{i.duration ? `${i.duration} ${i.duration_unit || ''}` : '-'}</td>
                <td class="text-center fw-bold"
                  >{i.instructions || '-'}</td>
                  <td class="text-center fw-bold"
                  >{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
        </div>
      </div>
      
  </div>

  {#if showA4Receipt}
     <PrescriptionModal prescription={prescription} appointment_id={prescription.appointment_id} on:closed={() => {
      showA4Receipt = false;
      mount();
    }} 
    on:saved={() => {
      mount();
    }} />
  {/if}

  

  {#if showDelete}
    <PrescriptionDeleteModal {prescription} on:close={() => (showDelete = false)} />
  {/if}

  {#if showEdit}
    <PrescriptionEditModal {prescription} on:close={() => (showEdit = false)} />
  {/if}

  {#if showReturn}
    <PrescriptionReturnModal
      {prescription}
      on:close={async () => {
        showReturn = false;
        paymentSectionKey += 1;
      }} />
  {/if}
</div>
