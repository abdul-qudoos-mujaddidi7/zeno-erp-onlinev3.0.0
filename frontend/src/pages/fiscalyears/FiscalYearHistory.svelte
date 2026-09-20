<script>
  /*
   * Fiscal-year HISTORY (Step 5).
   *
   * One modal, scoped to ONE fiscal year, that exposes everything the brief
   * asks for under "Fiscal Years -> selected year":
   *
   *   Summary | Sales | Purchases | Journals | Payments | Opening balances |
   *   Account statement
   *
   * Every list is filtered by the selected year's [start_date, end_date], which
   * is the whole of "archiving" in this application: a closed year's documents
   * are not deleted, not soft-deleted and not moved — they simply fall outside
   * the current fiscal year's range on the operational screens, and stay
   * visible here. Historical rows are strictly read-only in this view: there is
   * no edit, no delete and no posting action anywhere in the component.
   */

  import { createEventDispatcher, onMount } from 'svelte';

  import AppModal from '../../components/common/AppModal.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';

  import { fiscalYearApi } from '../../api/fiscalYearApi.js';
  import { saleApi } from '../../api/saleApi.js';
  import { purchaseApi } from '../../api/purchaseApi.js';
  import { journalApi } from '../../api/journalApi.js';
  import { salePaymentApi } from '../../api/salePaymentApi.js';
  import { purchasePaymentApi } from '../../api/purchasePaymentApi.js';
  import { accountApi } from '../../api/accountApi.js';

  import { t } from '../../i18n/i18n';
  import { showDate } from '../../calendar.js';

  export let year = null;

  const dispatch = createEventDispatcher();

  const PAGE_LIMIT = 50;

  const TABS = [
    { key: 'summary', label: 'Summary', icon: 'bi-bar-chart' },
    { key: 'sales', label: 'Sales', icon: 'bi-receipt' },
    { key: 'purchases', label: 'Purchases', icon: 'bi-bag-check' },
    { key: 'journals', label: 'Journals', icon: 'bi-journal-text' },
    { key: 'payments', label: 'Payments', icon: 'bi-credit-card' },
    { key: 'openings', label: 'Opening balances', icon: 'bi-box-arrow-in-right' },
    { key: 'accounts', label: 'Account statement', icon: 'bi-list-columns-reverse' },
  ];

  let activeTab = 'summary';
  let loading = false;
  let error = '';

  let summary = null;
  let openings = null;

  let sales = { rows: [], total: 0 };
  let purchases = { rows: [], total: 0 };
  let journals = { rows: [], total: 0 };
  let payments = { sale: [], purchase: [] };

  /* account statement */
  let accountQuery = '';
  let accountOptions = [];
  let accountLoading = false;
  let statementAccount = null;
  let statementCurrency = '';
  let statement = null;
  let statementLoading = false;

  const number = (value) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const money = (map) => {
    if (!map || typeof map !== 'object') return number(map || 0);

    const parts = Object.entries(map)
      .filter(([, amount]) => Number(amount) !== 0)
      .map(([currency, amount]) => `${number(amount)} ${currency || t('unspecified currency')}`);

    return parts.join(' · ') || number(0);
  };

  const isClosed = () =>
    String(year?.fiscal_status || 'open').toLowerCase() === 'closed';

  const range = () =>
    year?.start_date && year?.end_date
      ? { from: year.start_date, to: year.end_date }
      : null;

  const total = (payload) =>
    Number(payload?.meta?.total ?? payload?.rows?.length ?? 0);

  async function loadTab(tab = activeTab) {
    if (!year) return;

    const bounds = range();

    if (!bounds) {
      error = t('This fiscal year has no valid date range.');

      return;
    }

    loading = true;
    error = '';

    try {
      if (tab === 'summary') {
        const response = await fiscalYearApi.getSummary(year.id);

        summary = response?.data || null;
      } else if (tab === 'openings') {
        const response = await fiscalYearApi.getOpeningBalances(year.id, {
          generated: 1,
          include_inactive: 1,
        });

        openings = response?.data || null;
      } else if (tab === 'sales') {
        const response = await saleApi.getAll({
          status: 1,
          date_from: bounds.from,
          date_to: bounds.to,
          limit: PAGE_LIMIT,
          sort_by: 'invoice_date',
          sort_dir: 'desc',
        });

        sales = {
          rows: response?.data || [],
          total: total({ meta: response?.meta }),
        };
      } else if (tab === 'purchases') {
        const response = await purchaseApi.getAll({
          status: 1,
          date_from: bounds.from,
          date_to: bounds.to,
          limit: PAGE_LIMIT,
          sort_by: 'bill_date',
          sort_dir: 'desc',
        });

        purchases = {
          rows: response?.data || [],
          total: total({ meta: response?.meta }),
        };
      } else if (tab === 'journals') {
        const response = await journalApi.getAll({
          status: 1,
          date_from: bounds.from,
          date_to: bounds.to,
          limit: PAGE_LIMIT,
          include_summary: 1,
        });

        journals = {
          rows: response?.data || [],
          total: total({ meta: response?.meta }),
        };
      } else if (tab === 'payments') {
        const [salePayments, purchasePayments] = await Promise.all([
          salePaymentApi.getAll({
            status: 1,
            date_from: bounds.from,
            date_to: bounds.to,
          }),
          purchasePaymentApi.getAll({
            status: 1,
            date_from: bounds.from,
            date_to: bounds.to,
          }),
        ]);

        payments = {
          sale: salePayments?.data || [],
          purchase: purchasePayments?.data || [],
        };
      }
    } catch (cause) {
      error = cause.message || t('Could not load this section.');
    } finally {
      loading = false;
    }
  }

  async function selectTab(tab) {
    activeTab = tab;

    await loadTab(tab);
  }

  async function searchAccounts() {
    accountLoading = true;

    try {
      const response = await accountApi.getAll({
        status: 1,
        search: accountQuery,
        limit: 50,
      });

      accountOptions = response?.data || [];
    } catch (cause) {
      toastError(cause);
    } finally {
      accountLoading = false;
    }
  }

  function toastError(cause) {
    error = cause?.message || t('Account lookup failed.');
  }

  async function loadStatement() {
    if (!year || !statementAccount) return;

    statementLoading = true;
    error = '';

    try {
      const response = await fiscalYearApi.getAccountStatement(
        year.id,
        statementAccount,
        statementCurrency ? { currency: statementCurrency } : {},
      );

      statement = response?.data || null;
    } catch (cause) {
      error = cause.message || t('Could not load the account statement.');
    } finally {
      statementLoading = false;
    }
  }

  function openingSideLabel(side) {
    return side === 'debit' ? t('Debit') : t('Credit');
  }

  onMount(async () => {
    await loadTab('summary');

    if (year && !isClosed()) {
      /* the current year has no generated openings yet: skip the extra call */
      return;
    }

    await searchAccounts();
  });
