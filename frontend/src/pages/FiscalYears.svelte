<script>
  import { onMount } from 'svelte';
  import { fiscalYearApi } from '../api/fiscalYearApi.js';
  import { toast } from '../ToastUI/toast.js';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import TableSkeleton from '../components/common/TableSkeleton.svelte';
  import PanelSkeleton from '../components/common/PanelSkeleton.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import AppModal from '../components/common/AppModal.svelte';
  import AppDatePicker from '../components/common/AppDatePicker.svelte';
  import FiscalYearHistory from './fiscalyears/FiscalYearHistory.svelte';
  import { t } from '../i18n/i18n';
  import { translateFiscalNote } from '../utils/fiscalNotes.js';
  import { showDate } from '../calendar.js';
  import {
    loadCurrentFiscalYear,
    resetCurrentFiscalYearCache,
    setCurrentFiscalYear,
  } from '../utils/currentFiscalYear.js';
  import { todayAccountingDate } from '../utils/accountingDate.js';

  const number = (value) =>
    Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  let years = [];
  let currentYear = null;
  let loading = true;
  let error = '';

  let showForm = false;
  let editingId = null;
  let saving = false;
  let formError = '';
  let form = { name: '', start_date: '', end_date: '', note: '' };

  let selectedYear = null;
  let summary = null;
  let summaryLoading = false;

  /*
   * Closing is one backend-authoritative request. This page never posts a
   * journal, never touches stock and never orchestrates the close: it shows
   * what the backend computed and sends a single POST.
   */
  let closeTarget = null;
  let closePreview = null;
  let closePreviewLoading = false;
  let closing = false;
  let closeError = '';
  let closeReadOnly = false;

  /*
   * Fiscal-year history (Step 5): one modal scoped to one year, with the
   * year's documents and its roll-forward. Read-only by design.
   */
  let historyYear = null;

  /*
   * Reopening is the inverse of a close and the only supported way to undo
   * one. It is a single backend transaction; this page only confirms and
   * reports what it did.
   */
  let reopenTarget = null;
  let reopenPreview = null;
  let reopenPreviewLoading = false;
  let reopening = false;
  let reopenError = '';

  function openHistory(year) {
    historyYear = year;
  }

  function money(map) {
    if (!map || typeof map !== 'object') return '0';

    return Object.entries(map)
      .filter(([, amount]) => Number(amount) !== 0)
      .map(([currency, amount]) => `${number(amount)} ${currency}`)
      .join(' · ') || '0';
  }

  function addDays(dateOnly, days) {
    const date = new Date(`${dateOnly}T00:00:00Z`);

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  }

  /*
   * Adds whole calendar years to a YYYY-MM-DD string, clamping a leap day to
   * the last day of the target month (2028-02-29 + 1 year = 2029-02-28) so the
   * proposal here, the close engine and MySQL's DATE_ADD all agree.
   */
  function addYears(dateOnly, years) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    const targetYear = year + years;
    const lastDayOfMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();

    return `${String(targetYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
      Math.min(day, lastDayOfMonth),
    ).padStart(2, '0')}`;
  }

  function isOpen(year) {
    return String(year?.fiscal_status || '').toLowerCase() === 'open';
  }

  function currencyText(currency) {
    return currency || t('unspecified currency');
  }

  function signedMoney(value) {
    const amount = Number(value || 0);

    return `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${number(Math.abs(amount))}`;
  }

  async function loadClosePreview(year, { readOnly }) {
    closeTarget = year;
    closeReadOnly = readOnly;
    closePreview = null;
    closeError = '';
    closePreviewLoading = true;

    try {
      const response = await fiscalYearApi.getClosePreview(year.id);
      closePreview = response?.data || null;
    } catch (cause) {
      closeError = cause.message || t('Could not load the close preview.');
    } finally {
      closePreviewLoading = false;
    }
  }

  function openClose(year) {
    return loadClosePreview(year, { readOnly: false });
  }

  function openCloseResult(year) {
    return loadClosePreview(year, { readOnly: true });
  }

  function dismissClose() {
    closeTarget = null;
    closePreview = null;
    closeError = '';
    closeReadOnly = false;
  }

  /*
   * Roll-forward summary of the close preview: which year receives the
   * balances, how many, and per currency. The close itself recomputes all of
   * this inside its own transaction, so nothing here is trusted on submit.
   */
  function rollForwardBlocked() {
    return Boolean(closePreview) && closePreview.roll_forward_ready === false;
  }

  function rollForwardBlockReason() {
    if (!closePreview) return '';

    if (closePreview.roll_forward_blocker === 'NEXT_FISCAL_YEAR_NOT_OPEN') {
      return t('The next fiscal year is closed. Reopen it before closing this year, or its opening balances cannot be written.');
    }

    if (closePreview.roll_forward_blocker === 'NEXT_FISCAL_YEAR_CONFLICT') {
      return t('The day after this fiscal year ends already falls inside another fiscal year. Adjust the fiscal-year ranges so the next year can start on that day, then close this year.');
    }

    return t('This fiscal year cannot be closed while the roll-forward is blocked.');
  }

  async function openReopen(year) {
    reopenTarget = year;
    reopenPreview = null;
    reopenError = '';
    reopenPreviewLoading = true;

    try {
      const response = await fiscalYearApi.getOpeningBalances(year.id, {
        generated: 1,
        include_inactive: 0,
      });

      reopenPreview = response?.data || null;
    } catch (cause) {
      reopenError = cause.message || t('Could not load the roll-forward of this fiscal year.');
    } finally {
      reopenPreviewLoading = false;
    }
  }

  function dismissReopen() {
    reopenTarget = null;
    reopenPreview = null;
    reopenError = '';
  }

  async function confirmReopen() {
    if (!reopenTarget || reopening) return;

    const targetId = reopenTarget.id;

    reopening = true;
    reopenError = '';

    try {
      const response = await fiscalYearApi.reopen(targetId);
      const result = response?.data || null;

      toast.success(
        t('Fiscal year reopened'),
        `${result?.closing_journals_reversed || 0} ${t('closing journal(s) reversed')}, ` +
          `${result?.opening_balances_deactivated || 0} ${t('opening balance(s) deactivated')}.`,
      );

      dismissReopen();

      /*
       * The operational screens default to the current fiscal year, so the
       * memoized lookup has to be dropped (a year may just have become the
       * current one again).
       */
      resetCurrentFiscalYearCache();

      await load();

      /*
       * Closing may have created an open successor year. Reopening must put
       * this year back into the operational screens instead of allowing the
       * automatic selector to keep Sales, Purchases, Journals and reports on
       * that successor's date range.
       */
      if (result?.fiscal_year) {
        const reopenedYear =
          years.find((year) => year.id === targetId) || result.fiscal_year;

        setCurrentFiscalYear(reopenedYear);
        currentYear = reopenedYear;
      }
    } catch (cause) {
      /* the backend rolled everything back: the year is still closed */
      reopenError = cause.message || t('Could not reopen the fiscal year.');
    } finally {
      reopening = false;
    }
  }

  async function confirmClose() {
    if (!closeTarget || closing) return;

    const targetId = closeTarget.id;

    closing = true;
    closeError = '';

    try {
      const response = await fiscalYearApi.close(targetId);
      const result = response?.data || null;
      const lines = (result?.profit_loss || [])
        .filter((entry) => Number(entry.profit_loss) !== 0)
        .map((entry) => `${signedMoney(entry.profit_loss)} ${currencyText(entry.currency)}`)
        .join(' · ');

      const rolled = Number(result?.opening_balances_created || 0);

      /*
       * The close may also have configured the successor year: that is a
       * visible outcome, not an implementation detail.
       */
      const createdNextYear = result?.next_fiscal_year_created
        ? `${t('Created fiscal year')} ${result?.next_fiscal_year?.name} (${result?.next_fiscal_year?.start_date} → ${result?.next_fiscal_year?.end_date}).`
        : '';

      const summary = [
        lines || t('No profit and loss activity in this fiscal year.'),
        rolled
          ? `${rolled} ${t('opening balance(s) carried into the next fiscal year.')}`
          : '',
        createdNextYear,
      ]
        .filter(Boolean)
        .join(' · ');

      toast.success(t('Fiscal year closed'), summary);

      dismissClose();

      /* the current fiscal year may have moved: drop the memoized lookup */
      resetCurrentFiscalYearCache();

      await load();

      if (selectedYear?.id === targetId) {
        selectedYear = years.find((year) => year.id === targetId) || selectedYear;
      }
    } catch (cause) {
      /*
       * The backend rolled the whole close back, so the year is still open
       * and the message can be shown in place.
       */
      closeError = cause.message || t('Could not close the fiscal year.');
    } finally {
      closing = false;
    }
  }

  /*
   * A new fiscal year is proposed right after the latest one using EXACTLY the
   * rule the close engine uses when it creates the successor year
   * automatically: start the day after this one ends, end one calendar year
   * later. Keeping the calendar boundaries (rather than the previous year's
   * length in days) is what keeps an April-March book April-March forever
   * instead of letting a 371-day year push every later year forward.
   */
  function proposedRange() {
    if (!years.length) {
      /* the business day, not the UTC instant (same rule as payment dates) */
      const today = todayAccountingDate();

      return { start: today, end: addYears(today, 1) };
    }

    const latest = [...years].sort((a, b) =>
      a.end_date < b.end_date ? 1 : -1,
    )[0];

    return {
      start: addDays(latest.end_date, 1),
      end: addYears(latest.end_date, 1),
    };
  }

  function proposedName(range) {
    const startYear = range.start.slice(0, 4);
    const endYear = range.end.slice(0, 4);

    return startYear === endYear ? `FY ${startYear}` : `FY ${startYear}-${endYear}`;
  }

  async function load() {
    loading = true;
    error = '';

    try {
      const response = await fiscalYearApi.getAll();
      years = response?.data || [];

      try {
        /*
         * The WORKING year (the one the operational screens are scoped to),
         * not blindly the year containing today: after an early close those two
         * differ, and labelling the closed year "Current" would contradict
         * every list screen.
         */
        currentYear = await loadCurrentFiscalYear({ force: true });
      } catch (_) {
        currentYear = null;
      }
    } catch (cause) {
      error = cause.message || t('Failed to load fiscal years');
      years = [];
    } finally {
      loading = false;
    }
  }

  async function openSummary(year) {
    selectedYear = year;
    summary = null;
    summaryLoading = true;

    try {
      const response = await fiscalYearApi.getSummary(year.id);
      summary = response?.data || null;
    } catch (cause) {
      toast.error(t('Error'), cause.message);
    } finally {
      summaryLoading = false;
    }
  }

  function openCreate() {
    const range = proposedRange();

    editingId = null;
    formError = '';
    form = {
      name: proposedName(range),
      start_date: range.start,
      end_date: range.end,
      note: '',
    };
    showForm = true;
  }

  function openEdit(year) {
    editingId = year.id;
    formError = '';
    form = {
      name: year.name || '',
      start_date: year.start_date || '',
      end_date: year.end_date || '',
      note: year.note || '',
    };
    showForm = true;
  }

  async function save() {
    formError = '';

    if (!form.start_date || !form.end_date) {
      formError = t('Start date and end date are required.');

      return;
    }

    if (form.start_date > form.end_date) {
      formError = t('Start date must be on or before the end date.');

      return;
    }

    saving = true;

    try {
      const payload = {
        name: form.name || undefined,
        start_date: form.start_date,
        end_date: form.end_date,
        note: form.note || null,
      };

      if (editingId) {
        await fiscalYearApi.update(editingId, payload);
        toast.success(t('Fiscal year updated'));
      } else {
        await fiscalYearApi.create(payload);
        toast.success(t('Fiscal year created'));
      }

      showForm = false;
      await load();

      if (selectedYear) {
        const refreshed = years.find((year) => year.id === selectedYear.id);

        if (refreshed) {
          selectedYear = refreshed;
        }
      }
    } catch (cause) {
      formError = cause.message || t('Could not save the fiscal year.');
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<IndexPageLayout
  ariaLabel={t('Fiscal years')}
  showExtra={false}
  showFooter={false}
 >
  <svelte:fragment slot="actions">
    <ActionButton
      label={t('New fiscal year')}
      icon="bi-plus-lg"
      on:click={openCreate}
    />
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <div class="fiscal-toolbar">
      {#if currentYear}
        <StatusBadge tone="positive" ghost>
          {t('Current')}: {currentYear.name}
        </StatusBadge>
      {:else}
        <StatusBadge tone="warning" ghost>
          {t('No fiscal year covers today')}
        </StatusBadge>
      {/if}
      <ActionButton
        label={t('Refresh')}
        icon="bi-arrow-clockwise"
        variant="icon"
        compact
        on:click={load}
      />
    </div>
  </svelte:fragment>

  <div class="fiscal-body">
    {#if error}
      <div class="fiscal-alert" role="alert">{error}</div>
    {/if}

    {#if loading}
      <TableSkeleton ariaLabel={t('Loading')} colCount={5} minWidth="640px" layout="auto" />
    {:else if !years.length}
      <EmptyState
        icon="bi-calendar-range"
        message={t('No fiscal years yet. Create one to start period reporting.')}>
        <ActionButton
          label={t('New fiscal year')}
          icon="bi-plus-lg"
          on:click={openCreate}
        />
      </EmptyState>
    {:else}
      <DataTable minWidth="640px" layout="auto" ariaLabel={t('Fiscal years')}>
        <thead>
          <tr>
            <th>{t('Fiscal year')}</th>
            <th>{t('Start date')}</th>
            <th>{t('End date')}</th>
            <th>{t('Status')}</th>
            <th class="fiscal-actions-col">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each years as year (year.id)}
            <tr class:selected={selectedYear?.id === year.id}>
              <td>
                <strong>{year.name}</strong>
                {#if year.note}<small class="fiscal-note">{year.note}</small>{/if}
              </td>
              <td><StatusBadge tone="neutral" ghost ltr stacked>{@html showDate(year.start_date)}</StatusBadge></td>
              <td><StatusBadge tone="neutral" ghost ltr stacked>{@html showDate(year.end_date)}</StatusBadge></td>
              <td>
                <StatusBadge tone={isOpen(year) ? 'positive' : 'neutral'}>
                  {isOpen(year) ? t('Open') : t('Closed')}
                </StatusBadge>
                {#if !isOpen(year) && year.closed_at}
                  <small class="fiscal-note">
                    {@html showDate(String(year.closed_at).slice(0, 10))}
                  </small>
                {/if}
              </td>
              <td class="fiscal-actions-col">
                <div class="fiscal-row-actions">
                  <ActionButton
                    label={t('Summary')}
                    icon="bi-bar-chart"
                    variant="icon"
                    tone="view"
                    compact
                    on:click={() => openSummary(year)}
                  />
                  <ActionButton
                    label={t('History')}
                    icon="bi-clock-history"
                    variant="icon"
                    tone="view"
                    compact
                    title={t('History: this fiscal year\'s documents, opening balances and account statements')}
                    on:click={() => openHistory(year)}
                  />
                  <ActionButton
                    label={t('Edit')}
                    icon="bi-pencil"
                    variant="icon"
                    tone="edit"
                    compact
                    disabled={!isOpen(year)}
                    title={isOpen(year) ? t('Edit') : t('A closed fiscal year cannot be edited.')}
                    on:click={() => openEdit(year)}
                  />
                  {#if isOpen(year)}
                    <ActionButton
                      label={t('Close fiscal year')}
                      icon="bi-lock"
                      variant="icon"
                      tone="danger"
                      compact
                      title={t('Close fiscal year (accounting action; it can be reopened)')}
                      on:click={() => openClose(year)}
                    />
                  {:else}
                    <ActionButton
                      label={t('Close result')}
                      icon="bi-clipboard-data"
                      variant="icon"
                      tone="muted"
                      compact
                      title={t('Show the closing result of this fiscal year')}
                      on:click={() => openCloseResult(year)}
                    />
                    <ActionButton
                      label={t('Reopen fiscal year')}
                      icon="bi-unlock"
                      variant="icon"
                      tone="edit"
                      compact
                      title={t('Reopen: reverse the closing journals and deactivate the opening balances this close generated')}
                      on:click={() => openReopen(year)}
                    />
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </DataTable>
    {/if}

    {#if selectedYear}
      <section class="fiscal-summary" aria-label={t('Fiscal year summary')}>
        <header>
          <h3>
            {t('Summary')} — {selectedYear.name}
            <span class="fiscal-range">
              {selectedYear.start_date} → {selectedYear.end_date}
            </span>
          </h3>
          <p class="fiscal-hint">
            {t('Read-time classification by accounting date. Nothing is reset; closing posts one balanced journal per currency.')}
          </p>
        </header>

        {#if summaryLoading}
          <PanelSkeleton ariaLabel={t('Loading')} lines={2} lineHeight="72px" gap="12px" />
        {:else if summary}
          <div class="fiscal-cards">
            <SummaryCard label={t('Sales')} value={money(summary.categories.sales.by_currency)} icon="bi-receipt" />
            <SummaryCard label={t('Purchases')} value={money(summary.categories.purchases.by_currency)} icon="bi-bag-check" tone="purple" />
            <SummaryCard label={t('Expenses')} value={money(summary.categories.expenses.by_currency)} icon="bi-cash-stack" tone="amber" />
            <SummaryCard label={t('Customer payments')} value={money(summary.categories.customer_payments.by_currency)} icon="bi-arrow-down-circle" tone="green" />
            <SummaryCard label={t('Supplier payments')} value={money(summary.categories.supplier_payments.by_currency)} icon="bi-arrow-up-circle" tone="cyan" />
            <SummaryCard label={t('Owner investment')} value={money(summary.categories.owner_investment.by_currency)} icon="bi-person-plus" />
            <SummaryCard label={t('Owner withdrawals')} value={money(summary.categories.owner_withdrawals.by_currency)} icon="bi-person-dash" tone="amber" />
            <SummaryCard label={t('Treasury net')} value={money(summary.categories.treasury_net.by_currency)} icon="bi-safe" tone="cyan" />
          </div>

          <ul class="fiscal-notes">
            {#each summary.notes as note}
              <li>{translateFiscalNote(note)}</li>
            {/each}
          </ul>
        {:else}
          <EmptyState icon="bi-bar-chart" message={t('No summary available.')} />
        {/if}
      </section>
    {/if}
  </div>
</IndexPageLayout>

{#if showForm}
  <AppModal
    title={editingId ? t('Edit fiscal year') : t('New fiscal year')}
    icon="bi-calendar-range"
    variant="primary"
    size="md"
    loading={saving}
    on:close={() => (showForm = false)}>
    <div class="fiscal-form">
      <label>
        <span>{t('Name')}</span>
        <input type="text" bind:value={form.name} maxlength="120" />
      </label>

      <AppDatePicker label={t('Start date')} required value={form.start_date} on:change={(event) => (form.start_date = event.detail)} />
      <AppDatePicker label={t('End date')} required value={form.end_date} on:change={(event) => (form.end_date = event.detail)} />

      <label>
        <span>{t('Note')}</span>
        <textarea rows="2" bind:value={form.note} />
      </label>

      {#if formError}
        <div class="fiscal-alert" role="alert">{formError}</div>
      {/if}

      <p class="fiscal-hint">
        {t('Fiscal years may not overlap. Editing is only possible while the year is open.')}
      </p>
    </div>

    <svelte:fragment slot="footer">
      <div class="fiscal-form-actions">
        <ActionButton label={t('Cancel')} variant="ghost" on:click={() => (showForm = false)} />
        <ActionButton
          label={editingId ? t('Save') : t('Create')}
          icon="bi-check-lg"
          loading={saving}
          on:click={save}
        />
      </div>
    </svelte:fragment>
  </AppModal>
{/if}

{#if closeTarget}
  <AppModal
    title={closeReadOnly ? t('Close result') : t('Close fiscal year')}
    icon={closeReadOnly ? 'bi-clipboard-data' : 'bi-lock'}
    variant={closeReadOnly ? 'info' : 'danger'}
    size="md"
    loading={closing}
    on:close={dismissClose}>
    <div class="fiscal-close">
      <p class="fiscal-close-range">
        <strong>{closeTarget.name}</strong>
        <span class="fiscal-range">{closeTarget.start_date} → {closeTarget.end_date}</span>
      </p>

      {#if !closeReadOnly}
        <div class="fiscal-warning" role="alert">
          {t('Closing is an accounting action. It posts one balanced closing journal per currency that moves this year\'s profit or loss into Retained Earnings, carries the remaining balance-sheet balances into the next fiscal year as opening balances, and locks the year. It can be undone with Reopen.')}
        </div>
      {/if}

      {#if closePreviewLoading}
        <PanelSkeleton ariaLabel={t('Loading')} lines={3} />
      {:else if closePreview}
        <div class="fiscal-close-meta">
          <span>
            {t('Closing journal date')}:
            <strong>{closePreview.closing_journal_date}</strong>
          </span>
          <span>
            {t('Retained earnings account')}:
            <strong>
              {closePreview.retained_account
                ? `${closePreview.retained_account.code} - ${closePreview.retained_account.name}`
                : t('will be created on close')}
            </strong>
          </span>
        </div>

        {#if !closePreview.profit_loss.length}
          <EmptyState
            icon="bi-inboxes"
            message={t('No profit and loss activity in this fiscal year. The year can be closed without creating any journal.')} />
        {:else}
          {#each closePreview.profit_loss as entry (entry.currency || 'none')}
            <section class="fiscal-close-currency">
              <header>
                <strong>{currencyText(entry.currency)}</strong>
                <StatusBadge tone={entry.result === 'loss' ? 'negative' : entry.result === 'profit' ? 'positive' : 'neutral'}>
                  {entry.result === 'loss'
                    ? `${t('Loss')} ${number(Math.abs(Number(entry.profit_loss)))}`
                    : entry.result === 'profit'
                      ? `${t('Profit')} ${number(entry.profit_loss)}`
                      : t('No result')}
                </StatusBadge>
              </header>

              {#each closePreview.currencies.filter((bucket) => (bucket.currency || null) === (entry.currency || null)) as bucket (entry.currency || 'none')}
                <DataTable minWidth="420px" layout="auto" ariaLabel={t('Closing accounts')}>
                  <thead>
                    <tr>
                      <th>{t('Account')}</th>
                      <th>{t('Net')}</th>
                      <th>{t('Closing entry')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each bucket.accounts as account (account.account_local_id)}
                      <tr>
                        <td>{account.name || account.code}</td>
                        <td>{signedMoney(account.net)}</td>
                        <td>
                          {#if account.position === 'credit'}
                            {t('Debit account / Credit Retained Earnings')}
                          {:else}
                            {t('Credit account / Debit Retained Earnings')}
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </DataTable>
              {/each}
            </section>
          {/each}

          <p class="fiscal-hint">
            {closePreview.proposed_journal_count} {t('balanced closing journal(s) will be posted, dated with the fiscal year end date.')}
          </p>
        {/if}

        {#if !closeReadOnly}
          <section class="fiscal-close-currency">
            <header>
              <strong>{t('Balance roll-forward')}</strong>
              <StatusBadge tone={closePreview.roll_forward_ready ? 'positive' : 'negative'}>
                {closePreview.roll_forward_ready ? t('Ready') : t('Blocked')}
              </StatusBadge>
            </header>

            {#if closePreview.next_fiscal_year}
              <p class="fiscal-hint">
                {t('Opening balances will be carried into')}
                <strong>{closePreview.next_fiscal_year.name}</strong>
                ({closePreview.next_fiscal_year.start_date} →
                {closePreview.next_fiscal_year.end_date}).
              </p>
            {:else if closePreview.next_fiscal_year_will_be_created}
              <p class="fiscal-hint fiscal-hint-positive">
                {t('The next fiscal year does not exist yet and will be created automatically:')}
                <strong>{closePreview.proposed_next_fiscal_year?.name}</strong>
                ({closePreview.proposed_next_fiscal_year?.start_date} →
                {closePreview.proposed_next_fiscal_year?.end_date}).
              </p>
            {:else}
              <p class="fiscal-hint">
                {t('The next fiscal year must start on')}
                <strong>{closePreview.required_next_start_date}</strong>.
              </p>
            {/if}

            {#if closePreview.proposed_opening_balance_count}
              <DataTable minWidth="520px" layout="auto" ariaLabel={t('Proposed opening balances')}>
                <thead>
                  <tr>
                    <th>{t('Account')}</th>
                    <th>{t('Currency')}</th>
                    <th>{t('Opening balance')}</th>
                    <th>{t('Side')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each closePreview.proposed_opening_balances as row, index (index)}
                    <tr>
                      <td>{row.account_name || row.account_code}</td>
                      <td>{currencyText(row.currency)}</td>
                      <td>{number(row.opening_balance)}</td>
                      <td>{row.balance_side === 'debit' ? t('Debit') : t('Credit')}</td>
                    </tr>
                  {/each}
                </tbody>
              </DataTable>

              <p class="fiscal-hint">
                {closePreview.proposed_opening_balance_count}
                {t('opening balance row(s) will be written for the next fiscal year. These are snapshots, not journals: the historical entries stay in the ledger, so no opening journal is posted.')}
              </p>
            {:else}
              <p class="fiscal-hint">
                {t('No balance-sheet balance has to be carried forward.')}
              </p>
            {/if}
          </section>
        {/if}

        {#if closePreview.already_closed && closeReadOnly}
          <ul class="fiscal-notes">
            <li>{t('This fiscal year is already closed. The figures above are the closing result, excluding the closing journals themselves.')}</li>
          </ul>
        {/if}
      {/if}

      {#if !closeReadOnly && rollForwardBlocked()}
        <div class="fiscal-alert" role="alert">{rollForwardBlockReason()}</div>
      {/if}

      {#if closeError}
        <div class="fiscal-alert" role="alert">{closeError}</div>
      {/if}
    </div>

    <svelte:fragment slot="footer">
      <div class="fiscal-form-actions">
        <ActionButton
          label={closeReadOnly ? t('Close') : t('Cancel')}
          variant="ghost"
          on:click={dismissClose}
        />
        {#if !closeReadOnly}
          <ActionButton
            label={t('Close fiscal year')}
            icon="bi-lock"
            loading={closing}
            disabled={closePreviewLoading || !!closeError || rollForwardBlocked()}
            on:click={confirmClose}
          />
        {/if}
      </div>
    </svelte:fragment>
  </AppModal>
{/if}

{#if reopenTarget}
  <AppModal
    title={t('Reopen fiscal year')}
    icon="bi-unlock"
    variant="warning"
    size="md"
    loading={reopening}
    on:close={dismissReopen}>
    <div class="fiscal-close">
      <p class="fiscal-close-range">
        <strong>{reopenTarget.name}</strong>
        <span class="fiscal-range">{reopenTarget.start_date} → {reopenTarget.end_date}</span>
      </p>

      <div class="fiscal-warning" role="alert">
        {t('Reopening reverses the closing journals of this fiscal year and deactivates the opening balances it wrote into the next fiscal year. Nothing is deleted: every reversal is logged and the history stays available.')}
      </div>

      {#if reopenPreviewLoading}
        <PanelSkeleton ariaLabel={t('Loading')} lines={3} />
      {:else if reopenPreview}
        <ul class="fiscal-notes">
          <li>
            {t('Closing journals to reverse')}:
            <strong>{reopenPreview.generated_count ? reopenPreview.generated_count : 0}</strong>
            {t('opening balance row(s) to deactivate')}
          </li>
          <li>
            {reopenPreview.generated_next_fiscal_year
              ? `${t('Affected next fiscal year')}: ${reopenPreview.generated_next_fiscal_year.name}`
              : t('No opening balance was generated by this fiscal year.')}
          </li>
          <li>
            {t('The fiscal year returns to OPEN and can be closed again; a new close writes a fresh generation of opening balances.')}
          </li>
        </ul>
      {/if}

      {#if reopenError}
        <div class="fiscal-alert" role="alert">{reopenError}</div>
      {/if}
    </div>

    <svelte:fragment slot="footer">
      <div class="fiscal-form-actions">
        <ActionButton label={t('Cancel')} variant="ghost" on:click={dismissReopen} />
        <ActionButton
          label={t('Reopen fiscal year')}
          icon="bi-unlock"
          tone="danger"
          loading={reopening}
          disabled={reopenPreviewLoading}
          on:click={confirmReopen}
        />
      </div>
    </svelte:fragment>
  </AppModal>
{/if}

{#if historyYear}
  <FiscalYearHistory year={historyYear} on:close={() => (historyYear = null)} />
{/if}

<style>
  .fiscal-body {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-height: 0;
    overflow: auto;
  }

  .fiscal-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .fiscal-alert {
    padding: 0.5rem 0.65rem;
    border: 1px solid #f1c3c3;
    border-radius: 0.5rem;
    background: #fdf3f3;
    color: #a4232b;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .fiscal-note {
    display: block;
    color: #64748b;
    font-size: 0.68rem;
  }

  .fiscal-actions-col {
    width: 7.5rem;
    text-align: end;
  }

  .fiscal-row-actions {
    display: inline-flex;
    gap: 0.25rem;
    justify-content: flex-end;
  }

  tr.selected {
    background: #f4f8ff;
  }

  .fiscal-summary {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.85rem;
    border: 1px solid #e1e7ef;
    border-radius: 0.6rem;
    background: #fff;
  }

  .fiscal-summary h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 800;
  }

  .fiscal-range {
    margin-inline-start: 0.35rem;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .fiscal-hint {
    margin: 0.3rem 0 0;
    color: #64748b;
    font-size: 0.72rem;
  }

  /*
   * A roll-forward that will create the next fiscal year: good news, but still
   * something the operator must read before confirming an accounting action.
   */
  .fiscal-hint-positive {
    color: #15803d;
  }

  .fiscal-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.55rem;
  }

  .fiscal-notes {
    margin: 0;
    padding-inline-start: 1.1rem;
    color: #64748b;
    font-size: 0.72rem;
  }

  .fiscal-form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .fiscal-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .fiscal-form input,
  .fiscal-form textarea {
    padding: 0.45rem 0.55rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.45rem;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .fiscal-form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .fiscal-close {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .fiscal-close-range {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.85rem;
  }

  .fiscal-warning {
    padding: 0.5rem 0.65rem;
    border: 1px solid #f0d6a8;
    border-radius: 0.5rem;
    background: #fff8ec;
    color: #8a5a12;
    font-size: 0.76rem;
    font-weight: 600;
  }

  .fiscal-close-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    color: #475569;
    font-size: 0.75rem;
  }

  .fiscal-close-currency {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid #e1e7ef;
    border-radius: 0.55rem;
    background: #fff;
  }

  .fiscal-close-currency header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 0.82rem;
  }
</style>
