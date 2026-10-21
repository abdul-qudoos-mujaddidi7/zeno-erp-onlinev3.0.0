<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { t, lang } from '../i18n/i18n';

  /*
   * Presentation half of the dashboard.
   *
   * Every value arrives pre-computed in `data` (see Dashboard.svelte) so this
   * component is only responsible for the layout, the local view state
   * (period menu, selected alert, chart legend) and the design itself:
   * matte KPI cards, quick actions, an alert board beside the navy treasury,
   * the accounts / market row and one collapsed block for the deeper reports.
   */
  export let data;
  export let trend = { labels: [], benefit: [], expenses: [] };
  export let period = 'week';
  export let customStart = '';
  export let customEnd = '';
  export let returnsPeriod = 'today';
  export let returnsCustomStart = '';
  export let returnsCustomEnd = '';

  const dispatch = createEventDispatcher();

  $: _lang = $lang;

  /* ---------- clock ---------- */
  let now = new Date();
  let clockTimer;

  const AFGHAN_MONTHS = {
    فروردین: 'حمل',
    اردیبهشت: 'ثور',
    خرداد: 'جوزا',
    تیر: 'سرطان',
    مرداد: 'اسد',
    شهریور: 'سنبله',
    مهر: 'میزان',
    آبان: 'عقرب',
    آذر: 'قوس',
    دی: 'جدی',
    بهمن: 'دلو',
    اسفند: 'حوت',
  };

  function clockTimeOf(date) {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function clockDateOf(date) {
    try {
      const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).formatToParts(date);

      const read = (type) => parts.find((part) => part.type === type)?.value || '';
      const month = AFGHAN_MONTHS[read('month')] || read('month');

      return `${read('weekday')}، ${read('day')} ${month} ${read('year')}`;
    } catch {
      return new Intl.DateTimeFormat('en-GB').format(date);
    }
  }

  $: clockTime = clockTimeOf(now);
  $: clockDate = clockDateOf(now);

  onMount(() => {
    clockTimer = setInterval(() => (now = new Date()), 30 * 1000);
    return () => clearInterval(clockTimer);
  });

  /* ---------- period filter ---------- */
  const PERIODS = ['week', 'month', 'year'];

  let showPeriodMenu = false;
  let showCustomDates = false;
  let customRangeOrigin = 'trend';
  let selectedCustomPreset = '';
  let fromDate = customStart;
  let toDate = customEnd;

  $: periodLabels = {
    today: t('Today'),
    week: t('This Week'),
    month: t('This Month'),
    year: t('This Year'),
    custom: t('Custom'),
  };
  $: customDatePresets = [
    { id: 'yesterday', label: t('Yesterday') },
    { id: 'days30', label: t('30 days') },
    { id: 'months3', label: t('3 months') },
    { id: 'year', label: t('This Year') },
  ];
  $: currentPeriodLabel = periodLabels[period] || periodLabels.today;
  $: returnCountSuffix = returnsPeriod === 'today'
    ? t('items today')
    : returnsPeriod === 'month'
      ? t('items this month')
      : t('items');

  function pickPeriod(next) {
    showPeriodMenu = false;
    showCustomDates = false;
    if (next === period) return;
    dispatch('period', next);
  }

  function toggleCustomDates(origin = 'trend') {
    showCustomDates = !showCustomDates || customRangeOrigin !== origin;
    customRangeOrigin = origin;
    if (showCustomDates) {
      fromDate = origin === 'returns' ? returnsCustomStart || customStart : customStart;
      toDate = origin === 'returns' ? returnsCustomEnd || customEnd : customEnd;
      selectedCustomPreset = '';
    }
  }

  function pickReturnsPeriod(next) {
    showCustomDates = false;
    if (next === returnsPeriod) return;
    dispatch('returnsperiod', { period: next });
  }

  function applyReturnsCustom() {
    if (!fromDate || !toDate || fromDate > toDate) return;
    showCustomDates = false;
    selectedCustomPreset = '';
    dispatch('returnsperiod', { period: 'custom', from: fromDate, to: toDate });
  }

  function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function applyCustomPreset(preset) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);

    if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === 'days30') {
      start.setDate(start.getDate() - 29);
    } else if (preset === 'months3') {
      start.setMonth(start.getMonth() - 3);
    } else if (preset === 'year') {
      start.setMonth(0, 1);
    }

    fromDate = formatDateInput(start);
    toDate = formatDateInput(end);
    selectedCustomPreset = preset;
  }

  function applyCustom() {
    if (!fromDate || !toDate || fromDate > toDate) return;
    showPeriodMenu = false;
    showCustomDates = false;
    selectedCustomPreset = '';
    dispatch('applycustom', { from: fromDate, to: toDate });
  }

  /* ---------- alerts board ---------- */
  let activeAlertKey = 'expiry';
  let alertQuery = '';

  $: alertTiles = data?.alerts?.tiles || [];
  $: activeAlert = pickActiveAlert(alertTiles, activeAlertKey);
  function pickActiveAlert(tiles, key) {
    if (tiles.some((tile) => tile.key === key)) return key;
    return tiles[0]?.key || null;
  }

  function selectAlert(key) {
    activeAlertKey = key;
  }

  $: activePanel = activeAlert ? data?.alerts?.panels?.[activeAlert] || null : null;
  $: hasAlerts = alertTiles.length > 0;
  $: hasTreasury = Boolean(data?.treasury);
  $: hasDebtors = Boolean(data?.market?.debtors);
  $: hasAccounts = Boolean(data?.market?.accounts);
  $: hasFx = Boolean(data?.market?.fx);
  $: marketCardCount = [hasDebtors, hasAccounts, hasFx].filter(Boolean).length;
  $: filteredPanelRows = (activePanel?.rows || []).filter((row) => {
    const query = alertQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${row.title} ${row.meta || ''}`.toLocaleLowerCase().includes(query);
  });

  /* ---------- trend chart (inline SVG, no canvas) ---------- */
  const CHART_W = 700;
  const CHART_H = 250;
  const CHART_TOP = 10;

  let visible = [true, true, true, true];
  function toggleSeries(index) {
    visible = visible.map((item, itemIndex) => (itemIndex === index ? !item : item));
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exponent = Math.floor(Math.log10(value));
    const base = Math.pow(10, exponent);
    for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (value <= base * step) return base * step;
    }
    return base * 10;
  }

  $: chartMax = niceMax(
    Math.max(0, ...(trend.sales || []).map(Number), ...(trend.purchases || []).map(Number),
      ...(trend.benefit || []).map(Number), ...(trend.expenses || []).map(Number)),
  );

  function chartY(value) {
    const ratio = chartMax > 0 ? Number(value || 0) / chartMax : 0;
    return (CHART_TOP + (CHART_H - CHART_TOP) * (1 - ratio)).toFixed(1);
  }

  function chartX(index, length) {
    if (length <= 1) return 0;
    return ((index / (length - 1)) * CHART_W).toFixed(1);
  }

  function linePoints(values = []) {
    const list = values.length ? values : [0];
    return list.map((value, index) => `${chartX(index, list.length)},${chartY(value)}`).join(' ');
  }

  function areaPath(values = []) {
    const list = values.length ? values : [0];
    const line = list
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${chartX(index, list.length)} ${chartY(value)}`)
      .join(' ');
    return `${line} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
  }

  $: gridTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    label: formatCompact(chartMax * ratio),
    top: `${((CHART_TOP + (CHART_H - CHART_TOP) * (1 - ratio)) / CHART_H) * 100}%`,
  }));

  let hiddenWarehouseIds = [];
  $: warehouseRows = data?.inventory?.warehouses || [];
  $: warehouseChartLabels = data?.inventory?.warehouseHistoryLabels || [];
  $: visibleWarehouseRows = warehouseRows.filter((warehouse) =>
    warehouse.value != null && !hiddenWarehouseIds.includes(String(warehouse.id)),
  );
  /* Reference rounding: ceil to the next multiple of a power of ten. */
  function niceCeil(value) {
    const raw = Number(value) || 0;
    if (raw <= 0) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.ceil(raw / magnitude) * magnitude;
  }

  $: warehouseChartMax = niceCeil(
    Math.max(0, ...visibleWarehouseRows.flatMap((warehouse) => warehouse.history || []).map(Number)),
  );
  $: warehouseChartSeries = visibleWarehouseRows.flatMap((warehouse) => {
    const values = warehouse.history || [];
    if (
      !warehouseChartLabels.length ||
      values.length !== warehouseChartLabels.length ||
      values.some((value) => value == null || !Number.isFinite(Number(value)))
    ) return [];

    const index = warehouseRows.findIndex((item) => String(item.id) === String(warehouse.id));
    // Same string formatting as the reference (`59.0`, not `59`).
    const scale = warehouseChartMax || 1;
    const points = values.map((value, pointIndex) => {
      const x = values.length <= 1 ? CHART_W / 2 : (pointIndex / (values.length - 1)) * CHART_W;
      const y = CHART_TOP + (CHART_H - CHART_TOP) * (1 - Math.max(0, Number(value)) / scale);
      return { x: x.toFixed(1), y: y.toFixed(1) };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(' ');
    // The reference fills only the first series, from the baseline across the full width.
    const area = points.length > 1 ? `0,${CHART_H} ${line} ${CHART_W},${CHART_H}` : '';
    return [{
      id: warehouse.id,
      name: warehouse.name,
      values,
      points,
      line,
      area,
      colorIndex: index % 3,
    }];
  });
  $: warehouseChartTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    // The reference prints plain integers here (no thousands separator).
    label: String(Math.round(warehouseChartMax * ratio)),
    top: `${((CHART_TOP + (CHART_H - CHART_TOP) * (1 - ratio)) / CHART_H) * 100}%`,
  }));

  function warehouseChange(warehouse) {
    const values = (warehouse?.history || []).map(Number).filter((value) => Number.isFinite(value));
    if (values.length < 2) return null;
    const first = values[0];
    const last = values[values.length - 1];
    if (!first) return null;
    const percent = ((last - first) / first) * 100;
    return { up: percent >= 0, text: `${percent >= 0 ? '↑' : '↓'} ${Math.abs(percent).toFixed(1)}%` };
  }

  function warehouseVisible(id) {
    return !hiddenWarehouseIds.includes(String(id));
  }

  function toggleWarehouse(id) {
    const key = String(id);
    hiddenWarehouseIds = warehouseVisible(id)
      ? [...hiddenWarehouseIds, key]
      : hiddenWarehouseIds.filter((item) => item !== key);
  }

  $: xLabels = (trend.labels || []).filter((label, index, list) => {
    if (list.length <= 8) return true;
    const step = Math.ceil(list.length / 8);
    return index % step === 0 || index === list.length - 1;
  });

  $: benefitTotal = (trend.benefit || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: expenseTotal = (trend.expenses || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: benefitAfterExpenses = (Number(data?.totals?.benefit ?? benefitTotal) || 0) - (Number(data?.totals?.expenses ?? expenseTotal) || 0);
  $: salesTotal = (trend.sales || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: purchasesTotal = (trend.purchases || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: returnsTotal = (data?.reports?.returns || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0);

  function returnsDonutBackground(rows, amount) {
    const colors = ['#d97706', '#64748b', '#dc2626'];
    const total = Math.max(0, Number(amount) || 0);
    const stops = [];
    let offset = 0;

    if (!total) return 'conic-gradient(var(--surface-3) 0deg 360deg)';

    rows.forEach((row, index) => {
      const amount = Math.max(0, Number(row.value) || 0);
      if (!amount) return;

      const angle = amount / total * 360;
      const end = offset + angle;
      const gap = Math.min(2.15, angle * 0.25);
      const visibleStart = offset + gap / 2;
      const visibleEnd = end - gap / 2;
      const startText = `${offset.toFixed(3)}deg`;
      const visibleStartText = `${visibleStart.toFixed(3)}deg`;
      const visibleEndText = `${visibleEnd.toFixed(3)}deg`;
      const endText = `${end.toFixed(3)}deg`;

      if (visibleStart > offset) {
        stops.push(`var(--surface-3) ${startText} ${visibleStartText}`);
      }
      stops.push(`${colors[index] || colors[0]} ${visibleStartText} ${visibleEndText}`);
      if (end > visibleEnd) {
        stops.push(`var(--surface-3) ${visibleEndText} ${endText}`);
      }
      offset = end;
    });

    if (offset < 360) stops.push(`var(--surface-3) ${offset.toFixed(3)}deg 360deg`);
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
  }

  function returnPercent(value, total) {
    const denominator = Number(total) || 0;
    return denominator > 0 ? `${Math.round(((Number(value) || 0) / denominator) * 100)}%` : '0%';
  }

  /* ---------- formatting ---------- */
  function fmt(value) {
    if (value == null || isNaN(Number(value))) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(value));
  }

  function formatCompact(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
    if (Math.abs(number) >= 10_000) return `${Math.round(number / 1000)}K`;
    return fmt(Math.round(number));
  }

  function formatWarehouseTileValue(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const amount = Number(value);
    if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
    if (Math.abs(amount) >= 1_000) {
      return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(amount / 1_000)}k`;
    }
    return fmt(amount);
  }

  function percent(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${fmt(number)}%`;
  }
</script>

<div class="zb">
  {#if data?.reminder}
    <aside class="zb-reminder" aria-live="polite">
      <span class="zb-reminder-ic"><i class="bi bi-hourglass-split" aria-hidden="true"></i></span>
      <div class="zb-reminder-copy">
        <strong>{data.reminder.title}</strong>
        <span>{data.reminder.daysLeft} {t('days remaining')}</span>
      </div>
      <a class="zb-reminder-link" href={data.reminder.href} use:link>
        {t('View subscription')}
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
      </a>
    </aside>
  {/if}

  <!-- 1 · today's operations -->
  <section class="zb-section" aria-labelledby="zb-kpi-title">
    <div class="zb-sec-hd">
      <div class="zb-kpi-heading">
        <h2 id="zb-kpi-title" class="zb-sec-title">{t("Today's Operations")}</h2>
      </div>

      <div class="zb-sec-tools">
        <div class="zb-clock" role="timer" aria-label={clockDate} title={`${clockTime} · ${clockDate}`}>
          <i class="bi bi-clock" aria-hidden="true"></i>
          <b dir="ltr" class="zb-clock-time">{clockTime}</b>
          <i class="zb-clock-sep" aria-hidden="true"></i>
          <span class="zb-clock-date">{clockDate}</span>
        </div>
      </div>
    </div>

    <div class="zb-kpi-grid">
      {#each data?.kpi || [] as card (card.key)}
        <a class="zb-kpi" data-hue={card.hue} href={card.href} use:link title={card.label}>
          <span class="zb-kpi-ic"><i class="bi {card.icon}" aria-hidden="true"></i></span>
          <div class="zb-kpi-body">
            <span class="zb-kpi-label">{card.label}</span>
            <span class="zb-kpi-row">
              <span class="zb-kpi-value" dir="ltr">{card.value}</span>
              {#if card.unit}<span class="zb-kpi-unit">{card.unit}</span>{/if}
            </span>
            {#if card.sub?.length}
              <span class="zb-kpi-sub">
                {#each card.sub as item}
                  <span class="zb-kpi-chip">
                    {#if item.bold}<b dir="ltr">{item.text}</b>{:else}{item.text}{/if}
                  </span>
                {/each}
              </span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  </section>

  <!-- 2 · quick actions -->
  {#if data?.quickActions?.length}
    <section class="zb-section" aria-labelledby="zb-qa-title">
      <div class="zb-sec-hd">
        <h2 id="zb-qa-title" class="zb-sec-title">{t('Quick Actions')}</h2>
      </div>
      <div class="zb-qa-grid">
        {#each data.quickActions as action (action.label)}
          <a class="zb-qa" data-hue={action.hue} href={action.href} use:link>
            <span class="zb-qa-ic"><i class="bi {action.icon}" aria-hidden="true"></i></span>
            <span>{action.label}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <!-- 3 · warnings + treasury -->
  <section class="zb-section" aria-labelledby="zb-alert-title">
    <div class="zb-sec-hd">
      <h2 id="zb-alert-title" class="zb-sec-title">{t('Alerts & Treasury')}</h2>
      <label class="zb-search">
        <span class="zb-search-ic"><i class="bi bi-search" aria-hidden="true"></i></span>
        <input
          type="search"
          placeholder={t('Search alerts…')}
          aria-label={t('Search alerts…')}
          bind:value={alertQuery} />
      </label>
    </div>

    <div class="zb-row-2" class:solo={!(hasTreasury && hasAlerts)}>
      {#if hasTreasury}
        <section class="zb-treasury" aria-label={t('Treasury')}>
          <span class="zb-treasury-glow" aria-hidden="true"></span>
          <header class="zb-treasury-hd">
            <h3 class="zb-treasury-title">
              <span class="zb-treasury-ic"><i class="bi bi-wallet2" aria-hidden="true"></i></span>
              {t('Treasury')}
            </h3>
            <a href={data.treasury.href} use:link class="zb-treasury-link">{t('Details')}</a>
          </header>

          <div class="zb-treasury-hero">
            <span class="zb-treasury-cap">{t('Total in')} {t(data.currency)}</span>
            <div class="zb-treasury-total" class:negative={data.treasury.total < 0} dir="ltr">
              {fmt(data.treasury.total)}
              <span>{data.treasury.symbol || t(data.currency)}</span>
            </div>
          </div>

          <div class="zb-treasury-list">
            {#if !data.treasury.entries?.length}
              <span class="zb-empty">{t('No treasury balance')}</span>
            {:else}
              {#each data.treasury.entries as entry (entry.code)}
                <div class="zb-treasury-row">
                  <span class="zb-treasury-badge">{entry.symbol}</span>
                  <span class="zb-treasury-name">{entry.name}</span>
                  <span class="zb-treasury-amount" class:negative={entry.negative} dir="ltr">
                    {entry.negative ? '-' : ''}{entry.amount}
                  </span>
                </div>
              {/each}
            {/if}
          </div>

        </section>
      {/if}

      {#if hasAlerts}
      <section class="zb-alerts" aria-label={t('Alerts')}>
        <div class="zb-alerts-card">
          {#if alertTiles.length}
            <div class="zb-tiles" role="tablist" aria-label={t('Alerts')}>
              {#each alertTiles as tile (tile.key)}
                <button
                  type="button"
                  role="tab"
                  class="zb-tile"
                  data-hue={tile.hue}
                  aria-selected={activeAlert === tile.key}
                  on:click={() => selectAlert(tile.key)}>
                  <span class="zb-tile-top">
                    <span class="zb-tile-ic" class:text={tile.symbol} aria-hidden="true">
                      {#if tile.symbol}{tile.symbol}{:else}<i class="bi {tile.icon}"></i>{/if}
                    </span>
                    <span class="zb-tile-count" dir="ltr">{tile.count}</span>
                  </span>
                  <span class="zb-tile-label">{tile.label}</span>
                  <span class="zb-tile-note">{tile.note}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if activePanel}
            <div class="zb-panel" role="tabpanel">
              <header class="zb-panel-hd">
                <span>{activePanel.title}</span>
                <a href={activePanel.href} use:link>
                  {activePanel.linkLabel || t('Open')}
                  <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                </a>
              </header>

              <div class="zb-panel-rows" role="list">
                {#if !filteredPanelRows.length}
                  <span class="zb-empty">{t('No Data')}</span>
                {:else}
                  {#each filteredPanelRows as row, index (index)}
                    <div class="zb-panel-row" class:draft={row.hue === 'draft-sale' || row.hue === 'draft-purchase'} class:stock={row.kind === 'stock'} role="listitem">
                      {#if !row.hideLead}
                        <span class="zb-panel-lead" class:text={row.lead} data-hue={row.hue} aria-hidden="true">
                          {#if row.lead}{row.lead}{:else}<i class="bi {row.icon}"></i>{/if}
                        </span>
                      {/if}
                      <span class="zb-panel-copy">
                        <span class="zb-panel-title">{row.title}</span>
                        {#if row.meta}<span class="zb-panel-meta">{row.meta}</span>{/if}
                      </span>
                      <span class="zb-panel-value" data-hue={row.valueHue || row.hue} class:negative={row.negative} dir="ltr">{row.value}</span>
                      <span class="zb-panel-actions">
                        <a class="zb-panel-open" href={row.href || activePanel.href} use:link title={t('Open')} aria-label={`${t('Open')}: ${row.title}`}>
                          <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                        </a>
                        <a class="zb-panel-review" href={row.href || activePanel.href} use:link aria-label={`${t('Review')}: ${row.title}`}>{t('Review')}</a>
                        {#if row.actionLabel}
                          <a class="zb-panel-action" href={row.actionHref || row.href || activePanel.href} use:link aria-label={`${row.actionLabel}: ${row.title}`}>{row.actionLabel}</a>
                        {/if}
                      </span>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </section>
      {/if}
    </div>
  </section>

  <!-- 4 · accounts + market -->
  {#if marketCardCount}
  <section class="zb-section" aria-labelledby="zb-market-title">
    <div class="zb-sec-hd">
      <h2 id="zb-market-title" class="zb-sec-title">
        {t('Accounts & Market')}
        {#if data?.market?.accounts?.total != null}
          <span class="zb-count">{data.market.accounts.total}</span>
        {/if}
      </h2>
      <div class="zb-sec-links">
        <a href="/dashboard/accounts/list" use:link>
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          {t('New Account')}
        </a>
        <a href="/dashboard/accounts/list" use:link class="muted">{t('All')}</a>
      </div>
    </div>

    <div
      class="zb-row-3"
      class:duo={marketCardCount === 2}
      class:solo={marketCardCount === 1}>
      {#if hasDebtors}
        <section class="zb-card matte" data-hue="emerald" aria-label={t('Top Debtors')}>
          <header class="zb-card-hd">
            <h3 class="zb-card-title" data-hue="emerald">
              <span class="zb-card-ic" data-hue="emerald"><i class="bi bi-person-lines-fill" aria-hidden="true"></i></span>
              {t('Top Debtors')}
            </h3>
            <span class="zb-chip" data-hue="emerald">
              {t('Total')} {fmt(data.market.debtors.sum)} {data.market.debtors.currencySymbol}
            </span>
          </header>

          <div class="zb-list">
            {#if !data.market.debtors.items?.length}
              <span class="zb-empty success">{t('No outstanding receivables')}</span>
            {:else}
              {#each data.market.debtors.items as debtor (debtor.id)}
                <a class="zb-debtor" href={`/dashboard/account/${debtor.id}`} use:link>
                  <span class="zb-avatar">{debtor.initial}</span>
                  <span class="zb-debtor-body">
                    <span class="zb-debtor-name">{debtor.name}</span>
                    <span class="zb-bar"><span style={`width:${debtor.share}%`}></span></span>
                  </span>
                  <span class="zb-debtor-amount" dir="ltr">
                    {fmt(debtor.amount)}
                    <small>{debtor.currencySymbol}</small>
                  </span>
                  <i class="bi bi-chevron-left zb-go" aria-hidden="true"></i>
                </a>
              {/each}
            {/if}
          </div>
        </section>
      {/if}

      {#if hasAccounts}
        <section class="zb-accounts" aria-label={t('Accounts')}>
          {#if !data.market.accounts.items?.length}
            <span class="zb-empty">{t('No Data')}</span>
          {:else}
          <div class="zb-accounts-grid">
            {#each data.market.accounts.items as account (account.label)}
              <a class="zb-account" data-hue={account.hue} href={account.href} use:link title={account.label} aria-label={`${account.label} — ${account.count}`}>
                <span class="zb-account-top">
                  <span class="zb-account-ic" data-hue={account.hue}>
                    <i class="bi {account.icon}" aria-hidden="true"></i>
                  </span>
                  <span class="zb-account-copy">
                    <span class="zb-account-label">{account.label}</span>
                    <span class="zb-account-value">
                      <b dir="ltr">{account.count}</b>
                      {#if account.added > 0}
                        <span class="zb-account-new" dir="ltr">+{account.added}</span>
                      {/if}
                    </span>
                  </span>
                  <i class="bi bi-arrow-left zb-account-go" aria-hidden="true"></i>
                </span>
                <span class="zb-account-bar">
                  <span data-hue={account.hue} style={`width:${account.share}%`}></span>
                </span>
              </a>
            {/each}
          </div>
          {/if}
        </section>
      {/if}

      {#if hasFx}
        <section class="zb-card matte" data-hue="cyan" aria-label={t('Exchange Rate')}>
          <header class="zb-card-hd">
            <div class="zb-fx-title">
              <h3 class="zb-card-title" data-hue="cyan">
                <span class="zb-card-ic" data-hue="cyan"><i class="bi bi-currency-exchange" aria-hidden="true"></i></span>
                {t('Exchange Rate')}
              </h3>
            </div>
            <a href={data.market.fx.href} use:link class="zb-btn zb-fx-set">
              <i class="bi bi-pencil" aria-hidden="true"></i>
              {t('Set Rate')}
            </a>
          </header>

          <div class="zb-fx-list">
            {#if !data.market.fx.rates?.length}
              <span class="zb-empty">{t('No Data')}</span>
            {:else}
              {#each data.market.fx.rates as rate (rate.code)}
                <div class="zb-fx-row">
                  <span class="zb-fx-badge">{rate.symbol}</span>
                  <span class="zb-fx-name">
                    <b>{rate.name}</b>
                    <small dir="ltr">1 {rate.code}</small>
                  </span>
                  <span class="zb-fx-value">
                    <span class="zb-fx-rate">
                      {rate.rate}
                      <small>{rate.unit}</small>
                    </span>
                  </span>
                </div>
              {/each}
            {/if}
          </div>
        </section>
      {/if}
    </div>
  </section>
  {/if}

  <!-- 5 · everything else, collapsed -->
  {#if data?.reports}
    <details class="zb-more">
      <summary>
        <span class="zb-more-ic"><i class="bi bi-grid-1x2-fill" aria-hidden="true"></i></span>
        <b>{t('More Reports')}</b>
        <span class="zb-more-sub">{data.reports.summary}</span>
        <span class="zb-chev"><i class="bi bi-chevron-down" aria-hidden="true"></i></span>
      </summary>

      <div class="zb-more-body">
        <div class="zb-block">
          <h3 class="zb-block-title zb-trend-section-title">
            <i class="bi bi-graph-up" aria-hidden="true"></i>
            {t('Financial Trend')}
          </h3>

            <section class="zb-trend" aria-label={t('Financial Trend')}>
              <header class="zb-trend-hd">
                <div class="zb-trend-title">
                  <span class="zb-trend-icon" aria-hidden="true"><i class="bi bi-graph-up"></i></span>
                  <b>{t('Sales')} / {t('Expenses')}</b>
                  <small>{t(data.currency)} · {currentPeriodLabel}</small>
                </div>
                <div class="zb-period-group" role="group" aria-label={t('Chart range')}>
                  {#each PERIODS as range (range)}
                    <button type="button" class:active={period === range} aria-pressed={period === range}
                      on:click={() => pickPeriod(range)}>{periodLabels[range]}</button>
                  {/each}
                  <button type="button" class:active={showCustomDates || period === 'custom'} aria-pressed={period === 'custom'} aria-expanded={showCustomDates}
                    on:click={() => toggleCustomDates('trend')}>{periodLabels.custom}</button>
                </div>
              </header>

              {#if showCustomDates && customRangeOrigin === 'trend'}
                <div class="zb-custom-range" role="group" aria-label={t('Custom date range')}>
                  {#each customDatePresets as preset (preset.id)}
                    <button type="button" class="preset" class:active={selectedCustomPreset === preset.id}
                      on:click={() => applyCustomPreset(preset.id)}>{preset.label}</button>
                  {/each}
                  <span class="zb-custom-separator" aria-hidden="true"></span>
                  <label>{t('From')}<input type="date" dir="ltr" bind:value={fromDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <label>{t('To')}<input type="date" dir="ltr" bind:value={toDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <button type="button" class="apply" on:click={applyCustom}>{t('Apply')}</button>
                  <button type="button" aria-label={t('Close')} on:click={() => (showCustomDates = false)}><i class="bi bi-x-lg"></i></button>
                </div>
              {/if}

              {#if period === 'custom' && !showCustomDates && customRangeOrigin === 'trend'}
                <button type="button" class="zb-custom-chip" on:click={() => toggleCustomDates('trend')}>
                  <i class="bi bi-calendar-range" aria-hidden="true"></i>
                  <span dir="ltr">{fromDate || customStart} – {toDate || customEnd}</span>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>
              {/if}

              <div class="zb-legend" role="group" aria-label={t('Chart series')}>
                <button
                  type="button"
                  class:off={!visible[0]}
                  aria-pressed={visible[0]}
                  on:click={() => toggleSeries(0)}>
                  <span class="dot sales"></span>
                  {t('Sales')}
                </button>
                <button
                  type="button"
                  class:off={!visible[1]}
                  aria-pressed={visible[1]}
                  on:click={() => toggleSeries(1)}>
                  <span class="dot purchases"></span>
                  {t('Purchases')}
                </button>
                <button
                  type="button"
                  class:off={!visible[2]}
                  aria-pressed={visible[2]}
                  on:click={() => toggleSeries(2)}>
                  <span class="dot benefit"></span>
                  {t('Benefit')}
                </button>
                <button
                  type="button"
                  class:off={!visible[3]}
                  aria-pressed={visible[3]}
                  on:click={() => toggleSeries(3)}>
                  <span class="dot expense"></span>
                  {t('Expenses')}
                </button>
              </div>

              <div class="zb-chart" dir="ltr">
                <div class="zb-chart-plot">
                  <div class="zb-chart-grid">
                    {#each gridTicks as tick}
                      <div class="zb-grid-line" style={`top:${tick.top}`}>
                        <span>{tick.label}</span>
                        <i></i>
                      </div>
                    {/each}
                  </div>

                  <div class="zb-chart-svg">
                    {#if visible[0]}
                      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
                        <path class="zb-area" d={areaPath(trend.sales)}></path>
                      </svg>
                    {/if}
                    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
                      {#if visible[0]}
                        <polyline class="zb-line sales" points={linePoints(trend.sales)}></polyline>
                      {/if}
                      {#if visible[1]}
                        <polyline class="zb-line purchases" points={linePoints(trend.purchases)}></polyline>
                      {/if}
                      {#if visible[2]}
                        <polyline class="zb-line benefit" points={linePoints(trend.benefit)}></polyline>
                      {/if}
                      {#if visible[3]}
                        <polyline class="zb-line expense" points={linePoints(trend.expenses)}></polyline>
                      {/if}
                    </svg>
                  </div>
                </div>

                <div class="zb-chart-x">
                  {#each xLabels as label (label)}
                    <span>{label}</span>
                  {/each}
                </div>
              </div>

              <div class="zb-trend-totals">
                <div>
                  <span><i class="dot sales"></i>{t('Sales')}</span>
                  <b class="zb-money"><small>{data.currencySymbol || t(data.currency)}</small>{fmt(salesTotal)}</b>
                </div>
                <div>
                  <span><i class="dot purchases"></i>{t('Purchases')}</span>
                  <b class="zb-money"><small>{data.currencySymbol || t(data.currency)}</small>{fmt(purchasesTotal)}</b>
                </div>
                <div>
                  <span><i class="dot expense"></i>{t('Expenses')}</span>
                  <b class="zb-money"><small>{data.currencySymbol || t(data.currency)}</small>{fmt(data.totals?.expenses ?? expenseTotal)}</b>
                </div>
                <div>
                  <span><i class="dot benefit"></i>{t('Benefit')}</span>
                  <b class="zb-money"><small>{data.currencySymbol || t(data.currency)}</small>{fmt(benefitAfterExpenses)}</b>
                </div>
              </div>
            </section>

          </div>

        <div class="zb-block">
          <h3 class="zb-block-title zb-inventory-title"><i class="bi bi-boxes" aria-hidden="true"></i>{t('Inventory & Returns')}</h3>
          <div class="zb-block-row zb-inventory-row">
            <section class="zb-returns" aria-label={t('Returns & Wastes')}>
              <header class="zb-returns-hd">
                <h3 class="zb-card-title zb-returns-title">
                  <span class="zb-card-ic" data-hue="rose"><i class="bi bi-arrow-return-left" aria-hidden="true"></i></span>
                  {t('Returns & Wastes')}
                </h3>
                <div class="zb-period-group" role="group" aria-label={t('Chart range')}>
                  <button type="button" class:active={returnsPeriod === 'today'} aria-pressed={returnsPeriod === 'today'}
                    on:click={() => pickReturnsPeriod('today')}>{periodLabels.today}</button>
                  <button type="button" class:active={returnsPeriod === 'month'} aria-pressed={returnsPeriod === 'month'}
                    on:click={() => pickReturnsPeriod('month')}>{periodLabels.month}</button>
                  <button type="button" class:active={(showCustomDates && customRangeOrigin === 'returns') || returnsPeriod === 'custom'} aria-pressed={returnsPeriod === 'custom'} aria-expanded={showCustomDates && customRangeOrigin === 'returns'}
                    on:click={() => toggleCustomDates('returns')}>{periodLabels.custom}</button>
                </div>
              </header>

              {#if showCustomDates && customRangeOrigin === 'returns'}
                <div class="zb-custom-range" role="group" aria-label={t('Custom date range')}>
                  {#each customDatePresets as preset (preset.id)}
                    <button type="button" class="preset" class:active={selectedCustomPreset === preset.id}
                      on:click={() => applyCustomPreset(preset.id)}>{preset.label}</button>
                  {/each}
                  <span class="zb-custom-separator" aria-hidden="true"></span>
                  <label>{t('From')}<input type="date" dir="ltr" bind:value={fromDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <label>{t('To')}<input type="date" dir="ltr" bind:value={toDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <button type="button" class="apply" on:click={applyReturnsCustom}>{t('Apply')}</button>
                  <button type="button" aria-label={t('Close')} on:click={() => (showCustomDates = false)}><i class="bi bi-x-lg"></i></button>
                </div>
              {/if}

              {#if returnsPeriod === 'custom' && !showCustomDates && customRangeOrigin === 'returns'}
                <button type="button" class="zb-custom-chip" on:click={() => toggleCustomDates('returns')}>
                  <i class="bi bi-calendar-range" aria-hidden="true"></i>
                  <span dir="ltr">{returnsCustomStart || customStart} – {returnsCustomEnd || customEnd}</span>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>
              {/if}

              <div class="zb-return-content">
                <div class="zb-return-donut" aria-hidden="true">
                  <span
                    class="zb-return-donut-ring"
                    style:background={returnsDonutBackground(data?.reports?.returns || [], returnsTotal)}>
                    <span class="zb-return-donut-hole"></span>
                  </span>
                  <div class="zb-return-total"><small>{t('Total')}</small><b>{fmt(returnsTotal)}</b><small>{t(data.currency)}</small></div>
                </div>
                <div class="zb-returns-rows">
                  {#each data.reports.returns as row, index (row.label)}
                    <a class="zb-returns-row" class:dot-0={index === 0} class:dot-1={index === 1} class:dot-2={index === 2} href={row.href} use:link>
                      <span class="zb-returns-dot" aria-hidden="true"></span>
                      <span class="zb-returns-label">{row.label}<small>{fmt(row.count)} {returnCountSuffix}</small></span>
                      <span class="zb-returns-value" dir="ltr">
                        <span>{fmt(row.value)}</span>
                        <small>{returnPercent(row.value, returnsTotal)}</small>
                      </span>
                      <i class="bi bi-chevron-left zb-returns-go" aria-hidden="true"></i>
                    </a>
                  {/each}
                </div>
              </div>
            </section>

            <section class="zb-card zb-warehouse" aria-label={t('Warehouses')}>
              <header class="zb-warehouse-hd">
                <div class="zb-warehouse-heading">
                  <h4 class="zb-card-title zb-warehouse-title">
                    <span class="zb-card-ic" data-hue="violet">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 9.5 12 4l9 5.5V20H3z"></path>
                        <path d="M6 11v6m4-6v6m4-6v6m4-6v6M5 20v-3h14v3"></path>
                      </svg>
                    </span>
                    {t('Warehouses')}
                  </h4>
                  <span class="zb-warehouse-sub">{t('Warehouse value')} · {t(data.currency)}</span>
                </div>
                <div class="zb-period-group zb-warehouse-period" role="group" aria-label={t('Chart range')}>
                  <button type="button" class:active={period === 'week'} aria-pressed={period === 'week'}
                    on:click={() => pickPeriod('week')}>{t('Warehouse 7 days')}</button>
                  <button type="button" class:active={period === 'month'} aria-pressed={period === 'month'}
                    on:click={() => pickPeriod('month')}>{periodLabels.month}</button>
                  <button type="button" class:active={(showCustomDates && customRangeOrigin === 'warehouse') || period === 'custom'} aria-pressed={period === 'custom'} aria-expanded={showCustomDates && customRangeOrigin === 'warehouse'}
                    on:click={() => toggleCustomDates('warehouse')}>{periodLabels.custom}</button>
                </div>
              </header>
              {#if showCustomDates && customRangeOrigin === 'warehouse'}
                <div class="zb-custom-range" role="group" aria-label={t('Custom date range')}>
                  {#each customDatePresets as preset (preset.id)}
                    <button type="button" class="preset" class:active={selectedCustomPreset === preset.id}
                      on:click={() => applyCustomPreset(preset.id)}>{preset.label}</button>
                  {/each}
                  <span class="zb-custom-separator" aria-hidden="true"></span>
                  <label>{t('From')}<input type="date" dir="ltr" bind:value={fromDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <label>{t('To')}<input type="date" dir="ltr" bind:value={toDate} on:input={() => (selectedCustomPreset = '')} /></label>
                  <button type="button" class="apply" on:click={applyCustom}>{t('Apply')}</button>
                  <button type="button" aria-label={t('Close')} on:click={() => (showCustomDates = false)}><i class="bi bi-x-lg" aria-hidden="true"></i></button>
                </div>
              {/if}
              {#if period === 'custom' && !showCustomDates && customRangeOrigin === 'warehouse'}
                <button type="button" class="zb-custom-chip" on:click={() => toggleCustomDates('warehouse')}>
                  <i class="bi bi-calendar-range" aria-hidden="true"></i>
                  <span dir="ltr">{customStart} – {customEnd}</span>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>
              {/if}
              {#if warehouseRows.length}
                <div class="zb-warehouse-list" role="group" aria-label={t('Warehouses')}>
                  {#each warehouseRows as warehouse, index (warehouse.id)}
                    {@const change = warehouseChange(warehouse)}
                    {@const visible = !hiddenWarehouseIds.includes(String(warehouse.id))}
                    <div class="zb-warehouse-item" class:series0={index % 3 === 0} class:series1={index % 3 === 1} class:series2={index % 3 === 2} class:hidden={!visible}>
                      <a class="zb-warehouse-tile" href={warehouse.href} use:link title={warehouse.name}>
                        <span class="zb-warehouse-name">{warehouse.name}</span>
                        <span class="zb-warehouse-value">
                          <b dir="ltr">{formatWarehouseTileValue(warehouse.value)}</b>
                          {#if change}
                            <small class="zb-warehouse-change" class:up={change.up} class:down={!change.up} dir="ltr">{change.text}</small>
                          {/if}
                        </span>
                      </a>
                      <button
                        type="button"
                        class="zb-warehouse-eye"
                        aria-pressed={visible}
                        aria-label={t(visible ? 'Hide from chart' : 'Show in chart')}
                        title={t(visible ? 'Hide from chart' : 'Show in chart')}
                        on:click={() => toggleWarehouse(warehouse.id)}
                      >
                        <i class="bi" class:bi-eye={visible} class:bi-eye-slash={!visible} aria-hidden="true"></i>
                      </button>
                    </div>
                  {/each}
                </div>
                <div class="zb-warehouse-chart" dir="ltr" role="img" aria-label={t('Warehouse stock value')}>
                  <div class="zb-warehouse-plot">
                    {#if warehouseChartMax > 0}
                      {#each warehouseChartTicks as tick (tick.top)}
                        <div class="zb-warehouse-grid-line" style={`top:${tick.top}`}>
                          <span>{tick.label}</span>
                          <i></i>
                        </div>
                      {/each}
                    {/if}
                    <div class="zb-warehouse-plot-inner">
                      {#each warehouseChartSeries as series (series.id)}
                        <svg class="zb-warehouse-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
                          {#if series.colorIndex === 0 && series.area}
                            <polygon class="zb-warehouse-area" points={series.area}></polygon>
                          {/if}
                          <polyline class={`zb-warehouse-line series${series.colorIndex}`} points={series.line}></polyline>
                        </svg>
                      {/each}
                    </div>
                  </div>
                  <div class="zb-warehouse-x">
                    {#each warehouseChartLabels as label, index (`${label}-${index}`)}
                      <span title={label}>{label}</span>
                    {/each}
                  </div>
                </div>
              {:else}
                <span class="zb-empty">{t('No Data')}</span>
              {/if}
            </section>
          </div>
        </div>

        {#if data.reports.topProducts?.length}
          <div class="zb-block">
            <section class="zb-card zb-top-products matte" aria-label={t('Top Products')}>
              <header class="zb-top-products-hd">
                <h3 class="zb-card-title" data-hue="indigo">
                  <span class="zb-card-ic" data-hue="indigo"><i class="bi bi-trophy-fill" aria-hidden="true"></i></span>
                  {t('Top Products')}
                </h3>
                <a href="/dashboard/product-alerts?tab=products" use:link>{t('All')}</a>
              </header>
              <div class="zb-products">
                {#each data.reports.topProducts as product, index (product.name)}
                  <div class="zb-product" title={product.code || product.name}>
                    <span class="zb-rank" class:top-three={index < 3} dir="ltr">{index + 1}</span>
                    <span class="zb-product-body">
                      <span class="zb-product-line">
                        <b>{product.name}</b>
                        <small>{fmt(product.qty)} {t('qty')}</small>
                      </span>
                      <span class="zb-bar" data-hue="blue"><span style={`width:${product.share}%`}></span></span>
                    </span>
                  </div>
                {/each}
              </div>
            </section>
          </div>
        {/if}

      </div>
    </details>
  {/if}

</div>

<style>
  /* ======================================================================
     Tokens — the design's palette, scoped to the dashboard board so the
     rest of the ERP keeps its existing surfaces.
     ====================================================================== */
  .zb {
    --surface: #ffffff;
    --surface-2: #f8fafc;
    --surface-3: #f1f5f9;
    --hover-bg: #f5f9ff;
    --border: #e1e7f0;
    --border-soft: #eef2f7;
    --border-strong: #dce6f8;
    --ink: #0b1530;
    --text: #475569;
    --muted: #64748b;
    --subtle: #94a3b8;
    --disabled: #cbd5e1;
    --link: #2f6fed;
    --brand: #2f6fed;
    --brand-soft: #e3ecff;
    --navy: #0b1530;
    --navy-2: #132042;
    --ok: #15803d;
    --ok-soft: #dcfce7;
    --ok-text: #15803d;
    --danger: #b91c1c;
    --danger-soft: #fee2e2;
    --danger-text: #b91c1c;
    --warn: #92400e;
    --warn-soft: #fef3c7;
    --warn-text: #92400e;
    --num: 'Inter', 'Vazirmatn', ui-sans-serif, system-ui, sans-serif;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);

    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 0 32px;
    min-width: 0;
    color: var(--text);
    font-size: 13px;
    line-height: 1.55;
  }

  :global(html.dark) .zb {
    --surface: #0f1a35;
    --surface-2: #132042;
    --surface-3: #1a2848;
    --hover-bg: #15244a;
    --border: #1e2c4f;
    --border-soft: #18254a;
    --border-strong: #2a3b66;
    --ink: #f1f5fb;
    --text: #b4c0da;
    --muted: #8a96b8;
    --subtle: #6b79a0;
    --disabled: #3a4a70;
    --link: #7fa7f8;
    --brand-soft: #16295a;
    --ok-soft: #0f3324;
    --ok-text: #4ade80;
    --danger-soft: #3b1219;
    --danger-text: #f87171;
    --warn-soft: #3a2a0a;
    --warn-text: #fbbf24;
  }

  .zb *,
  .zb *::before,
  .zb *::after {
    box-sizing: border-box;
  }

  .zb h2,
  .zb h3,
  .zb h4 {
    margin: 0;
  }

  .zb a {
    color: inherit;
    text-decoration: none;
  }

  .zb i {
    line-height: 1;
  }

  .zb-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  /* ---------- section headers ---------- */
  .zb-sec-hd {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    min-height: 30px;
  }

  .zb-kpi-heading {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] { gap: 8px; }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-sec-hd {
    justify-content: space-between;
    gap: 8px;
    min-height: 30px;
    padding: 0 4px;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock {
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .zb-kpi-welcome {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #6481a7;
    font-size: 16px;
    font-weight: 500;
  }

  .zb-kpi-welcome i { color: #3267e8; font-size: 19px; }

  .zb-sec-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--ink);
    font-size: var(--z-fs-lg, 14px);
    font-weight: 800;
    line-height: 1.4;
    white-space: nowrap;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-sec-title,
  .zb-section[aria-labelledby='zb-qa-title'] .zb-sec-title {
    font-size: var(--z-fs-lg, 14px) !important;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--ink);
    font-size: 12px;
    line-height: 1;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock > i:first-child {
    color: var(--brand);
    font-size: 16px;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock-time {
    font-size: 13px !important;
    font-weight: 800;
    letter-spacing: 0.3px;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock-sep {
    width: 1px;
    height: 14px;
    background: var(--border);
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock-date {
    color: var(--muted);
    font-size: 12px !important;
    font-weight: 600;
  }

  .zb-section[aria-labelledby='zb-kpi-title'] .zb-clock {
    height: auto;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .zb-count {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .zb-sec-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-inline-start: auto;
  }

  .zb-sec-links {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-inline-start: auto;
    font-size: 12px;
    font-weight: 700;
  }

  .zb-sec-links a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 30px;
    color: var(--ink);
  }

  .zb-sec-links a.muted {
    color: var(--muted);
    font-weight: 600;
  }

  .zb-sec-links a:hover {
    color: var(--brand);
  }

  /* ---------- period filter ---------- */
  .zb-filter {
    position: relative;
  }

  .zb-filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .zb-filter-btn > i:first-child {
    color: var(--brand);
    font-size: 14px;
  }

  .zb-filter-chev {
    color: var(--subtle);
    font-size: 11px;
  }

  .zb-filter-btn:hover,
  .zb-filter-btn[aria-expanded='true'] {
    border-color: color-mix(in srgb, var(--brand) 40%, transparent);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .zb-menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 6px);
    z-index: 60;
    width: 240px;
    padding: 6px;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 18px 44px -14px rgba(11, 21, 48, 0.4);
  }

  .zb-menu > button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .zb-menu > button:hover {
    background: color-mix(in srgb, var(--brand) 8%, transparent);
    color: var(--ink);
  }

  .zb-menu > button.on {
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 800;
  }

  .zb-menu-custom {
    margin-top: 4px;
    border-top: 1px solid var(--border-soft) !important;
    border-radius: 0 0 8px 8px !important;
  }

  .zb-menu-custom > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .zb-menu-custom i.rotated {
    transform: rotate(180deg);
  }

  .zb-custom {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 4px 4px;
  }

  .zb-icon-btn {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .zb-icon-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
  }

  /* ---------- clock ---------- */
  .zb-clock {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 0 20px;
    border: 1px solid #dce5f0;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: 0 2px 5px rgba(11, 21, 48, 0.05);
    color: var(--ink);
    font-size: 16px;
    white-space: nowrap;
  }

  .zb-clock > i:first-child {
    color: var(--brand);
    font-size: 16px;
  }

  .zb-clock-time {
    font-family: var(--num);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.3px;
    font-variant-numeric: tabular-nums;
  }

  .zb-clock-sep {
    width: 1px;
    height: 24px;
    background: var(--border);
  }

  .zb-clock-date {
    color: #6481a7;
    font-size: 14px;
    font-weight: 500;
  }

  /* ---------- KPI cards ---------- */
  .zb-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .zb-kpi {
    --c: #2f6fed;
    position: relative;
    display: flex;
    align-items: stretch;
    min-width: 0;
    width: 100%;
    height: 75.52px;
    min-height: 75.52px;
    padding: 8px 12px;
    border: 1px solid var(--c);
    border-radius: 12px;
    background: var(--c);
    box-shadow: 0 2px 5px rgba(11, 21, 48, 0.025);
    color: #fff;
    transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease), background 0.18s;
  }

  .zb-kpi:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 28px -18px var(--c);
  }

  .zb-kpi[data-hue='sale'] { --c: var(--erp-primary, #1479df); }
  .zb-kpi[data-hue='purchase'] { --c: #ea580c; }
  .zb-kpi[data-hue='expense'] { --c: #334155; }
  .zb-kpi[data-hue='profit'] { --c: #009f74; }

  .zb-kpi-ic {
    position: absolute;
    inset-inline-start: 12px;
    top: 50%;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 17px;
    transform: translateY(-50%);
  }

  .zb-kpi-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    line-height: 1.3;
    padding-inline-start: 48px;
  }

  .zb-kpi-label {
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .zb-kpi-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    margin-top: auto;
  }

  .zb-kpi-value {
    color: #fff;
    font-family: var(--num);
    font-size: 21px;
    font-weight: 900;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-kpi-unit {
    color: rgba(255, 255, 255, 0.82);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .zb-kpi-sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    overflow: visible;
    color: rgba(255, 255, 255, 0.88);
    font-size: 10px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-kpi-chip {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
  }

  .zb-kpi-sub b {
    color: #fff;
    font-family: var(--num);
    font-size: 10px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-sep {
    width: 1px;
    height: 10px;
    background: var(--border);
  }

  /* ---------- quick actions ---------- */
  .zb-qa-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 16px;
  }

  .zb-qa {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 160px;
    height: 65.33px;
    min-height: 65.33px;
    padding: 8px 12px;
    flex-direction: row;
    gap: 10px;
    justify-content: center;
    font-size: 14px;
    border: 1px solid #dce5f0;
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 2px 5px rgba(11, 21, 48, 0.025);
    color: var(--ink);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    letter-spacing: 0.1px;
    text-align: center;
    transition: transform 0.18s var(--ease), border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }

  .zb-qa:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--g) 40%, transparent);
    box-shadow: 0 10px 22px -14px var(--g);
  }

  .zb-qa[data-hue='sale'] {
    --g: var(--erp-primary, #1479df);
    border-color: transparent;
    background: linear-gradient(135deg, #2868e8 0%, #008bd1 100%);
    color: #fff;
  }
  .zb-qa[data-hue='sale']:hover { border-color: transparent; }
  .zb-qa[data-hue='receive'] { --g: #059669; }
  .zb-qa[data-hue='purchase'] { --g: #f97316; }
  .zb-qa[data-hue='product'] { --g: #3267e8; }
  .zb-qa[data-hue='expense'] { --g: #334155; }
  .zb-qa[data-hue='exchange'] { --g: #009f74; }

  .zb-qa-ic {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    align-self: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--g);
    color: #fff;
    font-size: 17px;
  }

  .zb-qa-ic i {
    display: block;
    margin: 0;
    line-height: 1;
  }

  .zb-qa[data-hue='sale'] .zb-qa-ic {
    background: rgba(255, 255, 255, 0.18);
  }

  /* ---------- search ---------- */
  .zb-search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 280px;
    max-width: 100%;
    height: 36px;
    min-height: 36px;
    margin-inline-start: auto;
    padding: 0 4px 0 12px;
    border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px -8px rgba(15, 23, 42, 0.12);
    transition: border-color 0.18s, box-shadow 0.18s;
  }

  .zb-search:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14), 0 6px 16px -10px rgba(47, 111, 237, 0.45);
  }

  .zb-search-ic {
    display: grid;
    order: -1;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: rgba(47, 111, 237, 0.09);
    color: var(--brand);
    font-size: 15px;
    transition: background 0.18s, color 0.18s;
  }

  .zb-search:focus-within .zb-search-ic {
    background: var(--brand);
    color: #fff;
  }

  .zb-search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
  }

  .zb-search input::placeholder {
    color: color-mix(in srgb, var(--ink) 42%, transparent);
    font-weight: 400;
  }

  /* ---------- layout rows ---------- */
  .zb-row-2 {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 14px;
    align-items: stretch;
  }

  .zb-row-3 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 14px;
    align-items: stretch;
  }

  .zb-row-3.duo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .zb-row-3.solo {
    grid-template-columns: minmax(0, 1fr);
  }

  .zb-row-2.solo {
    grid-template-columns: minmax(0, 1fr);
  }

  /* ---------- treasury ---------- */
  .zb-treasury {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 12px 14px;
    overflow: hidden;
    border-radius: 14px;
    background: linear-gradient(160deg, var(--navy) 0%, var(--navy-2) 100%);
    color: #cbd5e1;
  }

  .zb-treasury-glow {
    position: absolute;
    top: -80px;
    inset-inline-end: -50px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(47, 111, 237, 0.25);
    filter: blur(36px);
    pointer-events: none;
  }

  .zb-treasury-hd {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .zb-treasury-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 13.5px;
    font-weight: 800;
  }

  .zb-treasury-ic {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 15px;
  }

  .zb-treasury-link {
    color: #93b7f7;
    font-size: 12px;
    font-weight: 700;
  }

  .zb-treasury-hero {
    position: relative;
    line-height: 1.3;
  }

  .zb-treasury-cap {
    display: block;
    color: #94a3b8;
    font-size: 11px;
  }

  .zb-treasury-total {
    color: #fca5a5;
    font-family: var(--num);
    font-size: 20px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-treasury-total:not(.negative) {
    color: #fff;
  }

  .zb-treasury-total span {
    color: #94a3b8;
    font-size: 14px;
    font-weight: 700;
  }

  .zb-treasury-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .zb-treasury-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }

  .zb-treasury-badge {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
  }

  .zb-treasury-name {
    flex: 1;
    color: #e2e8f0;
    font-size: 12.5px;
  }

  .zb-treasury-amount {
    color: #fff;
    font-family: var(--num);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-treasury-amount.negative {
    color: #fca5a5;
  }

  /* ---------- alerts ---------- */
  .zb-alerts {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .zb-alerts-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface);
  }

  .zb-tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .zb-tile {
    --c: #d97706;
    --c-soft: var(--warn-soft);
    --c-text: var(--warn-text);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 7%, var(--surface));
    color: var(--ink);
    font-family: inherit;
    text-align: start;
    cursor: pointer;
    transition: border-color 0.18s, background 0.18s;
  }

  .zb-tile:hover {
    background: color-mix(in srgb, var(--c) 11%, var(--surface));
  }

  .zb-tile[data-hue='expiry'] {
    --c: #d97706;
    --c-soft: var(--warn-soft);
    --c-text: var(--warn-text);
  }

  .zb-tile[data-hue='stock'] {
    --c: #dc2626;
    --c-soft: var(--danger-soft);
    --c-text: var(--danger-text);
  }

  .zb-tile[data-hue='returns'] {
    --c: #2563eb;
    --c-soft: var(--brand-soft);
    --c-text: var(--brand);
  }

  .zb-tile[data-hue='wastes'] {
    --c: #64748b;
    --c-soft: var(--surface-3);
    --c-text: var(--text);
  }

  .zb-tile[aria-selected='true'] {
    border-color: color-mix(in srgb, var(--c) 45%, transparent);
    background: color-mix(in srgb, var(--c) 13%, var(--surface));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 12%, transparent);
  }

  .zb-tile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .zb-tile-ic {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--c-soft);
    color: var(--c-text);
    font-size: 14px;
  }

  .zb-tile-ic.text {
    font-size: 16px;
    font-weight: 800;
    line-height: 1;
  }

  .zb-tile-count {
    color: var(--ink);
    font-family: var(--num);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-tile-label {
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 700;
  }

  .zb-tile-note {
    overflow: hidden;
    max-width: 100%;
    color: var(--c-text);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-panel {
    padding: 4px;
    border: 1px solid var(--border-soft);
    border-radius: 12px;
    background: var(--surface-2);
  }

  .zb-panel-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 2px;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 700;
  }

  .zb-panel-hd a {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--brand);
    font-size: 11.5px;
    font-weight: 600;
  }

  .zb-panel-rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .zb-panel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px;
    border-radius: 10px;
    flex-wrap: wrap;
    transition: background 0.15s;
  }

  .zb-panel-row:hover {
    background: var(--surface);
  }

  .zb-panel-row.draft:hover {
    background: transparent;
  }

  .zb-panel-row.stock:hover {
    background: transparent;
  }

  .zb-panel-lead {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--surface-3);
    color: var(--text);
    font-size: 14px;
  }

  .zb-panel-lead[data-hue='warn'] {
    background: var(--warn-soft);
    color: var(--warn-text);
  }

  .zb-panel-lead[data-hue='danger'] {
    background: var(--danger-soft);
    color: var(--danger-text);
  }

  .zb-panel-lead[data-hue='ok'] {
    background: var(--ok-soft);
    color: var(--ok-text);
  }

  .zb-panel-lead[data-hue='muted'] {
    background: var(--surface-3);
    color: var(--text);
  }

  .zb-panel-lead[data-hue='draft-sale'] {
    background: #e0ebff;
    color: #2563eb;
  }

  .zb-panel-lead[data-hue='draft-purchase'] {
    background: #f1f5f9;
    color: #475569;
  }

  .zb-panel-lead.text {
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
  }

  .zb-panel-copy {
    display: flex;
    flex: 1 1 160px;
    flex-direction: column;
    min-width: 0;
    line-height: 1.35;
  }

  .zb-panel-title {
    overflow: hidden;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-panel-meta {
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* Value chip: the reference marks every alert row with a small tinted pill,
     so the eye can rank rows without reading the number. */
  .zb-panel-value {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text);
    font-family: var(--num);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-panel-value[data-hue='warn'] {
    background: var(--warn-soft);
    color: var(--warn-text);
  }

  .zb-panel-value[data-hue='danger'],
  .zb-panel-value.negative {
    background: var(--danger-soft);
    color: var(--danger-text);
  }

  .zb-panel-value[data-hue='ok'] {
    background: var(--ok-soft);
    color: var(--ok-text);
  }

  .zb-panel-value[data-hue='muted'] {
    background: var(--surface-3);
    color: var(--text);
  }

  .zb-panel-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
  }

  .zb a.zb-panel-open {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--muted);
    text-decoration: none;
  }

  .zb a.zb-panel-open:hover {
    background: var(--surface);
    color: var(--brand);
  }

  .zb a.zb-panel-review,
  .zb a.zb-panel-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 28px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font-size: 11.5px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }

  .zb a.zb-panel-review:hover,
  .zb a.zb-panel-action:hover {
    border-color: var(--border-strong);
    color: var(--ink);
  }

  .zb a.zb-panel-action {
    border-color: #2f6fed;
    background: #2f6fed;
    color: #ffffff;
  }

  .zb a.zb-panel-action:hover {
    border-color: #245bd0;
    background: #245bd0;
    color: #ffffff;
  }

  /* ---------- generic cards ---------- */
  .zb-card {
    --c: #2f6fed;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface);
  }

  .zb-card[data-hue='emerald'] { --c: #059669; }
  .zb-card[data-hue='cyan'] { --c: #0891b2; }

  .zb-card.matte {
    border-color: color-mix(in srgb, var(--c) 16%, transparent);
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
  }

  .zb-card-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .zb-card-title {
    --c: #2f6fed;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
    font-size: 13.5px;
    font-weight: 800;
    line-height: 1.4;
  }

  .zb-card-title[data-hue='emerald'] { --c: #059669; }
  .zb-card-title[data-hue='cyan'] { --c: #0891b2; }
  .zb-card-title[data-hue='indigo'] { --c: #4f46e5; }

  .zb-card-ic {
    --c: #2f6fed;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c) 16%, var(--surface));
    color: var(--c);
    font-size: 16px;
  }

  .zb-card-ic[data-hue='orange'] { --c: #ea580c; }
  .zb-card-ic[data-hue='emerald'] { --c: #059669; }
  .zb-card-ic[data-hue='cyan'] { --c: #0891b2; }
  .zb-card-ic[data-hue='rose'] { --c: #c24d6a; }
  .zb-card-ic[data-hue='teal'] { --c: #14917f; }
  .zb-card-ic[data-hue='indigo'] { --c: #4f46e5; }
  .zb-card-ic[data-hue='violet'] { --c: #c026d3; }

  .zb-chip {
    --c: #059669;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 14%, var(--surface));
    color: color-mix(in srgb, var(--c) 90%, var(--ink));
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }


  .zb-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .zb-btn.ghost {
    color: var(--brand);
  }

  /* The exchange-rate card tints its action with the card accent, as the
     reference does, instead of the default blue ghost button. */
  .zb-btn.zb-fx-set {
    border-color: color-mix(in srgb, var(--c) 30%, transparent);
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
    color: var(--c);
  }

  .zb-btn.primary {
    border-color: transparent;
    background: var(--brand);
    color: #fff;
  }

  .zb-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .zb-empty {
    display: block;
    padding: 10px 4px;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }

  .zb-empty.success {
    color: var(--ok);
  }

  /* ---------- debtors ---------- */
  .zb-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .zb-debtor {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 4px 6px;
    border-radius: 9px;
    transition: background 0.15s;
  }

  .zb-debtor:hover {
    background: color-mix(in srgb, #059669 7%, transparent);
  }

  .zb-avatar {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: color-mix(in srgb, #059669 14%, var(--surface));
    color: #059669;
    font-size: 11px;
    font-weight: 800;
  }

  .zb-debtor-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .zb-debtor-name {
    overflow: hidden;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-bar {
    display: block;
    height: 3px;
    margin-top: 3px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--surface-3);
  }

  .zb-bar > span {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: #059669;
  }

  .zb-bar[data-hue='blue'] > span {
    background: #2f6fed;
  }

  .zb-debtor-amount {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-debtor-amount small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  .zb-go {
    color: var(--subtle);
    font-size: 13px;
  }

  /* ---------- accounts ---------- */
  .zb-accounts {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface);
  }

  .zb-accounts > .zb-empty {
    flex: 1;
    align-self: center;
  }

  .zb-accounts-grid {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 1px;
    background: var(--border-soft);
  }

  .zb-account {
    --c: #2f6fed;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    padding: 8px 12px;
    background: var(--surface);
    transition: background 0.18s ease;
  }

  .zb-account:hover {
    background: var(--hover-bg);
  }

  .zb-account:focus-visible {
    outline: 2px solid #2f6fed;
    outline-offset: -2px;
  }

  .zb-account[data-hue='blue'] { --c: #3b6fe0; }
  .zb-account[data-hue='teal'] { --c: #14917f; }
  .zb-account[data-hue='cyan'] { --c: #2a8bb5; }
  .zb-account[data-hue='violet'] { --c: #7457d6; }
  .zb-account[data-hue='orange'] { --c: #c27a1e; }
  .zb-account[data-hue='slate'] { --c: #5b6b86; }
  .zb-account[data-hue='emerald'] { --c: #2f9e5b; }
  .zb-account[data-hue='rose'] { --c: #c24d6a; }

  .zb-account:hover .zb-account-ic {
    transform: scale(1.08);
    box-shadow: 0 6px 14px -6px var(--c);
  }

  .zb-account-top {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .zb-account-ic {
    --c: #2f6fed;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 14%, var(--surface));
    color: var(--c);
    font-size: 17px;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .zb-account-ic[data-hue='blue'] { --c: #3b6fe0; }
  .zb-account-ic[data-hue='teal'] { --c: #14917f; }
  .zb-account-ic[data-hue='rose'] { --c: #c24d6a; }
  .zb-account-ic[data-hue='emerald'] { --c: #2f9e5b; }
  .zb-account-ic[data-hue='orange'] { --c: #c27a1e; }
  .zb-account-ic[data-hue='violet'] { --c: #7457d6; }
  .zb-account-ic[data-hue='cyan'] { --c: #2a8bb5; }
  .zb-account-ic[data-hue='slate'] { --c: #5b6b86; }

  .zb-account-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  .zb-account-label {
    overflow: hidden;
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-account-value {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .zb-account-value b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-account-new {
    color: var(--ok);
    font-size: 10.5px;
    font-weight: 700;
  }

  .zb-account-go {
    color: var(--c);
    font-size: 16px;
    line-height: 1;
    opacity: 0;
    transform: translateX(6px);
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  :global([dir='ltr']) .zb-account-go {
    transform: translateX(-6px);
  }

  .zb-account:hover .zb-account-go,
  .zb-account:focus-visible .zb-account-go {
    opacity: 1;
    transform: none;
  }

  .zb-account-bar {
    display: block;
    width: 100%;
    height: 3px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-3);
  }

  .zb-account-bar > span {
    --c: #2f6fed;
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--c);
    opacity: 0.7;
  }

  .zb-account-bar > span[data-hue='blue'] { --c: #3b6fe0; }
  .zb-account-bar > span[data-hue='teal'] { --c: #14917f; }
  .zb-account-bar > span[data-hue='cyan'] { --c: #2a8bb5; }
  .zb-account-bar > span[data-hue='violet'] { --c: #7457d6; }
  .zb-account-bar > span[data-hue='orange'] { --c: #c27a1e; }
  .zb-account-bar > span[data-hue='slate'] { --c: #5b6b86; }
  .zb-account-bar > span[data-hue='emerald'] { --c: #2f9e5b; }
  .zb-account-bar > span[data-hue='rose'] { --c: #c24d6a; }

  /* ---------- exchange rates ---------- */
  .zb-fx-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .zb-fx-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .zb-fx-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 10px;
    background: transparent;
  }

  .zb-fx-badge {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--brand-soft);
    color: var(--brand);
    font-family: var(--num);
    font-size: 12px;
    font-weight: 800;
  }

  .zb-fx-name {
    display: flex;
    flex: 1;
    flex-direction: column;
    line-height: 1.25;
  }

  .zb-fx-name b {
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 700;
  }

  .zb-fx-name small {
    color: var(--muted);
    font-family: var(--num);
    font-size: 10.5px;
  }

  .zb-fx-value {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    line-height: 1.25;
    white-space: nowrap;
  }

  .zb-fx-rate {
    color: var(--ink);
    font-family: var(--num);
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-fx-rate small {
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
  }

  /* ---------- collapsed reports ---------- */
  .zb-more > summary {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 2px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--ink);
    list-style: none;
    cursor: pointer;
    user-select: none;
  }

  .zb-more > summary::-webkit-details-marker {
    display: none;
  }

  .zb-more > summary::after {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    bottom: -1px;
    width: 56px;
    height: 2px;
    border-radius: 2px;
    background: var(--brand);
    transition: width 0.3s var(--ease);
  }

  .zb-more > summary:hover::after,
  .zb-more[open] > summary::after {
    width: 140px;
  }

  .zb-more-ic {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--brand) 12%, var(--surface));
    color: var(--brand);
    font-size: 15px;
  }

  .zb-more > summary b {
    font-size: 14px;
    font-weight: 800;
  }

  .zb-more-sub {
    flex: 1;
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-chev {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-soft);
    border-radius: 50%;
    background: var(--surface);
    color: var(--brand);
    font-size: 12px;
    transition: transform 0.2s var(--ease), border-color 0.2s;
  }

  .zb-more > summary:hover .zb-chev {
    border-color: var(--brand);
  }

  .zb-more[open] .zb-chev {
    transform: rotate(180deg);
  }

  .zb-more-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 12px;
    padding: 14px;
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    background: var(--surface);
  }

  .zb-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .zb-block-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink);
    font-size: 12px;
    font-weight: 800;
  }

  .zb-block-title i {
    color: var(--brand);
    font-size: 14px;
  }

  .zb-trend-section-title {
    font-size: 14px;
  }

  .zb-trend-section-title i {
    font-size: 16px;
  }

  .zb-block-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-inline-start: 4px;
    color: var(--brand);
    font-size: 11px;
    font-weight: 600;
  }

  .zb-block-link:hover {
    text-decoration: underline;
  }

  .zb-block-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: stretch;
  }

  .zb-inventory-row { gap: 14px; }

  .zb-inventory-title {
    font-size: 13px;
    font-weight: 800;
  }

  .zb-inventory-title i {
    font-size: 17px;
  }

  /* ---------- financial trend ---------- */
  .zb-trend {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--brand) 13%, var(--border-soft));
    border-radius: 16px;
    background: color-mix(in srgb, var(--brand) 4%, var(--surface));
  }

  .zb-trend-hd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .zb-trend-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zb-trend-icon {
    display: inline-flex;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: rgba(47, 111, 237, 0.13);
    color: var(--brand);
    font-size: 16px;
  }

  .zb-trend-title b {
    color: var(--ink);
    font-size: 13.5px;
    font-weight: 800;
  }

  .zb-trend-title small {
    color: var(--subtle);
    font-size: 11px;
  }

  .zb-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .zb-period-group { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 9px; background: var(--surface-3); }
  .zb-period-group button { height: 28px; padding: 0 11px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .zb-period-group button.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(15,23,42,.12); }
  .zb-custom-range { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--hover-bg); }
  .zb-custom-range label { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 11.5px; }
  .zb-custom-range input { width: 92px; height: 28px; padding: 0 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--ink); font: inherit; font-size: 12px; }
  .zb-custom-range button { height: 28px; padding: 0 12px; border: 0; border-radius: 7px; background: var(--surface-3); color: var(--text); font: inherit; font-size: 12px; cursor: pointer; }
  .zb-custom-range button.preset { padding: 0 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font-size: 12px; font-weight: 600; }
  .zb-custom-range button.preset.active { border-color: var(--border-strong); background: var(--brand-soft); color: var(--link); }
  .zb-custom-separator { width: 1px; height: 20px; background: var(--border); }
  .zb-custom-range button.apply { background: var(--brand); color: #fff; font-weight: 700; }
  .zb-custom-range button[aria-label] { display: inline-flex; align-items: center; justify-content: center; width: 28px; padding: 0; background: transparent; color: var(--muted); }
  .zb-custom-range button[aria-label] i { font-size: 17px; }

  .zb-custom-chip { display: inline-flex; align-self: flex-start; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--hover-bg); color: var(--link); font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
  .zb-custom-chip i:first-child { font-size: 15px; }
  .zb-custom-chip i:last-child { font-size: 14px; }

  .zb-legend button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--hover-bg);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .zb-legend button.off {
    border-color: var(--border);
    background: var(--surface);
    color: var(--subtle);
  }

  .zb-legend button.off .dot {
    background: var(--subtle);
  }

  .zb-legend button:hover {
    border-color: var(--border-strong, #cbd5e1);
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2f6fed;
  }

  .dot.expense { background: #d97706; }
  .dot.sales { background: #2f6fed; }
  .dot.purchases { background: #64748b; }
  .dot.benefit { background: #16a34a; }
  .dot.net { background: #16a34a; }

  .zb-chart {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .zb-chart-plot {
    position: relative;
    height: 170px;
  }

  .zb-chart-grid {
    position: absolute;
    inset: 0 4px 0 40px;
  }

  .zb-grid-line {
    position: absolute;
    inset-inline: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .zb-grid-line span {
    position: absolute;
    inset-inline-start: -40px;
    width: 34px;
    color: var(--subtle);
    font-family: var(--num);
    font-size: 10.5px;
    text-align: right;
    transform: translateY(-50%);
  }

  .zb-grid-line i {
    flex: 1;
    border-top: 1px dashed var(--border);
  }

  .zb-chart-svg {
    position: absolute;
    inset: 0 4px 0 40px;
  }

  .zb-chart-svg svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .zb-area {
    fill: rgba(47, 111, 237, 0.08);
  }

  .zb-line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .zb-line.benefit {
    stroke: #16a34a;
    stroke-width: 2;
  }

  .zb-line.sales { stroke: #2f6fed; stroke-width: 2.5; }
  .zb-line.purchases { stroke: #64748b; stroke-width: 2; }

  .zb-line.expense {
    stroke: #d97706;
    stroke-width: 2;
    stroke-dasharray: 5 4;
  }

  .zb-chart-x {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 0 4px 0 40px;
    color: var(--muted);
    font-family: var(--num);
    font-size: 11px;
  }

  .zb-chart-x span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-trend-totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-soft);
  }

  .zb-trend-totals > div {
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .zb-trend-totals span {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 11px;
  }

  .zb-trend-totals b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-trend-totals b small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  .zb-trend-totals b.zb-money {
    width: 100%;
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    direction: ltr;
    unicode-bidi: isolate;
  }

  .zb-trend-totals b.zb-money small {
    order: -1;
    font-size: 11px;
    font-weight: 500;
  }

  /* ---------- returns & wastes ---------- */
  .zb-returns {
    --c: #c24d6a;
    display: flex;
    flex: 0 1 344.83px;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    width: 344.83px;
    height: 311.55px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--c) 13%, var(--border-soft));
    border-radius: 16px;
    background: color-mix(in srgb, var(--c) 4%, var(--surface));
  }

  .zb-returns-hd {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* The rose card is the design's plain `.tcard[data-c=rose]`: the title keeps
     the ink colour and the icon tile is a 15% tint of the module colour. */
  .zb-returns-title {
    flex-shrink: 0;
    color: var(--ink);
    white-space: nowrap;
  }

  .zb-returns-title .zb-card-ic {
    background: color-mix(in srgb, var(--c) 15%, var(--surface));
    color: var(--c);
  }

  .zb-returns-hd .zb-period-group {
    flex-shrink: 0;
    flex-wrap: nowrap;
  }

  .zb-returns-rows {
    display: flex;
    flex: 1 1 140px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .zb-return-content { display: flex; flex: 1; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px; }
  .zb-returns-dot { flex: 0 0 10px; width: 10px; height: 10px; border-radius: 3px; background: var(--dot, var(--subtle)); }
  .zb-returns-row.dot-0 { --dot: #d97706; }
  .zb-returns-row.dot-1 { --dot: #64748b; }
  .zb-returns-row.dot-2 { --dot: #dc2626; }
  .zb-return-donut { position: relative; flex: 0 0 132px; width: 132px; height: 132px; }
  .zb-return-donut-ring { position: absolute; inset: 0; overflow: hidden; border-radius: 50%; }
  .zb-return-donut-hole { position: absolute; inset: 13px; border-radius: 50%; background: color-mix(in srgb, var(--c) 4%, var(--surface)); }
  .zb-return-total { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.2; }
  .zb-return-donut small { color: var(--muted); font-size: 10.5px; }
  .zb-return-donut b { color: var(--ink); font-family: var(--num); font-size: 16px; font-weight: 800; }

  .zb-returns-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 9px;
    background: var(--surface-2);
    transition: background 0.15s;
    color: var(--ink);
    text-decoration: none;
  }

  .zb-returns-row:hover {
    background: var(--surface-3);
  }

  .zb-returns-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
  }

  .zb-returns-label small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 400;
  }

  .zb-returns-value {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.25;
  }

  .zb-returns-value > span {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-returns-value > small {
    color: var(--muted);
    font-family: var(--num);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .zb-returns-go {
    color: var(--subtle);
    font-size: 16px;
  }

  /*
   * The warehouse card is the design's `.tcard[aria-labelledby=wh]`: a 6%
   * tint of the module colour, a 16% border, and a heading tinted 75% toward
   * the module hue. The design paints this card with `--c: #C026D3`.
   */
  .zb-warehouse {
    --c: #c026d3;
    flex: 3 1 480px;
    gap: 10px;
    padding: 12px 14px;
    border-color: color-mix(in srgb, var(--c) 16%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
  }

  .zb-warehouse-hd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  /* Keep the title and unit on the same text baseline as the reference. */
  .zb-warehouse-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex-shrink: 0;
  }

  .zb-warehouse-title {
    /* Restated here because `.zb-card-title` seeds its own --c, and this is the
       fuchsia card (`--c: #C026D3` in the design), not the blue default. */
    --c: #c026d3;
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
    white-space: nowrap;
  }

  .zb-warehouse-title .zb-card-ic {
    background: color-mix(in srgb, var(--c) 16%, var(--surface));
    color: var(--c);
  }

  .zb-warehouse-sub {
    color: var(--subtle);
    font-size: 11px;
    white-space: nowrap;
  }

  .zb-warehouse-period {
    flex-wrap: nowrap;
    flex-shrink: 0;
  }

  .zb-warehouse-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    align-content: start;
    gap: 6px;
  }

  .zb-warehouse-item {
    position: relative;
    display: flex;
    min-width: 0;
  }

  .zb-warehouse-item.series0 { --series: #2f6fed; }
  .zb-warehouse-item.series1 { --series: #93b7f7; }
  .zb-warehouse-item.series2 { --series: #94a3b8; }

  .zb-warehouse-tile {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid color-mix(in srgb, var(--c) 14%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 6%, var(--surface));
    color: var(--ink);
    font: inherit;
    text-align: right;
    text-decoration: none;
    transition: background 0.15s;
  }

  .zb-warehouse-tile:hover {
    background: color-mix(in srgb, var(--c) 13%, var(--surface));
  }

  .zb-warehouse-item.hidden .zb-warehouse-tile {
    background: var(--surface);
    opacity: 0.55;
  }

  .zb-warehouse-item.hidden .zb-warehouse-name::before {
    background: var(--disabled);
  }

  .zb-warehouse-eye {
    position: absolute;
    top: 5px;
    left: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--subtle);
    cursor: pointer;
  }

  .zb-warehouse-eye:hover {
    background: var(--surface-3);
    color: var(--ink);
  }

  .zb-warehouse-eye:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 1px;
  }

  .zb-warehouse-eye i {
    font-size: 15px;
  }

  .zb-warehouse-name {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zb-warehouse-name::before {
    flex: 0 0 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--series, var(--c));
    content: '';
  }

  .zb-warehouse-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
    gap: 6px;
  }

  .zb-warehouse-value b {
    color: var(--ink);
    font-size: 15px;
    font-weight: 800;
    white-space: nowrap;
  }

  .zb-warehouse-change {
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .zb-warehouse-change.up { color: var(--ok-text); }
  .zb-warehouse-change.down { color: var(--warn-text); }

  .zb-warehouse-chart {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .zb-warehouse-plot {
    position: relative;
    height: 150px;
    min-width: 0;
  }

  .zb-warehouse-grid-line {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 0;
  }

  .zb-warehouse-grid-line span {
    flex: 0 0 34px;
    color: var(--subtle);
    font-size: 10.5px;
    text-align: right;
    white-space: nowrap;
  }

  .zb-warehouse-grid-line i {
    flex: 1;
    border-top: 1px dashed var(--border);
  }

  .zb-warehouse-plot-inner {
    position: absolute;
    inset: 0 4px 0 40px;
  }

  .zb-warehouse-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .zb-warehouse-area { fill: rgba(47, 111, 237, .08); }

  .zb-warehouse-line {
    fill: none;
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* Stroke only: a filled polyline paints its interior and turns the chart
     into a solid wedge (the reference lines are never filled). */
  .zb-warehouse-line.series0 { stroke: #2f6fed; }
  .zb-warehouse-line.series1 { stroke: #93b7f7; }
  .zb-warehouse-line.series2 { stroke: #94a3b8; }
  .zb-warehouse-line.series2 { stroke-dasharray: 5 4; }

  .zb-warehouse-x {
    display: flex;
    justify-content: space-between;
    padding: 0 4px 0 40px;
    color: var(--muted);
    font-size: 11px;
  }

  .zb-warehouse-x span {
    white-space: nowrap;
  }

  /* ---------- top products ---------- */
  .zb-top-products {
    --c: #4f46e5;
    gap: 4px;
  }

  .zb-top-products-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 4px;
  }

  .zb-top-products-hd > a {
    color: var(--link);
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
  }

  .zb-top-products-hd > a:hover {
    text-decoration: underline;
  }

  .zb-products {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .zb-product {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 6px;
    border-radius: 9px;
    transition: background 0.15s;
  }

  .zb-product:hover {
    background: var(--surface-2);
  }

  .zb-rank {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--surface-3);
    color: var(--muted);
    font-family: var(--num);
    font-size: 11.5px;
    font-weight: 800;
  }

  .zb-rank.top-three {
    background: var(--brand-soft);
    color: var(--link);
  }

  .zb-product-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    line-height: 1.3;
  }

  .zb-product-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }

  .zb-product-line b {
    overflow: hidden;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-product-line small {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .zb-top-products .zb-bar {
    height: 4px;
    margin-top: 0;
  }

  .zb-top-products .zb-product:not(:first-child) .zb-bar[data-hue='blue'] > span {
    background: #93b7f7;
  }

  .zb-product-value {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-product-value small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  /* ---------- subscription reminder ---------- */
  .zb-reminder {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid color-mix(in srgb, #d97706 32%, var(--border));
    border-radius: 12px;
    background: color-mix(in srgb, #d97706 7%, var(--surface));
  }

  .zb-reminder-ic {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: color-mix(in srgb, #d97706 14%, var(--surface));
    color: #b45309;
    font-size: 15px;
  }

  .zb-reminder-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    line-height: 1.35;
  }

  .zb-reminder-copy strong {
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 700;
  }

  .zb-reminder-copy span {
    color: var(--muted);
    font-size: 11.5px;
  }

  .zb-reminder-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--brand);
    font-size: 12px;
    font-weight: 700;
  }

  /* ---------- responsive ---------- */
  @media (max-width: 1100px) {
    .zb-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    .zb-row-2,
    .zb-row-2.solo,
    .zb-row-3,
    .zb-row-3.duo,
    .zb-row-3.solo {
      grid-template-columns: 1fr;
    }

    /* The reference folds the ten account cells into two rows of five on the
       tablet breakpoint before they collapse back to two columns on phones. */
    .zb-accounts-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .zb-search {
      margin-inline-start: 0;
      width: 100%;
      max-width: 320px;
    }
  }

  /* Phone geometry from the design: two KPI columns, three compact quick
     actions and tighter card padding. */
  @media (max-width: 767px) {
    .zb {
      gap: 12px;
    }

    .zb-warehouse-hd { flex-wrap: wrap; }
    .zb-warehouse-heading { flex: 1 1 100%; justify-content: space-between; }
    .zb-warehouse-period { max-width: 100%; }

    .zb-kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .zb-kpi {
      min-height: 190px;
      padding: 18px;
      border-radius: 22px;
    }

    .zb-kpi-ic {
      inset-inline-start: 18px;
      top: 18px;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      font-size: 19px;
    }

    .zb-kpi-value {
      font-size: clamp(22px, 5vw, 30px);
    }

    .zb-kpi-label { font-size: 14px; }
    .zb-kpi-unit { font-size: 12px; }
    .zb-kpi-chip { min-height: 28px; padding: 0 9px; font-size: 11px; }
    .zb-kpi-sub { gap: 5px; }
    .zb-kpi-welcome { font-size: 13px; }
    .zb-section[aria-labelledby='zb-kpi-title'] .zb-sec-hd { min-height: 80px; }
    .zb-clock { min-height: 44px; padding: 0 13px; gap: 8px; font-size: 13px; }
    .zb-clock-time { font-size: 16px; }
    .zb-clock-date { font-size: 12px; }

    .zb-qa-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .zb-qa {
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      width: 100%;
      height: auto;
      min-height: 0;
      padding: 10px 4px;
      text-align: center;
      font-size: 11.5px;
    }

    .zb-qa-ic {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      font-size: 15px;
    }
  }

  @media (max-width: 767px) {
    .zb-accounts-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .zb-sec-tools {
      width: 100%;
      justify-content: space-between;
    }

    .zb-clock-date,
    .zb-clock-sep {
      display: none;
    }

    .zb-chart-grid,
    .zb-chart-svg {
      inset-inline-start: 30px;
    }

    .zb-chart-x {
      padding-inline-start: 30px;
    }
  }

  /* Reference token alignment: the KPI and action cards use the light matte
     treatment from zeno-tokens.css while retaining SVSale's Bootstrap icons
     and the application's inherited typeface. */
  .zb .zb-kpi {
    --c: #4f46e5;
    display: flex;
    position: static;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    width: 244px;
    height: 75.52px;
    min-height: 75.52px;
    padding: 11px 13px;
    border: 1px solid color-mix(in srgb, var(--c) 14%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--c) 8%, var(--surface));
    box-shadow: none;
    color: var(--ink);
    transform: none;
  }

  .zb .zb-kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 22px -14px var(--c); }
  .zb .zb-kpi[data-hue='sale'] { --c: #4f46e5; }
  .zb .zb-kpi[data-hue='purchase'] { --c: #f97316; }
  .zb .zb-kpi[data-hue='expense'] { --c: #334155; }
  .zb .zb-kpi[data-hue='profit'] { --c: #7c3aed; }
  .zb .zb-kpi-ic { position: static; inset: auto; top: auto; transform: none; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--c) 16%, var(--surface)); color: var(--c); font-size: 16px; }
  .zb .zb-kpi-body { align-items: flex-start; justify-content: center; gap: 0; padding: 0; }
  .zb .zb-kpi-label { color: color-mix(in srgb, var(--c) 70%, var(--ink)); font-size: 11.5px; font-weight: 600; }
  .zb .zb-kpi-row { margin: 0; }
  .zb .zb-kpi-value { color: var(--ink); font-size: 17px; font-weight: 800; line-height: 1.35; }
  .zb .zb-kpi-unit { color: var(--muted); font-size: 10.5px; }
  .zb .zb-kpi-sub { flex-wrap: nowrap; gap: 4px; min-width: 0; overflow: hidden; color: var(--muted); font-size: 10.5px; }
  .zb .zb-kpi-chip { min-height: 0; padding: 0; border-radius: 0; background: transparent; }
  .zb .zb-kpi-chip + .zb-kpi-chip::before { content: ''; height: 10px; margin-inline-end: 4px; border-inline-start: 1px solid var(--border); }
  .zb .zb-kpi-sub b { color: var(--ink); font-size: 10.5px; }

  .zb .zb-qa-grid { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
  .zb .zb-qa {
    --g: #4f46e5;
    justify-content: flex-start;
    box-sizing: border-box;
    width: 160px;
    height: 65.33px;
    min-height: 65.33px;
    padding: 8px 10px 8px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(11,21,48,.04);
    color: var(--ink);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .1px;
    text-align: start;
    transition: border-color .18s, box-shadow .18s, transform .18s;
  }
  .zb .zb-qa:hover {
    background: var(--surface);
    border-color: color-mix(in srgb, var(--g) 40%, transparent);
    box-shadow: 0 10px 22px -14px var(--g);
    transform: translateY(-2px);
  }
  .zb .zb-qa > span:last-child {
    font-size: 13px;
    font-weight: 800;
    line-height: 1.3;
    letter-spacing: .1px;
    text-shadow: 0 1px 1px rgba(0,0,0,.12);
  }
  .zb .zb-qa[data-hue='sale'] { --g: #4f46e5; border-color: var(--border-soft); background: var(--surface); color: var(--ink); }
  .zb .zb-qa[data-hue='receive'] { --g: #059669; }
  .zb .zb-qa[data-hue='purchase'] { --g: #f97316; }
  .zb .zb-qa[data-hue='product'] { --g: #c026d3; }
  .zb .zb-qa[data-hue='expense'] { --g: #334155; }
  .zb .zb-qa[data-hue='exchange'] { --g: #0891b2; }
  .zb .zb-qa-ic { width: 34px; height: 34px; border-radius: 11px; background: var(--g); color: #fff; }
  .zb .zb-qa-ic i { display: flex; align-items: center; justify-content: center; width: 19px; height: 19px; font-size: 19px; line-height: 1; }
  .zb .zb-qa[data-hue='sale'] .zb-qa-ic { background: var(--g); color: #fff; }
  @media (max-width: 767px) {
    .zb .zb-kpi { width: 100%; height: 75.52px; min-height: 75.52px; padding: 11px 13px; border-radius: 14px; }
    .zb .zb-kpi-ic { position: static; inset: auto; width: 34px; height: 34px; border-radius: 10px; }
    .zb .zb-kpi-value { font-size: 17px; }
    .zb .zb-kpi-label { font-size: 11.5px; }
    .zb .zb-kpi-unit { font-size: 10.5px; }
    .zb .zb-kpi-chip { min-height: 0; padding: 0; }
    .zb .zb-qa { flex-direction: row; min-height: 48px; padding: 8px 10px 8px 14px; font-size: 13px; text-align: start; }
    .zb .zb-qa-ic { width: 34px; height: 34px; }
  }
</style>
