<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount } from 'svelte';

  import { auth } from '../../auth/authStore';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: permissions = $auth.permissions;
  $: enable_a4_default_print_mode =
    $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;

  import AccountModal from '../accounts/AccountModal.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { confirmModal } from '../../components/common/confirmModal.js';

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';  import { calculateRemainingAndBenefit,calculateDiscountAmount } from './SalesHelper.js';
  import JournalA4ReceiptModal from '../journals/JournalA4ReceiptModal.svelte';
import { saleApi } from '../../api/saleApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { journalApi } from '../../api/journalApi.js';
import { currencyApi } from '../../api/currencyApi.js';
import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';
  let showReceipt = false;
  let showA4Receipt = false;
  let selectedJournal = null;

  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  let currencies = [];
  let defaultCurrency = 'AFN';

  let currency = defaultCurrency;

  let sale = null;
  let products = [];
  let units = [];
  let returns = [];
  let returnsWithItems = [];
  let totalReturnAmount = 0;

  let paymentType = 'Receive'; // or "credit"

  export let saleId;
  export let benefit = null;
  let isDeletedSale = false;

  let payments = [];
  let amount = '';
  let description = '';
  let totalPayments = 0;

  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;
  let pickerAccountsLoaded = false;

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  function getAccountName(id, payment = null) {
    const acc =
      accounts.find(
        (a) =>
          Number(a.id ?? a.local_id) === Number(id),
      ) || {};
    let out = '';
    const name = acc.name || payment?.account_name || '';
    const nameFa = acc.name_fa || payment?.account_name_fa || '';
    const namePs = acc.name_ps || payment?.account_name_ps || '';
    if (t('Lang') === 'en') out = name;
    if (t('Lang') === 'fa') out = nameFa || name;
    if (t('Lang') === 'ps') out = namePs || name;
    const code = acc.code || payment?.account_code || '';
    if (
      !out &&
      (code === 'TREASURY' || Number(id) === Number(treasury_ID))
    ) {
      out = t('Treasury');
    }
    return out || t('Unknown');
  }

  function asAccountList(value) {
    return Array.isArray(value) ? value : [];
  }

  function mergeAccounts(rows = []) {
    const byId = new Map(
      accounts.map((account) => [
        Number(account.id ?? account.local_id),
        account,
      ]),
    );
    for (const row of rows) {
      const rowId = row?.id ?? row?.local_id;
      if (rowId == null || rowId === '') continue;
      byId.set(Number(rowId), row);
    }
    accounts = [...byId.values()].filter(
      (a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'].includes(a.code),
    );
  }

  async function ensurePickerAccounts() {
    if (pickerAccountsLoaded) return;
    const [accountsResponse, typesResponse] = await Promise.all([
      accountApi.getAll({ status: 1 }),
      accountTypeApi.getAll({ status: 1 }),
    ]);
    mergeAccounts(accountsResponse?.data || []);
    allAccountTypes = typesResponse?.data || [];
    filteredSecondAccounts = accounts;
    pickerAccountsLoaded = true;
  }

  let modalRef;
  async function load() {
    const [
      saleResponse,
      currencyResponse,
      unitResponse,
      treasuryResponse,
      notrackResponse,
    ] = await Promise.all([
      saleApi.getById(Number(saleId)),
      currencyApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
      accountApi.getAll({ status: 1, code: 'TREASURY' }),
      accountApi.getAll({ status: 1, code: 'NOTRACK' }),
    ]);

    sale = saleResponse?.data;
    isDeletedSale =
      Number(sale?.status) === 0 ||
      (
        (sale?.items || []).length > 0 &&
        (sale.items || []).every((item) => Number(item.status) === 0)
      );
    payments = (sale?.payments || []).filter(
      (p) => isDeletedSale || Number(p.status) === 1,
    );
    currencies = currencyResponse?.data || [];
    units = unitResponse?.data || [];

    const seedAccounts = [
      ...asAccountList(treasuryResponse?.data),
      ...asAccountList(notrackResponse?.data),
    ];
    const treasuryAccount = seedAccounts.find((a) => a.code === 'TREASURY');
    treasury_ID = treasuryAccount?.id ?? treasuryAccount?.local_id ?? 0;
    notrack_ID = seedAccounts.find((a) => a.code === 'NOTRACK')?.id
      ?? seedAccounts.find((a) => a.code === 'NOTRACK')?.local_id
      ?? 0;
    if (treasury_ID) second_entry_account = treasury_ID;

    const paymentAccountIds = [
      ...new Set(
        payments
          .map((payment) => Number(payment.account_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
    const missingPaymentAccounts = paymentAccountIds.filter(
      (id) =>
        !seedAccounts.some(
          (account) => Number(account.id ?? account.local_id) === id,
        ),
    );
    const paymentAccounts = await Promise.all(
      missingPaymentAccounts.map((id) =>
        accountApi.getById(id).then((res) => res?.data).catch(() => null),
      ),
    );
    mergeAccounts([...seedAccounts, ...paymentAccounts.filter(Boolean)]);

    returns = (sale?.returns || []).filter(
      (r) => isDeletedSale || Number(r.status) === 1,
    );
    totalReturnAmount = 0;
    returns.forEach((ret) => {
      totalReturnAmount += Number(ret.total_amount);
    });

    const returnProductIds = returns.flatMap((ret) =>
      (ret.items || [])
        .filter((item) => isDeletedSale || Number(item.status) === 1)
        .map((item) => item.product_id),
    );
    products = await fetchProductsByIds(returnProductIds);

    returnsWithItems = returns.map((r) => ({
      ...r,
      returns: (r.items || []).filter((ri) => isDeletedSale || Number(ri.status) === 1),
    }));

    currency = sale?.currency || defaultCurrency;
    totalPayments = payments.reduce((sum, p) => {
      if (p.currency === currency) {
        return sum + Number(p.amount);
      }
      return sum;
    }, 0);

    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  }

  async function deletePayment(id) {
    const ok = await confirmModal({
      title: t('Are you sure?'),
      message: t("You won't be able to revert this!"),
      confirmText: t('Delete'),
      cancelText: t('Cancel'),
      variant: 'danger',
      icon: 'bi-trash',
    });

    if (ok) {
      await saleApi.removePayment(Number(id));
      await calculateRemainingAndBenefit(Number(saleId));
      load();
      toast.success(t('Deleted!'), t('Payment has been deleted.'));
    }
  }

  async function deleteReturn(id) {
    const ok = await confirmModal({
      title: t('Are you sure?'),
      message: t("You won't be able to revert this!"),
      confirmText: t('Delete'),
      cancelText: t('Cancel'),
      variant: 'danger',
      icon: 'bi-trash',
    });

    if (ok) {
      await saleApi.removeReturn(Number(id));
      await calculateRemainingAndBenefit(Number(saleId));
      load();
      toast.success(t('Deleted!'), t('Return has been deleted.'));
    }
  }

  async function addPayment() {
    if (!amount) return;

    const paymentResponse = await saleApi.addPayment(Number(saleId), {
      account_id: second_entry_account,
      amount: paymentType == 'Receive' ? Number(amount) : Number(amount) * -1,
      currency: currency,
      payment_date: new Date().toISOString(),
      description: description,
      status: 1,
    });

    const paymentID = paymentResponse?.data?.id;

    const paymentJournals =
      (await journalApi.getAll({
        status: 1,
        reference_type: 'sale_payment',
        reference_id: paymentID,
      }))?.data || [];

    selectedJournal =
      paymentJournals.find(
        (journal) =>
          Number(journal.first_entry_account) === Number(sale?.account_id),
      ) || null;
    if (enable_a4_default_print_mode) {
      showA4Receipt = true;
      showReceipt = false;
    } else {
      showReceipt = true;
      showA4Receipt = false;
    }
    amount = '';
    
    await calculateRemainingAndBenefit(Number(saleId));
    load();
  }

  onMount(load);

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }
  let totalBenefitAmount = {};
  let activeLedgerTab = 'payments';
  let showAddPaymentForm = false;

  function formatAmount(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  $: salePayable = Number(sale?.total_amount || 0);
  $: saleRemaining = Number(sale?.remaining || 0);

  function isOverdue(saleRecord) {
    if (saleRemaining <= 0 || !saleRecord?.due_date) return false;
    const due = new Date(saleRecord.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due < today;
  }

  $: hasBenefitView = permissions?.some((p) => p.code === 'Benefit' && p.view);

  $: summaryFourthCard = (() => {
    if (hasBenefitView && saleRemaining <= 0) {
      const totalBenefit = benefit != null ? Number(benefit) : Number(sale?.benefit || 0);
      return {
        label: `${t('Total')} ${t('Benefit')}`,
        amount: totalBenefit,
        tone: totalBenefit >= 0 ? 'credit' : 'overdue',
        icon: 'graph-up-arrow',
      };
    }
    if (saleRemaining > 0) {
      return {
        label: t('Remaining'),
        amount: saleRemaining,
        tone: isOverdue(sale) ? 'overdue' : 'unpaid',
        icon: isOverdue(sale) ? 'exclamation-triangle' : 'clock',
      };
    }
    return {
      label: t('Remaining'),
      amount: 0,
      tone: 'settled',
      icon: 'check-circle',
    };
  })();

  async function toggleAddPaymentForm() {
    showAddPaymentForm = !showAddPaymentForm;
    if (showAddPaymentForm) {
      await ensurePickerAccounts();
    }
  }
</script>

<div class="purchase-payment-section">
  <div class="purchase-detail-summary">
    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--total">
        <i class="bi bi-receipt"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Payable')}</span>
        <span class="purchase-summary-card__value">
          <span dir="ltr">{formatAmount(salePayable)}</span>
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--paid">
        <i class="bi bi-cash-coin"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Total Payments')}</span>
        <span class="purchase-summary-card__value">
          <span dir="ltr">{formatAmount(totalPayments)}</span>
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--returns">
        <i class="bi bi-arrow-return-left"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{t('Total Returns Amount')}</span>
        <span class="purchase-summary-card__value">
          <span dir="ltr">{formatAmount(totalReturnAmount)}</span>
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>

    <div class="purchase-summary-card purchase-summary-card--remaining purchase-summary-card--{summaryFourthCard.tone}">
      <div class="purchase-summary-card__icon purchase-summary-card__icon--{summaryFourthCard.tone}">
        <i class="bi bi-{summaryFourthCard.icon}"></i>
      </div>
      <div class="purchase-summary-card__body">
        <span class="purchase-summary-card__label">{summaryFourthCard.label}</span>
        <span class="purchase-summary-card__value purchase-summary-card__value--{summaryFourthCard.tone}">
          <span dir="ltr">{formatAmount(summaryFourthCard.amount)}</span>
          <small>{t(sale?.currency)}</small>
        </span>
      </div>
    </div>
  </div>

  {#if Number(calculateDiscountAmount(sale) || 0) > 0 || Number(sale?.expense_amount || 0) > 0}
    <div class="sale-payment-meta">
      {#if Number(calculateDiscountAmount(sale) || 0) > 0}
        <span>{t('Discount')}: <strong dir="ltr">{formatAmount(calculateDiscountAmount(sale))} {t(sale?.currency)}</strong></span>
      {/if}
      {#if Number(sale?.expense_amount || 0) > 0}
        <span>{t('Expenses')}: <strong dir="ltr">{formatAmount(sale?.expense_amount)} {t(sale?.currency)}</strong></span>
      {/if}
    </div>
  {/if}

  <slot />

  <section class="pd-ledger-card">
    <div class="pd-ledger-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="pd-ledger-tab"
        class:pd-ledger-tab--active={activeLedgerTab === 'payments'}
        on:click={() => (activeLedgerTab = 'payments')}>
        <i class="bi bi-credit-card"></i>
        {t('Payments')}
        {#if payments.length > 0}
          <span class="pd-ledger-tab__count">{payments.length}</span>
        {/if}
      </button>
      <button
        type="button"
        role="tab"
        class="pd-ledger-tab"
        class:pd-ledger-tab--active={activeLedgerTab === 'returns'}
        on:click={() => (activeLedgerTab = 'returns')}>
        <i class="bi bi-arrow-return-left"></i>
        {t('Returns')}
        {#if returnsWithItems.length > 0}
          <span class="pd-ledger-tab__count">{returnsWithItems.length}</span>
        {/if}
      </button>
    </div>

    {#if activeLedgerTab === 'payments'}
        <div class="pd-ledger-panel hide-for-pdf" role="tabpanel">
        {#if !isDeletedSale}
        <div class="pd-ledger-panel__toolbar">
          <button type="button" class="pd-btn pd-btn--primary pd-btn--sm" on:click={toggleAddPaymentForm}>
            <i class="bi bi-{showAddPaymentForm ? 'x-lg' : 'plus-lg'}"></i>
            {showAddPaymentForm ? t('Close') : t('Add Payment')}
          </button>
        </div>
        {/if}

        {#if showAddPaymentForm}
          <div class="sale-add-payment__body">
            <div class="input-group input-group-sm my-3">
              <button
                class="btn btn-sm pt-1 btn-outline-{paymentType === 'Payment' ? 'danger' : 'primary'}"
                type="button"
                on:click={() => (paymentType = paymentType === 'Payment' ? 'Receive' : 'Payment')}>
                {@html paymentType === 'Payment'
                  ? "<i class='bi bi-arrow-up-left-circle'></i>"
                  : "<i class='bi bi-arrow-down-right-circle'></i>"}
                {t(paymentType)}
              </button>
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                <input type="number" id="amount" class="form-control form-control-sm" bind:value={amount} />
                <label class="form-label" for="amount">{t('Amount')}</label>
              </div>
              <button
                id="showCurrencyDropdown"
                class="btn btn-secondary btn-sm dropdown-toggle pt-2"
                type="button"
                data-mdb-toggle="dropdown"
                aria-expanded="false">
                {currency ? t(currency) : t(defaultCurrency)}
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                {#each currencies as cur}
                  <li>
                    <button class="dropdown-item" on:click={() => (currency = cur.code)} type="button">
                      {t(cur.code)}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="input-group input-group-sm justify-content-end mt-3">
              <input type="text" class="form-control" bind:value={description} placeholder={t('Description')} />
              <button
                id="second_entry_account_search"
                class="btn btn-sm py-2 text-center btn-{second_entry_account == track_ID ? 'danger' : 'light'}"
                type="button"
                on:click={() => {
                  filteredSecondAccounts = accounts;
                  showTrackModal = true;
                }}><i class="bi bi-check-circle"></i>
                {#if second_entry_account == track_ID}
                  {getAccountName(track_ID)}
                {:else}
                  {t('Track')}
                {/if}
              </button>
              <button
                id="second_entry_account_treasury"
                class="btn btn-sm py-2 text-center btn-{second_entry_account == treasury_ID ? 'success' : 'light'}"
                type="button"
                on:click={() => {
                  second_entry_account = treasury_ID;
                }}><i class="bi bi-box"></i> {t('Treasury')}</button>
            </div>

            <button class="btn btn-success btn-sm w-100 my-3" on:click={addPayment}>
              <i class="bi bi-plus-circle me-2"></i>{t('Add Payment')}
            </button>
          </div>
        {/if}

        {#if payments.length === 0}
          <div class="pd-ledger-empty">
            <i class="bi bi-credit-card"></i>
            <p>{t('No payments recorded.')}</p>
          </div>
        {:else}
          <div class="pd-card__scroll">
            <table class="pd-table pd-table--payments">
              <colgroup>
                <col class="pd-table__col-date" />
                <col class="pd-table__col-desc" />
                <col class="pd-table__col-num" />
                <col class="pd-table__col-account" />
                <col class="pd-table__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th class="pd-table__col-date">{t('Date')}</th>
                  <th class="pd-table__col-desc">{t('Description')}</th>
                  <th class="pd-table__col-num">{t('Amount')}</th>
                  <th class="pd-table__col-account">{t('To Account')}</th>
                  <th class="pd-table__col-actions">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {#each payments as p}
                  <tr>
                    <td class="pd-table__col-date">{p.payment_date.slice(0, 10)}</td>
                    <td class="pd-table__col-desc">{p.description || '—'}</td>
                    <td class="pd-table__amount pd-table__col-num">
                      <span class="pd-table__num">
                        <span dir="ltr">{formatAmount(p.amount)}</span>
                        <span class="pd-table__currency">{t(p.currency)}</span>
                      </span>
                    </td>
                    <td class="pd-table__col-account">{getAccountName(p.account_id, p)}</td>
                    <td class="pd-table__col-actions">
                      {#if !isDeletedSale}
                      <button type="button" class="pd-btn pd-btn--danger-outline pd-btn--sm" on:click={() => deletePayment(p.id)}>
                        <i class="bi bi-trash"></i>
                        {t('Delete')}
                      </button>
                      {/if}
                      <button
                        type="button"
                        class="pd-btn pd-btn--outline pd-btn--sm"
                        on:click={async () => {
                          const paymentJournals =
                            (await journalApi.getAll({
                              status: 1,
                              reference_type: 'sale_payment',
                              reference_id: p.id,
                            }))?.data || [];
                          selectedJournal =
                            paymentJournals.find(
                              (journal) =>
                                Number(journal.first_entry_account) === Number(sale?.account_id),
                            ) || null;
                          if (enable_a4_default_print_mode) {
                            showA4Receipt = true;
                            showReceipt = false;
                          } else {
                            showReceipt = true;
                            showA4Receipt = false;
                          }
                        }}>
                        <i class="bi bi-printer"></i>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {:else}
      <div class="pd-ledger-panel" role="tabpanel">
        {#if returnsWithItems.length === 0}
          <div class="pd-ledger-empty">
            <i class="bi bi-arrow-return-left"></i>
            <p>{t('No returns found.')}</p>
          </div>
        {:else}
          <div class="purchase-returns-list">
            {#each returnsWithItems as ret}
              <article class="purchase-return-block">
                <div class="purchase-return-block__head">
                  <div class="purchase-return-block__info">
                    <div class="purchase-return-block__id">
                      <span class="purchase-return-block__id-label">{t('Return Number')}</span>
                      <span class="purchase-return-block__id-value" dir="ltr">{ret.return_number}</span>
                    </div>
                    <span class="purchase-return-block__date">{t('Return Date')}: {ret.return_date}</span>
                    {#if ret.description}
                      <p class="purchase-return-block__desc">{ret.description}</p>
                    {/if}
                  </div>
                  {#if !isDeletedSale}
                  <button type="button" class="pd-btn pd-btn--danger-outline pd-btn--sm" on:click={() => deleteReturn(ret.id)}>
                    <i class="bi bi-trash"></i>
                    {t('Delete')}
                  </button>
                  {/if}
                </div>
                <div class="pd-card__scroll">
                  <table class="pd-table pd-table--nested">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th>{t('Return Qty')}</th>
                        <th class="pd-table__col-num">{t('Return Price')}</th>
                        <th class="pd-table__col-num">{t('Subtotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each ret.returns as item}
                        <tr>
                          <td class="pd-table__product">{products.find((p) => p.id === item.product_id)?.name || '—'}</td>
                          <td>
                            <span class="pd-table__num">
                              <span dir="ltr">{item.quantity}</span>
                              <span class="pd-table__currency">{units.find((u) => u.id === item.product_unit_id)?.name || ''}</span>
                            </span>
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num">
                              <span dir="ltr">{formatAmount(item.unit_price)}</span>
                              <span class="pd-table__currency">{t(currency)}</span>
                            </span>
                          </td>
                          <td class="pd-table__amount pd-table__col-num">
                            <span class="pd-table__num">
                              <span dir="ltr">{formatAmount(item.subtotal)}</span>
                              <span class="pd-table__currency">{t(currency)}</span>
                            </span>
                          </td>
                        </tr>
                      {/each}
                      <tr class="pd-table__total-row">
                        <td colspan="3">{t('Total')}</td>
                        <td class="pd-table__amount pd-table__col-num">
                          <span class="pd-table__num">
                            <span dir="ltr">{formatAmount(ret.total_amount)}</span>
                            <span class="pd-table__currency">{t(currency)}</span>
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>
</div>

{#if showTrackModal}
  <div class="modal-backdrop fade show"></div>
  <div class="modal fade show d-block" id="trackModal" tabindex="-1" aria-labelledby="trackModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="trackModalLabel">
            <i class="bi bi-check-circle"></i>
            {t('Track')}
          </h5>
          <button type="button" class="btn-close" aria-label="Close" on:click={() => (showTrackModal = false)}></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="input-group">
              <input
                type="text"
                class="form-control"
                placeholder={t('Search accounts...')}
                bind:value={second_entry_account_search}
                on:input={() => {
                  filteredSecondAccounts = accounts.filter((acc) => {
                    const name =
                      t('Lang') === 'en'
                        ? acc.name
                        : t('Lang') === 'fa'
                          ? acc.name_fa
                          : t('Lang') === 'ps'
                            ? acc.name_ps
                            : acc.name;
                    return name && name.toLowerCase().includes(second_entry_account_search.toLowerCase());
                  });
                }} />
              <button class="btn btn-outline-primary" on:click={() => modalRef?.openModal()}>
                <i class="bi bi-plus-circle"></i>
              </button>
            </div>
            <div class="mt-3" style="max-height:300px;overflow:auto;">
              {#each filteredSecondAccounts as acc}
                <div class="list-group mt-1">
                  <button
                    type="button"
                    class="list-group-item list-group-item-action"
                    on:click={() => {
                      second_entry_account = acc.id;
                      track_ID = acc.id;
                      showTrackModal = false;
                    }}>
                    {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                    {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                    {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                    <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                      {#if allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                        {t('Lang') === 'en'
                          ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name
                          : t('Lang') === 'fa'
                            ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                            : t('Lang') === 'ps'
                              ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                              : allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                      {:else}
                        N/A
                      {/if}
                    </span>
                  </button>
                </div>
              {/each}
              {#if filteredSecondAccounts.length === 0}
                <div class="text-center text-muted mt-3">{t('No accounts found')}</div>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showTrackModal = false)}>
            <i class="bi bi-x-lg"></i>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<AccountModal
  bind:this={modalRef}
  accountTypes={allAccountTypes}
  on:saved={async (e) => {
    pickerAccountsLoaded = false;
    await ensurePickerAccounts();
    second_entry_account = e.detail.account.id;
    track_ID = e.detail.account.id;
    showTrackModal = false;
  }} />

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} saleData={{
    currency: sale?.currency,
    total:(Number(sale?.total_amount || 0) + Number(sale?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: sale?.discount_amount ? Number(sale?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: sale?.expense_amount ? Number(sale?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(sale?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(sale?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }} on:close={() => (showReceipt = false)} />
{/if}


{#if showA4Receipt}
  <JournalA4ReceiptModal journal={selectedJournal} saleData={{
    currency: sale?.currency,
    total:(Number(sale?.total_amount || 0) + Number(sale?.discount_amount || 0)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    discount: sale?.discount_amount ? Number(sale?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }): 0,
    expenses: sale?.expense_amount ? Number(sale?.expense_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) : 0,
    payable: Number(sale?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalPayments: totalPayments.toLocaleString(undefined, { maximumFractionDigits: 3 }),
    totalReturns: Number(totalReturnAmount).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    remaining: (Number(sale?.total_amount || 0) - Number(totalPayments) - Number(totalReturnAmount)).toLocaleString(undefined, { maximumFractionDigits: 3 }),
  }}
    on:close={() => (showA4Receipt = false)}
    on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
{/if}

<style>
  .purchase-payment-section {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .purchase-detail-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    align-items: stretch;
  }

  .purchase-summary-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    min-height: 68px;
  }

  .purchase-summary-card--remaining.purchase-summary-card--unpaid {
    border-color: #fde68a;
  }

  .purchase-summary-card--remaining.purchase-summary-card--overdue {
    border-color: #fca5a5;
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

  .purchase-summary-card__icon--paid {
    background: #f0fdf4;
    color: #10b981;
  }

  .purchase-summary-card__icon--returns {
    background: #fffbeb;
    color: #f59e0b;
  }

  .purchase-summary-card__icon--unpaid {
    background: #fffbeb;
    color: #f59e0b;
  }

  .purchase-summary-card__icon--overdue {
    background: #fef2f2;
    color: #ef4444;
  }

  .purchase-summary-card__icon--credit,
  .purchase-summary-card__icon--settled {
    background: #f0fdf4;
    color: #10b981;
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

  .purchase-summary-card__value--unpaid {
    font-size: 1.125rem;
    font-weight: 800;
    color: #b45309;
  }

  .purchase-summary-card__value--overdue {
    font-size: 1.125rem;
    font-weight: 800;
    color: #ef4444;
  }

  .purchase-summary-card__value--settled {
    color: #0f172a;
  }

  .purchase-summary-card__value--credit {
    color: #059669;
  }

  .sale-payment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    padding: 12px 16px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-size: 13px;
    color: #64748b;
  }

  .sale-add-payment__body {
    padding: 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .pd-ledger-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .pd-ledger-tabs {
    display: flex;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .pd-ledger-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: center;
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border-block-end: 2px solid transparent;
    margin-block-end: -1px;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .pd-ledger-tab:hover {
    color: #0f172a;
    background: #ffffff;
  }

  .pd-ledger-tab--active {
    color: #0f6efd;
    background: #ffffff;
    border-block-end-color: #0f6efd;
  }

  .pd-ledger-tab__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding-inline: 6px;
    border-radius: 999px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 11px;
    font-weight: 700;
  }

  .pd-ledger-panel {
    min-height: 0;
  }

  .pd-ledger-panel__toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px;
    border-bottom: 1px solid #f1f5f9;
  }

  .pd-ledger-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px 16px;
    text-align: center;
    color: #64748b;
  }

  .pd-ledger-empty i {
    font-size: 1.25rem;
    color: #cbd5e1;
  }

  .pd-ledger-empty p {
    margin: 0;
    font-size: 14px;
  }

  .pd-card__scroll {
    overflow-x: auto;
  }

  .pd-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .pd-table--payments col.pd-table__col-date {
    width: 14%;
  }

  .pd-table--payments col.pd-table__col-desc {
    width: 28%;
  }

  .pd-table--payments col.pd-table__col-num {
    width: 18%;
  }

  .pd-table--payments col.pd-table__col-account {
    width: 22%;
  }

  .pd-table--payments col.pd-table__col-actions {
    width: 18%;
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

  .pd-table th.pd-table__col-date,
  .pd-table td.pd-table__col-date,
  .pd-table th.pd-table__col-num,
  .pd-table td.pd-table__col-num,
  .pd-table th.pd-table__col-actions,
  .pd-table td.pd-table__col-actions,
  .pd-table th.pd-table__col-desc,
  .pd-table td.pd-table__col-desc,
  .pd-table th.pd-table__col-account,
  .pd-table td.pd-table__col-account {
    text-align: start;
  }

  .pd-table td.pd-table__col-actions {
    white-space: nowrap;
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

  .pd-table--nested td,
  .pd-table--nested th {
    padding: 10px 14px;
    font-size: 13px;
  }

  .pd-table__amount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .pd-table__product {
    font-weight: 600;
    color: #0f172a;
  }

  .pd-table__currency {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .pd-table__total-row td {
    background: #f8fafc;
    font-weight: 700;
    border-block-start: 1px solid #e2e8f0;
  }

  .pd-table__total-row td:first-child {
    text-align: end;
  }

  .purchase-returns-list {
    padding: 8px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .purchase-return-block {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }

  .purchase-return-block__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .purchase-return-block__info {
    min-width: 0;
    flex: 1;
  }

  .purchase-return-block__id {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    min-width: 0;
  }

  .purchase-return-block__id-label {
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
    flex-shrink: 0;
  }

  .purchase-return-block__id-value {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    font-family: ui-monospace, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .purchase-return-block__date {
    display: block;
    font-size: 12px;
    color: #64748b;
  }

  .purchase-return-block__desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: #475569;
  }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 13px;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pd-btn--sm {
    padding: 6px 10px;
    font-size: 12px;
  }

  .pd-btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .pd-btn--primary:hover {
    background: #1d4ed8;
  }

  .pd-btn--outline {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--outline:hover {
    background: #f8fafc;
  }

  .pd-btn--danger-outline {
    background: #ffffff;
    color: #ef4444;
    border-color: #ef4444;
  }

  .pd-btn--danger-outline:hover {
    background: #fef2f2;
  }

  @media (max-width: 992px) {
    .purchase-detail-summary {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 576px) {
    .purchase-detail-summary {
      grid-template-columns: 1fr;
    }

    .pd-ledger-tab {
      padding: 10px 12px;
      font-size: 12px;
    }
  }
</style>
