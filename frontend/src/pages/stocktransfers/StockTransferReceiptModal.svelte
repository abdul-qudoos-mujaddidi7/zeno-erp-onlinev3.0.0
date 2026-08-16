<script>
  import { onMount, createEventDispatcher } from "svelte";
import { productUnitApi } from '../../api/productUnitApi.js';
import { settingsApi } from '../../api/settingsApi.js';

  import { productApi } from "../../api/productApi.js";

  import { t, lang, translate_org_type } from "../../i18n/i18n.js";
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate } from "../../calendar.js";
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';

  export let stocktransfer = {};
  let items = [];
  let payments = [];
  let warehouses = [];
  let settings = [];
  let units = [];
  let currencies = [];

  const dispatch = createEventDispatcher();

  function close() {
    dispatch("close");
  }

  async function loadItems() {
    const stocktransferItems = (stocktransfer?.items || []).filter((s) => s.status === 1);
    const productIds = stocktransferItems.map((i) => i.product_id);
    const products = (await productApi.getAll({ status: 1 }))?.data || [];
    items = stocktransferItems.map((i) => {
      const product = products.find((p) => Number(p.id) === Number(i.product_id));
      return {
        ...i,
        product_name: product?.name || "Unknown",
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });
    settings = (await settingsApi.getAll({ status: 1, key: 'company_name' }))?.data || [];
  }


  async function loadWarehouses() {
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadUnits() {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    // Load all dependencies in order
    await loadUnits(); // <-- await this first
    await loadCurrencies(); // <-- await this second
    await loadItems(); // items depend on products
    await loadWarehouses();

    // Map unit names directly to items to simplify template
    items = items.map((it) => ({
      ...it,
      unit_name: units.find((u) => u.id == it.product_unit_id)?.name || "",
      currency_symbol: currencies.find((c) => c.code == stocktransfer?.currency)?.symbol || "",
    }));
  });

  function printReceipt() {
    const content = document.getElementById("receipt-content").innerHTML;
    const styles = `
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
          .receipt { width: 72mm; padding: 8px 10px; color: #222; }
          .brand { font-size: 14px; font-weight: 700; }
          .muted { color: #666; font-size: 11px }
          .center { text-align: center; }
          .small { font-size: 11px; }
          table { width: 100%; border-collapse: collapse;  }
          thead th { font-size: 11px;  padding: 6px 0; }

          td {border-bottom: 1px solid #000;}
          th {border-bottom: 2px solid #000;}

          .thead { font-size: 11px;  padding: 6px 0; }
          tbody td { padding: 4px 4px; font-size: 11px; }
          .right { text-align: right; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .totals { font-size: 12px; }
          @media print {
            @page { size: 72mm auto; margin: 0; }
            body { margin: 0; }
          }
            .fw-bold {font-weight: 700;}
        </style>
      `;

    const w = window.open("", "_blank", "width=400,height=600");
    w.document.write(
      "<!doctype html><html " +
        t("dir=ltr") +
        '><head><meta charset="utf-8">' +
        styles +
        "<link rel='stylesheet' href='/fonts/vazirmatn.css'></head><body>" +
        content +
        "</body></html>",
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 400);
  }

  $: total = Number(
    stocktransfer?.total_amount ||
      (items && items.length
        ? items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
        : 0),
  );
  $: paid =
    payments && payments.length
      ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      : 0;
  $: due = (total - paid).toFixed(2);
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-dialog-centered" style="max-width: 350px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t("Receipt")} — {stocktransfer?.transfer_number}</h5>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          on:click={close}
        ></button>
      </div>
      <div class="modal-body">
        <div id="receipt-content">
          <div class="receipt">
            <div class="center">
              <div class="brand">{settings[0]?.value || "Company Name"}</div>
              <!-- <div class="muted">123 Business St, City</div>
              <div class="muted">Tel: 000-000-000</div> -->
            </div>
            <div class="divider"></div>

            <div class="small">
              <div>{t("Transfer #")}: <strong>{stocktransfer?.transfer_number}</strong></div>
              <div>
                {t("Date")}:
                <span class="muted"
                  >{@html stocktransfer?.transfer_date
                    ? showDate(stocktransfer.transfer_date.slice(0, 10),'receipt')
                    : ""}</span
                >
              </div>
              <div>
                {t("From Warehouse")}:
                <span class="muted"
                  >{warehouses.find((w) => w.id === stocktransfer.warehouse_id)?.name || stocktransfer?.description || "None"}</span
                >
              </div>
              <div>
                {t("To Warehouse")}:
                <span class="muted"
                  >{warehouses.find((w) => w.id === stocktransfer.to_warehouse_id)?.name || stocktransfer?.description || "None"}</span
                >
              </div>
            </div>

            <div class="divider"></div>

            <table border=2 cellpadding=3 cellspacing=0>
              <thead> </thead>
              <tbody>
                <tr class="thead">
                  <th width="40%">{t("Product")}</th>
                  <th width="15%" class="center">{t("Qty")}</th>
                  <th width="20%" class="center">{t("Price")}</th>
                  <th width="20%" class="center">{t("Subtotal")}</th>
                </tr>
                {#each items as it}
                  <tr>
                    <td style="vertical-align:top" class=".product-name" >{it.product_name}</td>
                    <td class="center"
                      >{it.quantity}
                      {it.unit_name}</td
                    >
                    <td class="center"
                      >{Number(it.unit_price).toFixed(2)}&nbsp;{it.currency_symbol}
                      </td
                    >
                    <td class="center"
                      >{Number(it.subtotal).toFixed(2)}&nbsp;{it.currency_symbol}
                      </td
                    >

                  </tr>
                {/each}
              </tbody>
            </table>

            <div class="divider"></div>

            <div class="totals small">
              
              <div class="fw-bold"
                style="display:flex;justify-content:space-between;margin-bottom:6px;"
              >
                <div>{t("Total Amount")}</div>
                <div class="right">
                  {Number(stocktransfer?.total_amount || 0).toFixed(2)}
                  {t(stocktransfer?.currency) || ""}
                </div>
              </div>
              

            </div>

            <div class="divider"></div>
            <div class="center small muted">
              {t("Powered by ZenoERP • Thank you!")}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}
          ><i class="bi bi-x-lg"></i> {t("Close")}</button
        >
        <button class="btn btn-primary" on:click={printReceipt}
          ><i class="bi bi-printer"></i> {t("Print")}</button
        >
      </div>
    </div>
  </div>
</div>
<style>

td {border-bottom: 1px solid #ccc;}
th {border-bottom: 2px solid #000;}
.product-name {padding: 10px 0;}
</style>