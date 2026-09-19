<script>
  import { onMount } from 'svelte';
  import { fiscalYearApi } from '../api/fiscalYearApi.js';
  import { toast } from '../ToastUI/toast.js';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import AppModal from '../components/common/AppModal.svelte';
  import AppDatePicker from '../components/common/AppDatePicker.svelte';
  import { t } from '../i18n/i18n';
  import { showDate } from '../calendar.js';

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

  function isOpen(year) {
    return String(year?.fiscal_status || '').toLowerCase() === 'open';
  }

  /*
   * A new fiscal year is proposed right after the latest one, keeping the
   * organization's own cycle length (so an April-March book stays April-March).
   */
  function proposedRange() {
    if (!years.length) {
      const today = new Date().toISOString().slice(0, 10);

      return { start: today, end: addDays(today, 364) };
    }

    const latest = [...years].sort((a, b) =>
      a.end_date < b.end_date ? 1 : -1,
    )[0];
    const spanDays =
      Math.round(
        (new Date(`${latest.end_date}T00:00:00Z`) -
          new Date(`${latest.start_date}T00:00:00Z`)) /
          86400000,
      ) + 1;
    const start = addDays(latest.end_date, 1);

    return { start, end: addDays(start, spanDays - 1) };
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
        const current = await fiscalYearApi.getCurrent();
        currentYear = current?.data || null;
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
  showExtra={true}
  showFooter={false}
  toolbarWidth="16rem">
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

  <svelte:fragment slot="extra">
    {#if error}
      <div class="fiscal-alert" role="alert">{error}</div>
    {/if}
  </svelte:fragment>

  <div class="fiscal-body">
    {#if loading}
      <EmptyState loading={true} message={t('Loading')} />
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
                    label={t('Edit')}
                    icon="bi-pencil"
                    variant="icon"
                    tone="edit"
                    compact
                    disabled={!isOpen(year)}
                    title={isOpen(year) ? t('Edit') : t('A closed fiscal year cannot be edited.')}
                    on:click={() => openEdit(year)}
                  />
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
            {t('Read-time classification by accounting date. Nothing is reset and no closing entry is created.')}
          </p>
        </header>

        {#if summaryLoading}
          <EmptyState loading={true} message={t('Loading')} />
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
              <li>{note}</li>
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
</style>
