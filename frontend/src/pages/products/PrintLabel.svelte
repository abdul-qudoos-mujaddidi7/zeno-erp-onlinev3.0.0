<script>
  import { onMount, tick } from "svelte";
import { productUnitApi } from '../../api/productUnitApi.js';
  import { t, lang, translate_org_type } from "../../i18n/i18n";
  import JsBarcode from "jsbarcode";
  import QRCode from "qrcode";
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { productApi } from '../../api/productApi.js';
import { productCategoryApi } from '../../api/productCategoryApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let products = [];
  let categories = [];
  let units = [];
  let warehouses = [];
  let currencies = [];
  let search = "";
  let showDropdown = false;
  let selectedItems = [];
  let labelType = "barcode";
  let paperType = "MEDIUM_CUT";
  let customWidth = 54;
  let customHeight = 20;
  let manualQuantity = 1;
  let priceType = "sell";
  let customPrice = 0;
  let showPrice = false;
  let showName = false;
  let showCategory = false;
  let showUnit = false;
  let showFooter = false;
  let footerText = "Thank you for shopping with us!";
  let livePreviewRef;

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    warehouses = await Promise.all([
      warehouseApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 0 }),
    ]).then(([active, deleted]) => [
      ...(active?.data || []),
      ...(deleted?.data || []),
    ]);
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  });

  $: filteredProducts =
    search.length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.toLowerCase()) ||
              p.code?.toLowerCase().includes(search.toLowerCase())
          )
          .slice(0, 10)
      : [];
  function selectProduct(product) {
    const idx = selectedItems.findIndex((i) => i.product_id === product.id);
    if (idx !== -1) {
      selectedItems[idx].quantity += manualQuantity;
      selectedItems = [...selectedItems];
    } else {
      selectedItems = [
        ...selectedItems,
        {
          product_id: product.id,
          product_name: product.name,
          product,
          quantity: manualQuantity,
          unit: getUnit(product.product_unit_id)
        }
      ];
    }
    search = "";
    showDropdown = false;
  }

  function removeItem(index) {
    selectedItems.splice(index, 1);
    selectedItems = [...selectedItems];
  }

  function updateItemQuantity(index, qty) {
    selectedItems[index].quantity = Number(qty);
    selectedItems = [...selectedItems];
  }

  function getCategory(id) {
    return categories.find((c) => c.id === id)?.name || "";
  }

  function getUnit(id) {
    return units.find((u) => u.id === id)?.name || "";
  }

  function getCurrencySymbol(code) {
    return currencies.find((c) => c.code === code)?.symbol || "";
  }

  function getPrice(product) {
    if (priceType === "sell") return product.sell_price;
    if (priceType === "buy") return product.buy_price;
    return customPrice;
  }

  $: printableLabels = (() => {
    const labels = [];
    for (let item of selectedItems) {
      const count = Number(item.quantity) || 1;
      for (let i = 0; i < count; i++) {
        labels.push(item.product);
      }
    }
    return labels;
  })();

  $: if (printableLabels.length > 0 || labelType) {
    tick().then(() => renderCodes());
  }

  function isValidEAN13(ean) {
    const s = String(ean);
    if (!/^\d{13}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === parseInt(s[12], 10);
}

  async function renderCodes() {
    await tick();
    if (!livePreviewRef) return;
    if (labelType === "barcode") {
      livePreviewRef.querySelectorAll(".label-barcode").forEach((el, i) => {
        el.innerHTML = "";
        try {
          let validEan13 = isValidEAN13(printableLabels[i]?.code || "000000");
          console.log(`Rendering barcode for ${printableLabels[i]?.code || "000000"} - Valid EAN13: ${validEan13}`);
          let format = "EAN13";
          if (!validEan13) {
            format = "CODE128";
          } 
          JsBarcode(el, printableLabels[i]?.code || "000000", {
            format: format,
            lineColor: "#000",
            width: 1.2,
            height: 30,
            displayValue: true,
            fontSize: 12,
            textMargin: 2,
            margin: 0
          });
        } catch (e) {
          console.error("Barcode error", e);
        }
      });
    } else {
      const qrContainers = livePreviewRef.querySelectorAll(
        ".label-qrcode-container"
      );
      qrContainers.forEach(async (container, i) => {
        const code = printableLabels[i]?.code || "000000";
        try {
          const dataUrl = await QRCode.toDataURL(code, { width: 60, margin: 1 });
          container.innerHTML = `<img src="${dataUrl}" class="label-qrcode-img"/>`;
        } catch (e) {
          console.error("QR error", e);
        }
      });
    }
  }

  async function printLabels() {
    if (!printableLabels.length || !livePreviewRef) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const clone = livePreviewRef.cloneNode(true);

    clone.querySelectorAll(".label-qrcode-container img").forEach((img) => {
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      img.style.display = "block";
    });

    const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"));
    styles.forEach((s) => {
      if (s.tagName === "STYLE") printWindow.document.head.appendChild(s.cloneNode(true));
      else if (s.tagName === "LINK") {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = s.href;
        printWindow.document.head.appendChild(link);
      }
    });

    const extraStyle = document.createElement("style");
    extraStyle.innerHTML = `
      body { margin:0; font-family: 'Inter', 'Vazirmatn', Arial, sans-serif; }
      .label {
        page-break-inside: avoid;
        border: 1px solid #000;
        width: inherit;
        height: inherit;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
      }
      .label-qrcode-container { width:60px !important; height:60px !important; display:flex !important; justify-content:center !important; align-items:center !important; }
      .label-qrcode-img { width:100% !important; height:100% !important; object-fit:contain !important; display:block !important; }
    `;
    printWindow.document.head.appendChild(extraStyle);
    printWindow.document.body.innerHTML = "";
    printWindow.document.body.appendChild(clone);

    await new Promise((r) => setTimeout(r, 100));

    printWindow.focus();
    printWindow.print();
  }

  $: paperClass =
    paperType === "A4_GRID"
      ? "a4-grid"
      : paperType === "THERMAL_58"
      ? "thermal-58"
      : paperType === "THERMAL_80"
      ? "thermal-80"
      : paperType === "MEDIUM_CUT"
      ? "medium-cut"
      : paperType === "SMALL_CUT"
      ? "small-cut"
      : "custom-paper";
</script>

<div class="print-label-page">
  <div class="print-label-grid">
    <!-- Left Column -->
    <div class="no-print">
      <div class="card label-config-card">
        <div class="card-header label-card-header">
          <span class="label-card-icon"><i class="bi bi-upc-scan"></i></span>
          <div><small>{t("Settings")}</small><h5 class="mb-0">{t("Print Label Configuration")}</h5></div>
        </div>
        <div class="card-body">
          <!-- Product Search -->
          <div class="mb-4">
            <label class="form-label fw-bold">{t("Add Products")}</label>
            <div class="position-relative">
              <input type="text" class="form-control" bind:value={search} on:focus={() => showDropdown = true} on:blur={() => setTimeout(()=>showDropdown=false,200)} placeholder={t("Search products...")}/>
              {#if showDropdown && filteredProducts.length > 0}
                <div class="dropdown-menu show w-100 shadow" style="max-height:300px; overflow-y:auto;z-index:1055;">
                  {#each filteredProducts as p}
                    <button type="button" class="dropdown-item d-flex justify-content-between align-items-center" on:click={() => selectProduct(p)}>
                      <span>{p.name}</span>
                      <span class="badge bg-secondary">{p.code}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          {#if selectedItems.length > 0}
            <div class="table-responsive mb-4" style="max-height:300px;">
              <table class="table table-sm table-hover align-middle">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>{t("Product")}</th>
                    <th style="width:80px;">{t("Qty")}</th>
                    <th style="width:50px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each selectedItems as item,index}
                    <tr>
                      <td class="small">{item.product_name}</td>
                      <td><input type="number" class="form-control form-control-sm" value={item.quantity} min="1" on:input={(e)=>updateItemQuantity(index,e.target.value)} /></td>
                      <td><button class="btn btn-sm btn-link text-danger p-0" on:click={()=>removeItem(index)}><i class="bi bi-x-circle"></i></button></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="alert alert-info text-center small py-2 mb-4">{t("No products selected.")}</div>
          {/if}
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-bold">{t("Label Type")}</label>
              <div class="mt-1">
                <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="labelType" value="barcode" bind:group={labelType}/><label class="form-check-label">Barcode</label></div>
                <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="labelType" value="qrcode" bind:group={labelType}/><label class="form-check-label">QR Code</label></div>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-bold">{t("Paper Size")}</label>
              <select class="form-select" bind:value={paperType}>
                <option value="MEDIUM_CUT">{t("Medium Cut 54x20mm")}</option>
                <option value="SMALL_CUT">{t("Small Cut 25x20mm")}</option>
                <option value="A4_GRID">{t("A4 Sheet (Grid)")}</option>
                <option value="THERMAL_58">{t("Thermal 58mm")}</option>
                <option value="THERMAL_80">{t("Thermal 80mm")}</option>
                <option value="CUSTOM">{t("Custom Size")}</option>
              </select>
              {#if paperType==="CUSTOM"}
                <div class="row mt-2 g-2">
                  <div class="col-6"><label class="form-label">{t("Width (mm)")}</label><input type="number" class="form-control" bind:value={customWidth} min="1"/></div>
                  <div class="col-6"><label class="form-label">{t("Height (mm)")}</label><input type="number" class="form-control" bind:value={customHeight} min="1"/></div>
                </div>
              {/if}
            </div>
          </div>
          <div class="row g-3 mt-2">
            <div class="col-12 d-flex gap-2 flex-wrap">
              <div class="form-check"><input type="checkbox" class="form-check-input" bind:checked={showName} id="chkName"/><label class="form-check-label" for="chkName">{t("Name")}</label></div>
              <div class="form-check"><input type="checkbox" class="form-check-input" bind:checked={showPrice} id="chkPrice"/><label class="form-check-label" for="chkPrice">{t("Price")}</label></div>
              <div class="form-check"><input type="checkbox" class="form-check-input" bind:checked={showCategory} id="chkCat"/><label class="form-check-label" for="chkCat">{t("Category")}</label></div>
              <div class="form-check"><input type="checkbox" class="form-check-input" bind:checked={showUnit} id="chkUnit"/><label class="form-check-label" for="chkUnit">{t("Unit")}</label></div>
              <div class="form-check"><input type="checkbox" class="form-check-input" bind:checked={showFooter} id="chkFooter"/><label class="form-check-label" for="chkFooter">{t("Footer")}</label></div>
            </div>
          </div>
          <div class="mt-4 d-grid gap-2 d-md-flex justify-content-md-end">
            <button class="btn btn-secondary" on:click={()=>selectedItems=[]}><i class="bi bi-trash me-1"></i>{t("Clear All")}</button>
            <button class="btn btn-primary" on:click={printLabels} disabled={!printableLabels.length}><i class="bi bi-printer me-1"></i>{t("Print")}</button>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="card label-preview-card no-print">
        <div class="card-header label-card-header">
          <span class="label-card-icon"><i class="bi bi-eye"></i></span>
          <div><small>{t("Preview")}</small><h5 class="mb-0">{t("Live Preview")}</h5></div>
        </div>
        <div class="card-body label-preview-body">
          {#if printableLabels.length>0}
            <div class="d-flex justify-content-center mb-3"><span class="badge bg-success">{t("Total Labels")}: {printableLabels.length}</span></div>
            <div class="print-wrapper">
              <div class={`print-area ${paperClass}`} bind:this={livePreviewRef} style={paperType==="CUSTOM" ? `--w:${customWidth}mm; --h:${customHeight}mm`:''}>
                {#each printableLabels as product}
                  <div class="label">
                    {#if showName}<div class="name">{product.name}</div>{/if}
                    {#if showCategory && product.category_id}<div class="meta">{getCategory(product.category_id)}</div>{/if}
                    {#if showUnit && product.product_unit_id}<div class="meta">{getUnit(product.product_unit_id)}</div>{/if}
                    {#if showPrice}<div class="price">{getPrice(product)}{getCurrencySymbol(product.sell_currency)}</div>{/if}
                    <div class="code-container">
                      {#if labelType==='barcode'}<svg class="label-barcode"></svg>{:else}<div class="label-qrcode-container"></div>{/if}
                    </div>
                    {#if showFooter}<div class="footer">{footerText}</div>{/if}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="text-center text-muted py-5"><i class="bi bi-card-text display-4"></i><p class="mt-2">{t("Select products to see live preview.")}</p></div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .print-label-page { width: 100%; }
  .print-label-grid { display: grid; grid-template-columns: minmax(340px, .85fr) minmax(420px, 1.15fr); gap: 20px; align-items: start; }
  .label-config-card, .label-preview-card { overflow: visible; border: 1px solid #dfe5ed; border-radius: 12px; background: var(--erp-bg); box-shadow: 0 4px 16px rgba(30,48,76,.08); }
  .label-card-header { display: flex; gap: 12px; align-items: center; padding: 16px 18px; border-bottom: 1px solid #e7ecf2; border-radius: 12px 12px 0 0 !important; background: linear-gradient(180deg,#fff 0%,#fbfdff 100%); color: #263244; }
  .label-card-header small { display: block; margin-bottom: 2px; color: #94a3b8; font-size: .68rem; font-weight: 800; }
  .label-card-header h5 { font-size: .95rem; font-weight: 900; }
  .label-card-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 9px; background: #eaf2ff; color: #2f6fed; font-size: 1.05rem; }
  .label-config-card :global(.card-body) { padding: 20px; }
  .label-config-card :global(.form-label) { margin-bottom: 7px; color: #46536a; font-size: .77rem; font-weight: 800 !important; }
  .label-config-card :global(.form-control), .label-config-card :global(.form-select) { min-height: 42px; border-color: #d7dee8; border-radius: 9px; font-size: .8rem; }
  .label-config-card :global(.form-control:focus), .label-config-card :global(.form-select:focus) { border-color: #73a1f8; box-shadow: 0 0 0 3px rgba(47,111,237,.08); }
  .label-config-card :global(.alert-info) { border: 1px dashed #bdd0ef; border-radius: 9px; background: #f4f8ff; color: #62718a; }
  .label-preview-body { min-height: 480px; overflow: auto; background: #f5f7fb; }
  .label-preview-body > :global(.text-muted) { display: grid; min-height: 390px; place-content: center; }
  .print-wrapper {
    background:#fff;
    padding:10px;
    min-height:200px;
    overflow-x:auto;
  }
  .print-area {
    display:flex;
    flex-wrap:wrap;
    gap:2mm;
    justify-content:flex-start;
  }

  .label {
    border:1px solid #eee;
    padding:5px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:space-between;
    font-family:Arial, sans-serif;
    box-sizing:border-box;
    height:100%;
    width:100%;
    overflow:hidden;
  }
  .name, .meta, .price, .footer { flex-shrink:0; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .code-container { flex-shrink:0; display:flex; justify-content:center; align-items:center; }

  .a4-grid .label { width:63mm; height:35mm; }
  .thermal-58 .label { width:58mm; height:30mm; }
  .thermal-80 .label { width:80mm; height:35mm; }
  .medium-cut .label { width:54mm; height:20mm; }
  .small-cut .label { width:25mm; height:20mm; }
  .custom-paper .label { width:var(--w); height:var(--h); }

  .label-qrcode-container { width:60px; height:60px; display:flex; justify-content:center; align-items:center; }
  .label-qrcode-img { width:100%; height:100%; object-fit:contain; display:block; }

  @media (max-width: 1200px) { .print-label-grid { grid-template-columns: 1fr; } }
  @media (max-width: 575px) { .label-config-card :global(.card-body) { padding: 15px; } .label-card-header { padding: 13px 15px; } }

  @media print {
    body * { display:none !important; }
    .label { display:flex !important; visibility:visible !important; border:1px solid #000 !important; page-break-inside:avoid; }
  }
</style>
