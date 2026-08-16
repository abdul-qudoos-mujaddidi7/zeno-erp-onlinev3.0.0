<script>
import { productUnitApi } from '../../api/productUnitApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { accountApi } from '../../api/accountApi.js';
  import { purchaseApi } from '../../api/purchaseApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import PaymentSection from './PaymentSection.svelte';
  import PurchaseReceiptModal from './PurchaseReceiptModal.svelte';
  import PurchaseDeleteModal from './PurchaseDeleteModal.svelte';
  import PurchaseDraftModal from './PurchaseDraftModal.svelte';
  import PurchaseEditModal from './PurchaseEditModal.svelte';
  import { push } from 'svelte-spa-router';
  import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';

  import { showDate } from '../../calendar.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  $: bill_index_prefix = $settings_all.find((s) => s.key === 'bill_index_prefix')?.value || 'B-';

  $: enable_purchase_bill_due_date = $settings_all.find((s) => s.key === 'enable_purchase_bill_due_date')?.value == 1;

  $: enable_purchase_items_discount = $settings_all.find((s) => s.key === 'enable_purchase_items_discount')?.value == 1;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let enable_expiry_date = false;
  export let purchaseId;
  const dispatch = createEventDispatcher();

  import PurchaseReturnModal from './PurchaseReturnModal.svelte';

  let showReturn = false;
  let paymentSectionKey = 0;
  let purchase;
  let items = [];
  let showReceipt = false;
  let supplier = null;
  let units = [];
  let loading = true;

  let showDelete = false;
  let showEdit = false;
  let showDraft = false;

  function goBack() {
    push('/dashboard/purchases');
  }

  function supplierName(acc) {
    if (!acc) return '';
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  function unitName(unitId) {
    return units.find((u) => u.id === unitId)?.name || '-';
  }

  onMount(async () => {
    try {
      const response = await purchaseApi.getById(Number(purchaseId));
      purchase = response?.data;
      if (!purchase) return;

      const purchaseItems = (purchase.items || [])
        .filter((item) => Number(item.status) !== 0)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      const productIds = purchaseItems.map((i) => i.product_id);

      const [scopedProducts, unitRows, settingsRows, supplierResponse] =
        await Promise.all([
          fetchProductsByIds(productIds),
          productUnitApi.getAll({ status: 1 }),
          settingsApi.getAll({ status: 1, key: 'enable_expiry_date' }),
          accountApi.getById(purchase.account_id),
        ]);

      enable_expiry_date = settingsRows?.data?.[0]?.value == 1;
      units = unitRows?.data || [];
      const supplierData = supplierResponse?.data;
      supplier =
        supplierData && Number(supplierData.status) === 1 ? supplierData : null;

      items = purchaseItems.map((i) => {
        const product = scopedProducts.find(
          (p) => Number(p.id) === Number(i.product_id),
        );
        return {
          ...i,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
        };
      });
    } catch (error) {
      console.error('Failed to load purchase detail:', error);
      purchase = null;
    } finally {
      loading = false;
    }
  });
</script>

{#if !permissions?.some((p) => p.code === 'Purchases' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
  <div class="purchase-detail-page">
    <div class="purchase-detail-page__inner">
    {#if loading}
      <div class="purchase-detail-card purchase-detail-card--loading">
        <div class="purchase-detail-skeleton"></div>
        <div class="purchase-detail-skeleton purchase-detail-skeleton--short"></div>
      </div>
    {:else if !purchase}
      <div class="purchase-detail-card purchase-detail-empty">
        <i class="bi bi-receipt"></i>
        <p>{t('Purchase not found.')}</p>
        <button type="button" class="pd-btn pd-btn--neutral" on:click={goBack}>
          <i class="bi bi-arrow-left"></i>
          {t('Back')}
        </button>
      </div>
    {:else}
      <header class="pd-header-card">
        <div class="pd-header-card__top">
          <div class="pd-header-card__title-row">
            <button type="button" class="pd-btn pd-btn--neutral pd-btn--icon" on:click={goBack} title={t('Back')}>
              <i class="bi bi-arrow-left"></i>
            </button>
            <h1 class="pd-header-card__title">
              {t('Purchase #')}: {bill_index_prefix}{purchase?.bill_number}
            </h1>
            {#if purchase?.bill_status === 'draft'}
              <span class="pd-status-badge pd-status-badge--draft">{t('Draft')}</span>
            {:else if purchase?.bill_status === 'confirmed'}
              <span class="pd-status-badge pd-status-badge--confirmed">{t('confirmed')}</span>
            {/if}
          </div>

          <div class="pd-header-card__actions">
            <button type="button" class="pd-btn pd-btn--primary" on:click={() => (showReceipt = true)}>
              <i class="bi bi-printer"></i>
              {t('Print')}
            </button>
            {#if permissions?.some((p) => p.code === 'Purchases' && p.edit)}
              <button type="button" class="pd-btn pd-btn--secondary" on:click={() => push(`/dashboard/purchase-form/${purchaseId}`)}>
                <i class="bi bi-pencil"></i>
                {t('Edit')}
              </button>
            {/if}
            {#if purchase?.bill_status === 'confirmed' && permissions?.some((p) => p.code === 'Purchases' && p.edit)}
              <button type="button" class="pd-btn pd-btn--secondary" on:click={() => (showDraft = true)}>
                <i class="bi bi-file-earmark"></i>
                {t('Make Draft')}
              </button>
            {/if}
            {#if purchase?.bill_status === 'confirmed'}
              <button type="button" class="pd-btn pd-btn--outline" on:click={() => (showReturn = true)}>
                <i class="bi bi-arrow-return-left"></i>
                {t('Return')}
              </button>
            {/if}
            {#if permissions?.some((p) => p.code === 'Purchases' && p.delete)}
              <button type="button" class="pd-btn pd-btn--danger-outline" on:click={() => (showDelete = true)}>
                <i class="bi bi-trash"></i>
                {t('Delete')}
              </button>
            {/if}
          </div>
        </div>

        <dl class="pd-header-meta">
          <div class="pd-header-meta__item">
            <dt>{t('Supplier')}</dt>
            <dd>
              {#if supplier}
                <button type="button" class="pd-link" on:click={() => push(`/dashboard/account/${supplier.id}`)}>
                  {supplierName(supplier)}
                </button>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('Date')}</dt>
            <dd>{@html purchase?.bill_date ? showDate(purchase.bill_date) : '-'}</dd>
          </div>
          {#if enable_purchase_bill_due_date}
            <div class="pd-header-meta__item">
              <dt>{t('Due Date')}</dt>
              <dd>{@html purchase?.due_date ? showDate(purchase.due_date) : '-'}</dd>
            </div>
          {/if}
          {#if purchase?.description}
            <div class="pd-header-meta__item">
              <dt>{t('Description')}</dt>
              <dd>{purchase.description}</dd>
            </div>
          {/if}
        </dl>
      </header>

      {#if purchase?.bill_status === 'confirmed'}
        {#key paymentSectionKey}
          <PaymentSection {purchaseId}>
            <section class="pd-card pd-items-card">
              <div class="pd-card__head">
                <h2 class="pd-card__title">
                  <i class="bi bi-box-seam"></i>
                  {t('Purchased Items')}
                </h2>
              </div>
              <div class="pd-card__scroll">
                <table class="pd-table pd-table--items">
                  <colgroup>
                    <col class="pd-table__col-product" />
                    {#if enable_expiry_date}<col class="pd-table__col-expiry" />{/if}
                    <col class="pd-table__col-qty" />
                    <col class="pd-table__col-num" />
                    <col class="pd-table__col-num" />
                    {#if enable_purchase_items_discount}
                      <col class="pd-table__col-num" />
                      <col class="pd-table__col-num" />
                    {/if}
                    <col class="pd-table__col-num pd-table__col-total" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="pd-table__col-product">{t('Product')}</th>
                      {#if enable_expiry_date}<th class="pd-table__col-expiry">{t('Expiry Date')}</th>{/if}
                      <th class="pd-table__col-qty">{t('Quantity')}</th>
                      <th class="pd-table__col-num">{t('Buy Price')}</th>
                      <th class="pd-table__col-num">{t('Sell Price')}</th>
                      {#if enable_purchase_items_discount}
                        <th class="pd-table__col-num">{t('Discount')}</th>
                        <th class="pd-table__col-num">{t('Pure Price')}</th>
                      {/if}
                      <th class="pd-table__col-num pd-table__col-total">{t('Total Price')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each items as i}
                      <tr>
                        <td class="pd-table__col-product">
                          <button type="button" class="pd-link pd-link--product" on:click={() => push(`/dashboard/product/${i.product_id}`)}>
                            {i.product_name}
                          </button>
                        </td>
                        {#if enable_expiry_date}<td class="pd-table__col-expiry">{i.expiry_date || '—'}</td>{/if}
                        <td class="pd-table__col-qty">
                          <span class="pd-table__qty-cell">
                            <span class="purchase-qty-pill">
                              <span dir="ltr">{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                            </span>
                            <span class="purchase-qty-unit">{unitName(i.product_unit_id)}</span>
                          </span>
                        </td>
                        <td class="pd-table__amount pd-table__col-num">
                          <span class="pd-table__num">
                            <span dir="ltr">{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                            <span class="pd-table__currency">{t(i.currency)}</span>
                          </span>
                        </td>
                        <td class="pd-table__amount pd-table__col-num">
                          <span class="pd-table__num">
                            <span dir="ltr">{Number(i.sell_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                            <span class="pd-table__currency">{t(i.sell_currency || i.currency)}</span>
                          </span>
                        </td>
                        {#if enable_purchase_items_discount}
                          <td class="pd-table__amount pd-table__col-num">
                            {#if i.discount_amount && i.discount_amount > 0}
                              <span class="pd-table__num">
                                <span dir="ltr">
                                  {Number(i.discount_amount || 0).toLocaleString(undefined, {
                                    maximumFractionDigits: 3,
                                  })}{i.discount_type == 'fixed' ? '' : t('%')}
                                </span>
                                {#if i.discount_type == 'fixed'}
                                  <span class="pd-table__currency">{t(i.currency)}</span>
                                {/if}
                              </span>
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num">
                              <span dir="ltr">
                                {#if i.discount_type === 'percent'}
                                  {Number(i.unit_price * (1 - i.discount_amount / 100) || 0).toFixed(2)}
                                {:else if i.discount_type === 'fixed'}
                                  {Number(i.unit_price - Number(i.discount_amount) / Number(i.quantity) || 0).toFixed(2)}
                                {:else}
                                  {Number(i.unit_price).toFixed(2)}
                                {/if}
                              </span>
                              <span class="pd-table__currency">{t(i.unit_price_currency || i.currency)}</span>
                            </span>
                          </td>
                        {/if}
                        <td class="pd-table__amount pd-table__amount--total pd-table__col-num pd-table__col-total">
                          <span class="pd-table__num">
                            <span dir="ltr">{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                            <span class="pd-table__currency">{t(i.currency)}</span>
                          </span>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </section>
          </PaymentSection>
        {/key}
      {:else}
        <div class="purchase-detail-summary purchase-detail-summary--solo">
          <div class="purchase-summary-card">
            <div class="purchase-summary-card__icon purchase-summary-card__icon--total">
              <i class="bi bi-receipt"></i>
            </div>
            <div class="purchase-summary-card__body">
              <span class="purchase-summary-card__label">{t('Total')}</span>
              <span class="purchase-summary-card__value">
                <span dir="ltr">{Number(purchase?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <small>{t(purchase?.currency)}</small>
              </span>
            </div>
          </div>
        </div>

        <section class="pd-card pd-items-card">
          <div class="pd-card__head">
            <h2 class="pd-card__title">
              <i class="bi bi-box-seam"></i>
              {t('Purchased Items')}
            </h2>
          </div>
          <div class="pd-card__scroll">
            <table class="pd-table pd-table--items">
              <colgroup>
                <col class="pd-table__col-product" />
                {#if enable_expiry_date}<col class="pd-table__col-expiry" />{/if}
                <col class="pd-table__col-qty" />
                <col class="pd-table__col-num" />
                <col class="pd-table__col-num" />
                {#if enable_purchase_items_discount}
                  <col class="pd-table__col-num" />
                  <col class="pd-table__col-num" />
                {/if}
                <col class="pd-table__col-num pd-table__col-total" />
              </colgroup>
              <thead>
                <tr>
                  <th class="pd-table__col-product">{t('Product')}</th>
                  {#if enable_expiry_date}<th class="pd-table__col-expiry">{t('Expiry Date')}</th>{/if}
                  <th class="pd-table__col-qty">{t('Quantity')}</th>
                  <th class="pd-table__col-num">{t('Buy Price')}</th>
                  <th class="pd-table__col-num">{t('Sell Price')}</th>
                  {#if enable_purchase_items_discount}
                    <th class="pd-table__col-num">{t('Discount')}</th>
                    <th class="pd-table__col-num">{t('Pure Price')}</th>
                  {/if}
                  <th class="pd-table__col-num pd-table__col-total">{t('Total Price')}</th>
                </tr>
              </thead>
              <tbody>
                {#each items as i}
                  <tr>
                    <td class="pd-table__col-product">
                      <button type="button" class="pd-link pd-link--product" on:click={() => push(`/dashboard/product/${i.product_id}`)}>
                        {i.product_name}
                      </button>
                    </td>
                    {#if enable_expiry_date}<td class="pd-table__col-expiry">{i.expiry_date || '—'}</td>{/if}
                    <td class="pd-table__col-qty">
                      <span class="pd-table__qty-cell">
                        <span class="purchase-qty-pill">
                          <span dir="ltr">{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                        </span>
                        <span class="purchase-qty-unit">{unitName(i.product_unit_id)}</span>
                      </span>
                    </td>
                    <td class="pd-table__amount pd-table__col-num">
                      <span class="pd-table__num">
                        <span dir="ltr">{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                        <span class="pd-table__currency">{t(i.currency)}</span>
                      </span>
                    </td>
                    <td class="pd-table__amount pd-table__col-num">
                      <span class="pd-table__num">
                        <span dir="ltr">{Number(i.sell_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                        <span class="pd-table__currency">{t(i.sell_currency || i.currency)}</span>
                      </span>
                    </td>
                    {#if enable_purchase_items_discount}
                      <td class="pd-table__amount pd-table__col-num">
                        {#if i.discount_amount && i.discount_amount > 0}
                          <span class="pd-table__num">
                            <span dir="ltr">
                              {Number(i.discount_amount || 0).toLocaleString(undefined, {
                                maximumFractionDigits: 3,
                              })}{i.discount_type == 'fixed' ? '' : t('%')}
                            </span>
                            {#if i.discount_type == 'fixed'}
                              <span class="pd-table__currency">{t(i.currency)}</span>
                            {/if}
                          </span>
                        {:else}
                          —
                        {/if}
                      </td>
                      <td class="pd-table__amount pd-table__col-num">
                        <span class="pd-table__num">
                          <span dir="ltr">
                            {#if i.discount_type === 'percent'}
                              {Number(i.unit_price * (1 - i.discount_amount / 100) || 0).toFixed(2)}
                            {:else if i.discount_type === 'fixed'}
                              {Number(i.unit_price - Number(i.discount_amount) / Number(i.quantity) || 0).toFixed(2)}
                            {:else}
                              {Number(i.unit_price).toFixed(2)}
                            {/if}
                          </span>
                          <span class="pd-table__currency">{t(i.unit_price_currency || i.currency)}</span>
                        </span>
                      </td>
                    {/if}
                    <td class="pd-table__amount pd-table__amount--total pd-table__col-num pd-table__col-total">
                      <span class="pd-table__num">
                        <span dir="ltr">{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                        <span class="pd-table__currency">{t(i.currency)}</span>
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {/if}
    </div>
  </div>

  {#if showReceipt && purchase}
    <PurchaseReceiptModal {purchase} on:close={() => (showReceipt = false)} />
  {/if}
  {#if showDelete && purchase}
    <PurchaseDeleteModal {purchase} on:close={() => (showDelete = false)} />
  {/if}
  {#if showDraft && purchase}
    <PurchaseDraftModal {purchase} on:close={() => (showDraft = false)} />
  {/if}
  {#if showEdit && purchase}
    <PurchaseEditModal {purchase} on:close={() => (showEdit = false)} />
  {/if}
  {#if showReturn && purchase}
    <PurchaseReturnModal
      {purchase}
      on:close={async () => {
        showReturn = false;
        paymentSectionKey += 1;
      }} />
  {/if}
{/if}

<style>
  .purchase-detail-page {
    width: calc(100% + 1rem);
    margin: -0.5rem;
    min-height: 100%;
    padding-block: 24px;
    background: #f8fafc;
  }

  .purchase-detail-page__inner {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Header card */
  .pd-header-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pd-header-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pd-header-card__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    flex: 1 1 auto;
  }

  .pd-header-card__title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
  }

  .pd-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  .pd-status-badge--confirmed {
    background: #ecfdf5;
    color: #10b981;
    border: 1px solid #a7f3d0;
  }

  .pd-status-badge--draft {
    background: #fffbeb;
    color: #f59e0b;
    border: 1px solid #fde68a;
  }

  .pd-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    margin: 0;
    padding-block-start: 8px;
    border-block-start: 1px solid #f1f5f9;
  }

  .pd-header-meta__item {
    margin: 0;
  }

  .pd-header-meta dt {
    margin: 0 0 1px;
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
  }

  .pd-header-meta dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .pd-header-card__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .pd-link {
    background: none;
    border: none;
    padding: 0;
    color: #0f6efd;
    font-weight: 600;
    cursor: pointer;
    text-align: start;
  }

  .pd-link--product {
    font-size: 14px;
  }

  .pd-link:hover {
    text-decoration: underline;
  }

  /* Buttons */
  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    padding: 7px 12px;
    font-weight: 600;
    font-size: 12px;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pd-btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .pd-btn--primary:hover {
    background: #1d4ed8;
  }

  .pd-btn--secondary {
    background: #eff6ff;
    color: #0f6efd;
    border-color: #bfdbfe;
  }

  .pd-btn--secondary:hover {
    background: #dbeafe;
  }

  .pd-btn--outline {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--outline:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .pd-btn--danger-outline {
    background: #ffffff;
    color: #ef4444;
    border-color: #ef4444;
  }

  .pd-btn--danger-outline:hover {
    background: #fef2f2;
  }

  .pd-btn--neutral {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--neutral:hover {
    background: #f8fafc;
  }

  .pd-btn--icon {
    padding: 7px 9px;
    flex-shrink: 0;
  }

  /* Cards */
  .pd-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .pd-card__head {
    padding: 14px 20px;
    border-bottom: 1px solid #e2e8f0;
  }

  .pd-card__title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    font-weight: 700;
    color: #0f172a;
  }

  .pd-card__title i {
    color: #0f6efd;
    font-size: 1rem;
  }

  .pd-card__scroll {
    overflow-x: auto;
  }

  /* Table */
  .pd-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .pd-table--items col.pd-table__col-product {
    width: 30%;
  }

  .pd-table--items col.pd-table__col-expiry {
    width: 12%;
  }

  .pd-table--items col.pd-table__col-qty {
    width: 14%;
  }

  .pd-table--items col.pd-table__col-num {
    width: 14%;
  }

  .pd-table--items col.pd-table__col-total {
    width: 16%;
  }

  .pd-table th {
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    padding: 12px 16px;
    text-align: start;
    white-space: nowrap;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }

  .pd-table td {
    padding: 12px 16px;
    border-block-start: 1px solid #f1f5f9;
    color: #0f172a;
    text-align: start;
    vertical-align: middle;
    font-size: 14px;
  }

  .pd-table th.pd-table__col-qty,
  .pd-table td.pd-table__col-qty,
  .pd-table th.pd-table__col-num,
  .pd-table td.pd-table__col-num {
    text-align: start;
  }

  .pd-table td.pd-table__col-qty {
    white-space: nowrap;
  }

  .pd-table__qty-cell {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    max-width: 100%;
  }

  .pd-table__num {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .pd-table__num > [dir='ltr'] {
    unicode-bidi: isolate;
  }

  .pd-table tbody tr:hover td {
    background: #f8fafc;
  }

  .pd-table__amount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .pd-table__amount--total {
    font-weight: 800;
  }

  .pd-table__currency {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .purchase-qty-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 6px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 13px;
    font-weight: 600;
  }

  .purchase-qty-unit {
    font-size: 12px;
    color: #64748b;
  }

  /* Draft-only summary */
  .purchase-detail-summary--solo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: stretch;
    max-width: 320px;
  }

  .purchase-summary-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    min-height: 72px;
  }

  .purchase-summary-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .purchase-summary-card__icon--total {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-summary-card__body {
    min-width: 0;
  }

  .purchase-summary-card__label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    margin-bottom: 2px;
  }

  .purchase-summary-card__value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .purchase-summary-card__value small {
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
  }

  .purchase-detail-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
  }

  .purchase-detail-card--loading {
    display: grid;
    gap: 12px;
  }

  .purchase-detail-skeleton {
    height: 20px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: pd-shimmer 1.2s infinite;
  }

  .purchase-detail-skeleton--short {
    width: 60%;
  }

  @keyframes pd-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .purchase-detail-empty {
    text-align: center;
    padding: 48px 24px;
    color: #64748b;
  }

  .purchase-detail-empty i {
    font-size: 2.5rem;
    margin-bottom: 12px;
    display: block;
    color: #94a3b8;
  }

  .purchase-detail-empty p {
    margin: 0 0 16px;
  }

  :global(html.dark) .purchase-detail-page,
  :global([data-mdb-theme='dark']) .purchase-detail-page {
    background: #0b1220;
    color: #e5edf8;
  }

  :global(html.dark) .pd-header-card,
  :global(html.dark) .pd-card,
  :global(html.dark) .purchase-summary-card,
  :global(html.dark) .purchase-detail-card,
  :global([data-mdb-theme='dark']) .pd-header-card,
  :global([data-mdb-theme='dark']) .pd-card,
  :global([data-mdb-theme='dark']) .purchase-summary-card,
  :global([data-mdb-theme='dark']) .purchase-detail-card {
    border-color: #334762;
    background: #111827;
    color: #e5edf8;
  }

  :global(html.dark) .pd-header-card__title,
  :global(html.dark) .pd-header-meta dd,
  :global(html.dark) .pd-card__title,
  :global(html.dark) .purchase-summary-card__value,
  :global([data-mdb-theme='dark']) .pd-header-card__title,
  :global([data-mdb-theme='dark']) .pd-header-meta dd,
  :global([data-mdb-theme='dark']) .pd-card__title,
  :global([data-mdb-theme='dark']) .purchase-summary-card__value {
    color: #f1f5f9;
  }

  :global(html.dark) .pd-header-meta,
  :global(html.dark) .pd-card__head,
  :global([data-mdb-theme='dark']) .pd-header-meta,
  :global([data-mdb-theme='dark']) .pd-card__head {
    border-color: #2b3b52;
  }

  :global(html.dark) .pd-header-meta dt,
  :global(html.dark) .pd-table__currency,
  :global(html.dark) .purchase-qty-unit,
  :global(html.dark) .purchase-summary-card__label,
  :global(html.dark) .purchase-summary-card__value small,
  :global(html.dark) .purchase-detail-empty,
  :global([data-mdb-theme='dark']) .pd-header-meta dt,
  :global([data-mdb-theme='dark']) .pd-table__currency,
  :global([data-mdb-theme='dark']) .purchase-qty-unit,
  :global([data-mdb-theme='dark']) .purchase-summary-card__label,
  :global([data-mdb-theme='dark']) .purchase-summary-card__value small,
  :global([data-mdb-theme='dark']) .purchase-detail-empty {
    color: #94a3b8;
  }

  :global(html.dark) .pd-table th,
  :global([data-mdb-theme='dark']) .pd-table th {
    border-color: #334762;
    background: #172033;
    color: #a9b7ca;
  }

  :global(html.dark) .pd-table td,
  :global([data-mdb-theme='dark']) .pd-table td {
    border-color: #2b3b52;
    color: #dbe7f7;
  }

  :global(html.dark) .pd-table tbody tr:hover td,
  :global([data-mdb-theme='dark']) .pd-table tbody tr:hover td {
    background: #1a2638;
  }

  :global(html.dark) .pd-btn--neutral,
  :global(html.dark) .pd-btn--outline,
  :global([data-mdb-theme='dark']) .pd-btn--neutral,
  :global([data-mdb-theme='dark']) .pd-btn--outline {
    border-color: #334762;
    background: #172033;
    color: #dbe7f7;
  }

  :global(html.dark) .pd-btn--neutral:hover,
  :global(html.dark) .pd-btn--outline:hover,
  :global([data-mdb-theme='dark']) .pd-btn--neutral:hover,
  :global([data-mdb-theme='dark']) .pd-btn--outline:hover {
    border-color: #4a5f7d;
    background: #202b3d;
  }

  :global(html.dark) .purchase-qty-pill,
  :global([data-mdb-theme='dark']) .purchase-qty-pill {
    background: rgba(59, 130, 246, 0.16);
    color: #93c5fd;
  }

  @media (max-width: 992px) {
    .purchase-detail-summary--solo {
      max-width: none;
    }
  }

  @media (max-width: 768px) {
    .purchase-detail-page {
      padding-block: 16px;
    }

    .purchase-detail-page__inner {
      padding-inline: 16px;
      gap: 16px;
    }

    .pd-header-card__top {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }

    .pd-header-card__actions {
      justify-content: stretch;
    }

    .pd-header-card__actions .pd-btn {
      flex: 1 1 auto;
      justify-content: center;
    }
  }
</style>
