<script>
  import { onMount, createEventDispatcher } from 'svelte';

  import { purchaseApi } from '../../api/purchaseApi.js';
  import { settingsApi } from '../../api/settingsApi.js';
  import { productApi } from '../../api/productApi.js';
  import AppModal from '../../components/common/AppModal.svelte';

  import { t, lang, translate_org_type ,settings_all} from '../../i18n/i18n';
import { accountApi } from '../../api/accountApi.js';


  $: bill_index_prefix = $settings_all.find((s) => s.key === 'bill_index_prefix')?.value || "B-";

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let purchase = {};
  let items = [];
  let payments = [];
  let supplier = {};
  let settings = [];

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  async function loadItems() {
    if (!purchase?.id) return;
    const response = await purchaseApi.getById(purchase.id);
    const purchaseDetail = response?.data || {};
    const purchaseItems = (purchaseDetail.items || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
    const productIds = purchaseItems.map((i) => i.product_id);
    let products = [];

    if (productIds.length) {
      products = (await productApi.getAll({ status: 1 }))?.data || [];
      products = products.filter((p) => productIds.includes(p.id));
    }

    items = purchaseItems.map((i) => ({
      ...i,
      product_name: products.find((p) => p.id === i.product_id)?.name || 'Unknown',
      product_unit_id: i.product_unit_id || products.find((p) => p.id === i.product_id)?.product_unit_id,
    }));
    payments = purchaseDetail.payments || [];
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadPayments() {
    if (!purchase?.id) return;
    const response = await purchaseApi.getById(purchase.id);
    payments = response?.data?.payments || [];
  }

  async function loadSupplier() {
    if (!purchase?.account_id) return;
    supplier = await (async () => { const _a = (await accountApi.getById(purchase.account_id))?.data; return _a && _a.status === 1 ? _a : null; })();
  }

  onMount(async () => {
    await loadItems();
    await loadPayments();
    await loadSupplier();
  });

  function printReceipt() {
    const content = document.getElementById('receipt-content').innerHTML;
    const styles = `
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
        .receipt { width: 72mm; padding: 8px 10px; color: #222; }
        .brand { font-size: 14px; font-weight: 700; }

.underbrand { font-size: 12px; }
        .muted { color: #666; font-size: 11px }
        .center { text-align: center; }
        .small { font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        thead th { font-size: 11px;  padding: 6px 0; }
        .thead { font-size: 11px;  padding: 6px 0; }
        tbody td { padding: 4px 0; font-size: 11px; }
        .right { text-align: right; }
        .divider { border-top: 1px dashed #ccc; margin: 6px 0; }
        .totals { font-size: 12px; }
        @media print {
          @page { size: 72mm auto; margin: 0; }
          body { margin: 0; }
        }


* {color:#000000 !important;}
      </style>
    `;

    const w = window.open('', '_blank', 'width=400,height=600');
    w.document.write(
      '<!doctype html><html ' +
        t('dir=ltr') +
        '><head><meta charset="utf-8">' +
        styles +
        '</head><body>' +
        content +
        '</body></html>',
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 400);
  }

  $: total = Number(
    purchase?.total_amount || (items && items.length ? items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) : 0),
  );

  $: paymentCurrencyCodes = [
    ...new Set(
      (payments || [])
        .map((payment) => payment.currency || purchase?.currency)
        .filter(Boolean),
    ),
  ];

  $: paidCurrency =
    paymentCurrencyCodes.length === 1
      ? paymentCurrencyCodes[0]
      : purchase?.currency || 'AFN';

  $: paid =
    payments && payments.length
      ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : 0;

  $: due =
    purchase?.remaining != null && purchase?.remaining !== ''
      ? Number(purchase.remaining).toFixed(2)
      : (total - paid).toFixed(2);

  
  $: enable_purchase_items_discount = $settings_all.find((s) => s.key === 'enable_purchase_items_discount')?.value == 1;


</script>

<AppModal
  title={`${t('Receipt')} — ${bill_index_prefix}${purchase?.bill_number}`}
  icon="bi-printer"
  variant="primary"
  size="sm"
  on:close={close}>
  <div id="receipt-content">
          <div class="receipt">
            <!-- header area (company/supplier) -->

            <div class="center">
              {#if settings.find((s) => s.key === 'company_name')?.value}
                <div class="brand">{settings.find((s) => s.key === 'company_name')?.value || 'Zeno ERP'}</div>
              {/if}
              {#if settings.find((s) => s.key === 'company_address')?.value}
                <div class="underbrand">
                  {settings.find((s) => s.key === 'company_address')?.value || 'Company Address'}
                </div>
              {/if}
              {#if settings.find((s) => s.key === 'company_phone')?.value}
                <div class="underbrand">
                  {settings.find((s) => s.key === 'company_phone')?.value || 'Company Phone'}
                </div>
              {/if}
              {#if settings.find((s) => s.key === 'company_phone2')?.value}
                <div class="underbrand">
                  {settings.find((s) => s.key === 'company_phone2')?.value || 'Company Phone 2'}
                </div>
              {/if}
              {#if settings.find((s) => s.key === 'company_email')?.value}
                <div class="underbrand">
                  {settings.find((s) => s.key === 'company_email')?.value || 'Company Email'}
                </div>
              {/if}
              <!-- <div class="muted">123 Business St, City</div>
              <div class="muted">Tel: 000-000-000</div> -->
            </div>
            <div class="divider"></div>
            <div class="small">
              <div>{t('Bill')}: <strong>{bill_index_prefix}{purchase?.bill_number}</strong></div>
              <div>
                {t('Date')}:
                <span class="muted">{purchase?.bill_date ? purchase.bill_date.slice(0, 10) : ''}</span>
              </div>
              <div>
                {t('Supplier')}:
                <span class="muted">{supplier?.name || purchase?.description || ''}</span>
              </div>
            </div>

            <div class="divider"></div>

            <table>
              <thead> </thead>
              <tbody>
                <tr class="thead">
                  <th style="width:45%">{t('Product')}</th>
                  <th style="width:20%" class="right">{t('Price')}</th>
                  <th style="width:15%" class="center">{t('Qty')}</th>
                  {#if enable_purchase_items_discount}
                    <th style="width:15%" class="right">{t('Discount')}</th>
                  {/if}
                  <th style="width:20%" class="right">{t('Subtotal')}</th>
                </tr>
                {#each items as it}
                  <tr>
                    <td style="vertical-align:top">{it.product_name}</td>
                    <td class="right"
                      >{Number(it.unit_price).toFixed(2)}
                      {t(purchase?.currency) || ''}</td>
                    <td class="center">{it.quantity}</td>
                    {#if enable_purchase_items_discount}
                      <td class="right">
                        {Number(it.discount_amount).toFixed(2)}
                        {it.discount_type == 'fixed' ? t(purchase?.currency) || '' : t('%')}
                      </td>
                    {/if}
                    <td class="right"
                      >{Number(it.subtotal).toFixed(2)}
                      {t(purchase?.currency) || ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>

            <div class="divider"></div>

            <div class="totals small">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div>{t('Subtotal')}</div>
                <div class="right">
                  {items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0).toFixed(2)}
                  {t(purchase?.currency) || ''}
                </div>
              </div>
              {#if payments.length > 0}
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <div>{t('Total Paid')}</div>
                  <div class="right">
                    {paid.toFixed(2)}
                    {t(paidCurrency) || ''}
                  </div>
                </div>
              {/if}

              <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;">
                <!-- <div>{t("Total")}</div>
                  <div class="right">
                    {total.toFixed(2)}
                    {t(purchase?.currency) || ""}
                  </div>
                </div>
                <div
                  style="display:flex;justify-content:space-between;color:#d9534f;margin-top:4px;"
                > -->
                <div>{t('Due')}</div>
                <div class="right">{due} {t(purchase?.currency) || ''}</div>
              </div>
            </div>

            <div class="divider"></div>
            <div class="center small muted">Recorded by ZenoERP • Thank you!</div>
          </div>
  </div>

  <svelte:fragment slot="footer">
    <button type="button" class="app-modal-btn app-modal-btn--secondary" on:click={close}>
      <i class="bi bi-x-lg"></i>
      {t('Close')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--primary" on:click={printReceipt}>
      <i class="bi bi-printer"></i>
      {t('Print')}
    </button>
  </svelte:fragment>
</AppModal>

<style>
  .brand {
    font-size: 14px;
    font-weight: 700;
  }
  .underbrand {
    font-size: 12px;
  }
  .center {
    text-align: center;
  }
  .divider {
    border-top: 1px dashed #000;
    margin: 6px 0;
  }

* {color:#000000 !important;}
</style>