</script>

<AppModal
  title={`${t('Fiscal year history')} — ${year?.name || ''}`}
  subtitle={`${year?.start_date || ''} → ${year?.end_date || ''}`}
  icon="bi-clock-history"
  variant="info"
  size="xl"
  on:close={() => dispatch('close')}>
  <div class="fy-history">
    <div class="fy-history__tabs" role="tablist">
      {#each TABS as tab (tab.key)}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          class="fy-history__tab"
          class:is-active={activeTab === tab.key}
          on:click={() => selectTab(tab.key)}>
          <i class={`bi ${tab.icon}`} aria-hidden="true"></i>
          <span>{t(tab.label)}</span>
        </button>
      {/each}
    </div>

    {#if isClosed()}
      <div class="fy-history__banner">
        <i class="bi bi-lock" aria-hidden="true"></i>
        <span>
          {t('This fiscal year is closed. Its documents stay fully available here and are read-only; they no longer appear in the default view of the current fiscal year.')}
        </span>
      </div>
    {/if}

    {#if error}
      <div class="fy-history__alert" role="alert">{error}</div>
    {/if}

    {#if loading}
      <EmptyState loading={true} message={t('Loading')} />
    {:else if activeTab === 'summary'}
      {#if summary}
        <div class="fy-history__cards">
          <SummaryCard label={t('Sales')} value={money(summary.categories.sales.by_currency)} icon="bi-receipt" />
          <SummaryCard label={t('Purchases')} value={money(summary.categories.purchases.by_currency)} icon="bi-bag-check" tone="purple" />
          <SummaryCard label={t('Expenses')} value={money(summary.categories.expenses.by_currency)} icon="bi-cash-stack" tone="amber" />
          <SummaryCard label={t('Customer payments')} value={money(summary.categories.customer_payments.by_currency)} icon="bi-arrow-down-circle" tone="green" />
          <SummaryCard label={t('Supplier payments')} value={money(summary.categories.supplier_payments.by_currency)} icon="bi-arrow-up-circle" tone="cyan" />
          <SummaryCard label={t('Owner investment')} value={money(summary.categories.owner_investment.by_currency)} icon="bi-person-plus" />
          <SummaryCard label={t('Owner withdrawals')} value={money(summary.categories.owner_withdrawals.by_currency)} icon="bi-person-dash" tone="amber" />
          <SummaryCard label={t('Treasury net')} value={money(summary.categories.treasury_net.by_currency)} icon="bi-safe" tone="cyan" />
        </div>

        <ul class="fy-history__notes">
          {#each summary.notes as note}
            <li>{note}</li>
          {/each}
        </ul>
      {:else}
        <EmptyState icon="bi-bar-chart" message={t('No summary available.')} />
      {/if}
    {:else if activeTab === 'openings'}
      {#if openings}
        <p class="fy-history__hint">
          {t('Opening balances are snapshots of the balance-sheet accounts as of the end of the previous fiscal year. They are not journals: the historical entries stay in the ledger, so posting an opening journal would double-count every balance.')}
        </p>

        <h4 class="fy-history__section">{t('Received from the previous year')}</h4>
        {#if openings.received.length}
          <DataTable minWidth="640px" layout="auto" ariaLabel={t('Received opening balances')}>
            <thead>
              <tr>
                <th>{t('Account')}</th>
                <th>{t('From fiscal year')}</th>
                <th>{t('Currency')}</th>
                <th>{t('Opening balance')}</th>
                <th>{t('Side')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {#each openings.received as row (row.id)}
                <tr>
                  <td>{row.account_name || row.account_code}</td>
                  <td>{row.source_fiscal_year_name || '—'}</td>
                  <td>{row.currency || t('unspecified currency')}</td>
                  <td>{number(row.opening_balance)}</td>
                  <td>{openingSideLabel(row.balance_side)}</td>
                  <td>
                    <StatusBadge tone={row.status === 1 ? 'positive' : 'neutral'}>
                      {row.status === 1 ? t('Active') : t('Deactivated')}
                    </StatusBadge>
                  </td>
                </tr>
              {/each}
            </tbody>
          </DataTable>
        {:else}
          <EmptyState icon="bi-box-arrow-in-right" message={t('This fiscal year received no opening balance.')} />
        {/if}

        {#if openings.generated.length}
          <h4 class="fy-history__section">{t('Generated for the next year')}</h4>
          <DataTable minWidth="640px" layout="auto" ariaLabel={t('Generated opening balances')}>
            <thead>
              <tr>
                <th>{t('Account')}</th>
                <th>{t('Into fiscal year')}</th>
                <th>{t('Currency')}</th>
                <th>{t('Opening balance')}</th>
                <th>{t('Side')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {#each openings.generated as row (row.id)}
                <tr>
                  <td>{row.account_name || row.account_code}</td>
                  <td>{row.fiscal_year_name || '—'}</td>
                  <td>{row.currency || t('unspecified currency')}</td>
                  <td>{number(row.opening_balance)}</td>
                  <td>{openingSideLabel(row.balance_side)}</td>
                  <td>
                    <StatusBadge tone={row.status === 1 ? 'positive' : 'neutral'}>
                      {row.status === 1 ? t('Active') : t('Deactivated')}
                    </StatusBadge>
                  </td>
                </tr>
              {/each}
            </tbody>
          </DataTable>
        {/if}

        <ul class="fy-history__notes">
          {#each openings.generated_by_currency as bucket (bucket.currency || 'none')}
            <li>
              {t('Closing balance carried forward')}:
              <strong>{number(bucket.total)} {bucket.currency || t('unspecified currency')}</strong>
              ({bucket.accounts} {t('accounts')})
            </li>
          {/each}
          <li>{t('Inventory is continuous across fiscal years: no opening stock is created and no physical quantity is reset.')}</li>
        </ul>
      {/if}
    {:else if activeTab === 'sales'}
      {#if sales.rows.length}
        <DataTable minWidth="720px" layout="auto" ariaLabel={t('Sales of this fiscal year')}>
          <thead>
            <tr>
              <th>{t('Invoice #')}</th>
              <th>{t('Date')}</th>
              <th>{t('Customer')}</th>
              <th>{t('Currency')}</th>
              <th>{t('Total')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {#each sales.rows as row (row.id)}
              <tr>
                <td>{row.invoice_number || row.local_id}</td>
                <td>{@html showDate(row.invoice_date || row.created_at)}</td>
                <td>{row.account_name || row.account_id || '—'}</td>
                <td>{row.currency || t('unspecified currency')}</td>
                <td>{number(row.total_amount)}</td>
                <td>
                  <StatusBadge tone={row.invoice_status === 'confirmed' ? 'positive' : 'neutral'}>
                    {t(row.invoice_status || 'draft')}
                  </StatusBadge>
                </td>
              </tr>
            {/each}
          </tbody>
        </DataTable>

        <p class="fy-history__hint">
          {t('Showing the most recent')} {sales.rows.length}
          {#if sales.total > sales.rows.length}/{sales.total}{/if}
          {t('documents of this fiscal year.')}
        </p>
      {:else}
        <EmptyState icon="bi-receipt" message={t('No sales in this fiscal year.')} />
      {/if}
    {:else if activeTab === 'purchases'}
      {#if purchases.rows.length}
        <DataTable minWidth="720px" layout="auto" ariaLabel={t('Purchases of this fiscal year')}>
          <thead>
            <tr>
              <th>{t('Bill #')}</th>
              <th>{t('Date')}</th>
              <th>{t('Supplier')}</th>
              <th>{t('Currency')}</th>
              <th>{t('Total')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {#each purchases.rows as row (row.id)}
              <tr>
                <td>{row.bill_number || row.local_id}</td>
                <td>{@html showDate(row.bill_date || row.created_at)}</td>
                <td>{row.account_name || row.account_id || '—'}</td>
                <td>{row.currency || t('unspecified currency')}</td>
                <td>{number(row.total_amount)}</td>
                <td>
                  <StatusBadge tone={row.bill_status === 'confirmed' ? 'positive' : 'neutral'}>
                    {t(row.bill_status || 'draft')}
                  </StatusBadge>
                </td>
              </tr>
            {/each}
          </tbody>
        </DataTable>

        <p class="fy-history__hint">
          {t('Showing the most recent')} {purchases.rows.length}
          {#if purchases.total > purchases.rows.length}/{purchases.total}{/if}
          {t('documents of this fiscal year.')}
        </p>
      {:else}
        <EmptyState icon="bi-bag-check" message={t('No purchases in this fiscal year.')} />
      {/if}
    {:else if activeTab === 'journals'}
      {#if journals.rows.length}
        <DataTable minWidth="820px" layout="auto" ariaLabel={t('Journals of this fiscal year')}>
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Description')}</th>
              <th>{t('Currency')}</th>
              <th>{t('Debit')}</th>
              <th>{t('Credit')}</th>
              <th>{t('Reference')}</th>
            </tr>
          </thead>
          <tbody>
            {#each journals.rows as row (row.id)}
              <tr>
                <td>{@html showDate(row.date || row.created_at)}</td>
                <td>{row.description || '—'}</td>
                <td>{row.currency || t('unspecified currency')}</td>
                <td>{number(Number(row.first_entry_debit || 0) + Number(row.second_entry_debit || 0))}</td>
                <td>{number(Number(row.first_entry_credit || 0) + Number(row.second_entry_credit || 0))}</td>
                <td>{row.reference_type || '—'} {row.reference_id ? `#${row.reference_id}` : ''}</td>
              </tr>
            {/each}
          </tbody>
        </DataTable>

        <p class="fy-history__hint">
          {t('Showing the most recent')} {journals.rows.length}
          {#if journals.total > journals.rows.length}/{journals.total}{/if}
          {t('documents of this fiscal year.')}
        </p>
      {:else}
        <EmptyState icon="bi-journal-text" message={t('No journals in this fiscal year.')} />
      {/if}
    {:else if activeTab === 'payments'}
      <h4 class="fy-history__section">{t('Customer payments')}</h4>
      {#if payments.sale.length}
        <DataTable minWidth="640px" layout="auto" ariaLabel={t('Customer payments')}>
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Amount')}</th>
              <th>{t('Currency')}</th>
              <th>{t('Description')}</th>
            </tr>
          </thead>
          <tbody>
            {#each payments.sale as row (row.id)}
              <tr>
                <td>{@html showDate(row.payment_date || row.created_at)}</td>
                <td>{number(row.amount)}</td>
                <td>{row.currency || t('unspecified currency')}</td>
                <td>{row.description || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </DataTable>
      {:else}
        <EmptyState icon="bi-arrow-down-circle" message={t('No customer payments in this fiscal year.')} />
      {/if}

      <h4 class="fy-history__section">{t('Supplier payments')}</h4>
      {#if payments.purchase.length}
        <DataTable minWidth="640px" layout="auto" ariaLabel={t('Supplier payments')}>
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Amount')}</th>
              <th>{t('Currency')}</th>
              <th>{t('Description')}</th>
            </tr>
          </thead>
          <tbody>
            {#each payments.purchase as row (row.id)}
              <tr>
                <td>{@html showDate(row.payment_date || row.created_at)}</td>
                <td>{number(row.amount)}</td>
                <td>{row.currency || t('unspecified currency')}</td>
                <td>{row.description || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </DataTable>
      {:else}
        <EmptyState icon="bi-arrow-up-circle" message={t('No supplier payments in this fiscal year.')} />
      {/if}
    {:else if activeTab === 'accounts'}
      <p class="fy-history__hint">
        {t('The statement of this fiscal year shows the opening balance of the year followed by the movement inside it. Journals of other fiscal years are never mixed in, so a closed year is never counted twice.')}
      </p>

      <div class="fy-history__picker">
        <input
          type="search"
          placeholder={t('Search account by name or code')}
          bind:value={accountQuery}
          on:input={searchAccounts}
        />

        <select
          aria-label={t('Account')}
          bind:value={statementAccount}
          on:change={loadStatement}
          disabled={accountLoading}>
          <option value={null}>{accountLoading ? t('Loading') : t('Select an account')}</option>
          {#each accountOptions as account (account.id)}
            <option value={account.id}>
              {account.code ? `${account.code} - ` : ''}{account.name}
            </option>
          {/each}
        </select>

        <ActionButton
          label={t('Reload')}
          icon="bi-arrow-clockwise"
          variant="icon"
          tone="view"
          compact
          loading={statementLoading}
          on:click={loadStatement}
        />
      </div>

      {#if statementLoading}
        <EmptyState loading={true} message={t('Loading')} />
      {:else if statement}
        <div class="fy-history__cards">
          {#each statement.closing_by_currency as line (line.currency || 'none')}
            <SummaryCard
              label={`${t('Closing balance')} · ${line.currency || t('unspecified currency')}`}
              value={number(line.closing_balance)}
              icon="bi-calculator"
              tone={line.closing_side === 'debit' ? 'amber' : 'green'}
            />
          {/each}
        </div>

        {#if statement.opening_rows.length}
          <h4 class="fy-history__section">{t('Opening balance')}</h4>
          <DataTable minWidth="640px" layout="auto" ariaLabel={t('Opening balance')}>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Description')}</th>
                <th>{t('Currency')}</th>
                <th>{t('Debit')}</th>
                <th>{t('Credit')}</th>
              </tr>
            </thead>
            <tbody>
              {#each statement.opening_rows as row, index (index)}
                <tr>
                  <td>{row.date}</td>
                  <td>{row.description}</td>
                  <td>{row.currency || t('unspecified currency')}</td>
                  <td>{number(row.debit)}</td>
                  <td>{number(row.credit)}</td>
                </tr>
              {/each}
            </tbody>
          </DataTable>
        {:else}
          <EmptyState
            icon="bi-box-arrow-in-right"
            message={t('This account has no opening balance in this fiscal year.')} />
        {/if}

        <h4 class="fy-history__section">
          {t('Movement inside')} {year?.name || ''}
        </h4>

        {#if statement.entries.length}
          <DataTable minWidth="760px" layout="auto" ariaLabel={t('Fiscal year movement')}>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Description')}</th>
                <th>{t('Currency')}</th>
                <th>{t('Debit')}</th>
                <th>{t('Credit')}</th>
                <th>{t('Reference')}</th>
              </tr>
            </thead>
            <tbody>
              {#each statement.entries as row (row.id)}
                <tr>
                  <td>{@html showDate(row.date || row.created_at)}</td>
                  <td>{row.description || '—'}</td>
                  <td>{row.currency || t('unspecified currency')}</td>
                  <td>
                    {number(
                      String(row.first_entry_account) === String(statement.account.id)
                        ? row.first_entry_debit
                        : row.second_entry_debit,
                    )}
                  </td>
                  <td>
                    {number(
                      String(row.first_entry_account) === String(statement.account.id)
                        ? row.first_entry_credit
                        : row.second_entry_credit,
                    )}
                  </td>
                  <td>{row.reference_type || '—'} {row.reference_id ? `#${row.reference_id}` : ''}</td>
                </tr>
              {/each}
            </tbody>
          </DataTable>
        {:else}
          <EmptyState icon="bi-inboxes" message={t('No movement for this account in this fiscal year.')} />
        {/if}

        {#each statement.lines as line (line.currency || 'none')}
          <p class="fy-history__formula">
            {line.currency || t('unspecified currency')}:
            {t('opening')} {number(line.opening_balance)}
            + {t('movement')} {number(line.movement)}
            = <strong>{number(line.closing_balance)}</strong>
          </p>
        {/each}
      {:else}
        <EmptyState icon="bi-list-columns-reverse" message={t('Select an account to see its fiscal-year statement.')} />
      {/if}
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <ActionButton label={t('Close')} variant="ghost" on:click={() => dispatch('close')} />
  </svelte:fragment>
</AppModal>

<style>
  .fy-history {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-width: 0;
  }

  .fy-history__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.35rem;
  }

  .fy-history__tab {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    background: transparent;
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
    color: #475569;
    cursor: pointer;
  }

  .fy-history__tab:hover {
    background: #f1f5f9;
  }

  .fy-history__tab.is-active {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
    font-weight: 600;
  }

  .fy-history__banner,
  .fy-history__alert {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    border-radius: 0.7rem;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
  }

  .fy-history__banner {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #334155;
  }

  .fy-history__alert {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
  }

  .fy-history__cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.6rem;
  }

  .fy-history__section {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: #0f172a;
  }

  .fy-history__hint,
  .fy-history__formula {
    margin: 0;
    font-size: 0.8rem;
    color: #64748b;
  }

  .fy-history__notes {
    margin: 0;
    padding-inline-start: 1.1rem;
    font-size: 0.8rem;
    color: #475569;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .fy-history__picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .fy-history__picker input,
  .fy-history__picker select {
    border: 1px solid #d1d5db;
    border-radius: 0.6rem;
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
    min-width: 220px;
  }
</style>
