<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import { amountInWords } from '../../../utils/amountInWords.js';
  import { currencyLabels } from '../../../utils/currencyLabel.js';

  /* The bill's own amount, spelled out under the figures. */
  $: totalInWords = amountInWords(total, $lang, currencyLabels(bom?.currency, t));
  import { settingsApi } from '../../../api/settingsApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { bomApi } from '../../../api/bomApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let bom = {};
  let items = [];
  let settings = [];

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  async function loadItems() {
    if (!bom?.id) return;
    const fullBom = (await bomApi.getById(bom.id))?.data || bom;
    const bomItems = (fullBom.items || []).filter((i) => Number(i.status) === 1);
    const productIds = bomItems.map((i) => i.product_id);
    const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) =>
      productIds.includes(p.id),
    );
    items = bomItems.map((i) => ({
      ...i,
      product_name: products.find((p) => p.id === i.product_id)?.name || 'Unknown',
      product_unit_id: i.product_unit_id || products.find((p) => p.id === i.product_id)?.product_unit_id,
    }));
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    await loadItems();
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
    bom?.total_amount || (items && items.length ? items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) : 0),
  );
</script>

<div
  class="modal-backdrop show"
  style="z-index:1040;"
  role="button"
  tabindex="0"
  aria-label={t('Close')}
  on:click={close}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') close();
  }}>
</div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-dialog-centered" style="max-width: 350px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {bom?.bill_number}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="receipt-content">
          <div class="receipt">
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
            </div>
            <div class="divider"></div>
            <div class="small">
              <div>{t('Bill')}: <strong>{bom?.bill_number}</strong></div>
              <div>
                {t('Date')}:
                <span class="muted">{bom?.bill_date ? bom.bill_date.slice(0, 10) : ''}</span>
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
                  <th style="width:20%" class="right">{t('Subtotal')}</th>
                </tr>
                {#each items as it}
                  <tr>
                    <td style="vertical-align:top">{it.product_name}</td>
                    <td class="right"
                      >{Number(it.unit_price).toFixed(2)}
                      {t(bom?.currency) || ''}</td>
                    <td class="center">{it.quantity}</td>
                    <td class="right"
                      >{Number(it.subtotal).toFixed(2)}
                      {t(bom?.currency) || ''}</td>
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
                  {t(bom?.currency) || ''}
                </div>
              </div>

              <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;">
                <div>{t('Total')}</div>
                <div class="right">{Number(total).toFixed(2)} {t(bom?.currency) || ''}</div>
              </div>

              <!-- The amount stated twice: the figures above, the words here. -->
              <div class="words-line" style="margin-top:6px;">
                <span dir="ltr">{totalInWords}</span>
              </div>
            </div>

            <div class="divider"></div>
            <div class="center small muted">Recorded by ZenoERP • Thank you!</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}><i class="bi bi-x-lg"></i> {t('Close')}</button>
        <button class="btn btn-primary" on:click={printReceipt}><i class="bi bi-printer"></i> {t('Print')}</button>
      </div>
    </div>
  </div>
</div>

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

  * {
    color: #000000 !important;
  }
</style>
