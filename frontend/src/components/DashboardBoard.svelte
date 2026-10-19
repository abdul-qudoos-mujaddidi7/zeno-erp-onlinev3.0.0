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
  export let period = 'today';
  export let customStart = '';
  export let customEnd = '';

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
  const PERIODS = ['today', 'week', 'month', 'year'];

  let showPeriodMenu = false;
  let showCustomDates = false;
  let fromDate = customStart;
  let toDate = customEnd;

  $: periodLabels = {
    today: t('Today'),
    week: t('This Week'),
    month: t('This Month'),
    year: t('This Year'),
    custom: t('Custom'),
  };
  $: currentPeriodLabel = periodLabels[period] || periodLabels.today;

  function pickPeriod(next) {
    showPeriodMenu = false;
    showCustomDates = false;
    if (next === period) return;
    dispatch('period', next);
  }

  function toggleCustomDates() {
    showCustomDates = !showCustomDates;
    if (showCustomDates) {
      fromDate = customStart;
      toDate = customEnd;
    }
  }

  function applyCustom() {
    if (!fromDate || !toDate || fromDate > toDate) return;
    showPeriodMenu = false;
    showCustomDates = false;
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
  const CHART_H = 220;
  const CHART_TOP = 10;

  let visible = [true, true, true, true];
  let transactionFilter = 'all';
  $: filteredTransactions = (data?.transactions || []).filter((row) =>
    transactionFilter === 'all' || row.kind === transactionFilter,
  );

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
    return (CHART_H - CHART_TOP - ratio * (CHART_H - CHART_TOP)).toFixed(1);
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
    top: `${(1 - ratio) * 100}%`,
  }));

  $: xLabels = (trend.labels || []).filter((label, index, list) => {
    if (list.length <= 8) return true;
    const step = Math.ceil(list.length / 8);
    return index % step === 0 || index === list.length - 1;
  });

  $: benefitTotal = (trend.benefit || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: expenseTotal = (trend.expenses || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: salesTotal = (trend.sales || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: purchasesTotal = (trend.purchases || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  $: returnsTotal = (data?.reports?.returns || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0);

  function returnSegment(index) {
    const rows = data?.reports?.returns || [];
    const circumference = 251.327;
    const amount = Math.max(0, Number(rows[index]?.value) || 0);
    const prior = rows.slice(0, index).reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0);
    const ratio = returnsTotal ? amount / returnsTotal : 0;
    return `stroke-dasharray:${ratio * circumference} ${circumference};stroke-dashoffset:${-prior / (returnsTotal || 1) * circumference}`;
  }

  function returnPercent(value) {
    return returnsTotal > 0 ? `${Math.round((Number(value) || 0) / returnsTotal * 100)}%` : '0%';
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

          <div class="zb-treasury-actions">
            <a href="/dashboard/transfers/list" use:link>
              <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
              {t('Transfer')}
            </a>
            <a href="/dashboard/journals/list" use:link class="soft">
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {t('Receive / Pay')}
            </a>
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
                    <span class="zb-tile-ic"><i class="bi {tile.icon}" aria-hidden="true"></i></span>
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
                  {t('Open')}
                  <i class="bi bi-box-arrow-up-left" aria-hidden="true"></i>
                </a>
              </header>

              <div class="zb-panel-rows" role="list">
                {#if !filteredPanelRows.length}
                  <span class="zb-empty">{t('No Data')}</span>
                {:else}
                  {#each filteredPanelRows as row, index (index)}
                    <div class="zb-panel-row" role="listitem">
                      <span class="zb-panel-lead" data-hue={row.hue}><i class="bi {row.icon}" aria-hidden="true"></i></span>
                      <span class="zb-panel-copy">
                        <span class="zb-panel-title">{row.title}</span>
                        {#if row.meta}<span class="zb-panel-meta">{row.meta}</span>{/if}
                      </span>
                      <span class="zb-panel-value" class:negative={row.negative} dir="ltr">{row.value}</span>
                      <span class="zb-panel-actions">
                        <a class="zb-panel-open" href={row.href || activePanel.href} use:link title={t('Open')} aria-label={`${t('Open')}: ${row.title}`}>
                          <i class="bi bi-box-arrow-up-left" aria-hidden="true"></i>
                        </a>
                        <a class="zb-panel-review" href={activePanel.href} use:link>{t('Review')}</a>
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
              <span class="zb-card-ic"><i class="bi bi-person-lines-fill" aria-hidden="true"></i></span>
              {t('Top Debtors')}
            </h3>
            <span class="zb-chip" data-hue="emerald">
              {t('Total')} {fmt(data.market.debtors.sum)} {t(data.market.debtors.currency)}
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
                    <small>{t(debtor.currency)}</small>
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
              <a class="zb-account" href={account.href} use:link title={account.label}>
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
            <h3 class="zb-card-title" data-hue="cyan">
              <span class="zb-card-ic"><i class="bi bi-currency-exchange" aria-hidden="true"></i></span>
              {t('Exchange Rate')}
              <span class="zb-fx-time" dir="ltr">{data.market.fx.updated}</span>
            </h3>
            <a href={data.market.fx.href} use:link class="zb-btn ghost">
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
                  <span class="zb-fx-value" dir="ltr">
                    {rate.rate}
                    <small>{t(data.currency)}</small>
                  </span>
                </div>
              {/each}
            {/if}
          </div>

          <span class="zb-fx-note">
            <i class="bi bi-broadcast" aria-hidden="true"></i>
            {t('Live rates')}
          </span>
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
          <h3 class="zb-block-title">
            <i class="bi bi-graph-up" aria-hidden="true"></i>
            {t('Financial Trend')}
          </h3>

            <section class="zb-trend" aria-label={t('Financial Trend')}>
              <header class="zb-trend-hd">
                <div class="zb-trend-title">
                  <b>{t('Sales')} / {t('Expenses')}</b>
                  <small>{t(data.currency)} · {currentPeriodLabel}</small>
                </div>
                <div class="zb-period-group" role="group" aria-label={t('Chart range')}>
                  {#each PERIODS as range (range)}
                    <button type="button" class:active={period === range} aria-pressed={period === range}
                      on:click={() => pickPeriod(range)}>{periodLabels[range]}</button>
                  {/each}
                  <button type="button" class:active={showCustomDates} aria-expanded={showCustomDates}
                    on:click={toggleCustomDates}>{periodLabels.custom}</button>
                </div>
                <div class="zb-legend">
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
              </header>

              {#if showCustomDates}
                <div class="zb-custom-range" role="group" aria-label={t('Custom date range')}>
                  <label>{t('From')}<input type="date" bind:value={fromDate} /></label>
                  <label>{t('To')}<input type="date" bind:value={toDate} /></label>
                  <button type="button" class="apply" on:click={applyCustom}>{t('Apply')}</button>
                  <button type="button" aria-label={t('Close')} on:click={() => (showCustomDates = false)}><i class="bi bi-x-lg"></i></button>
                </div>
              {/if}

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
                  <b dir="ltr">{fmt(salesTotal)} <small>{t(data.currency)}</small></b>
                </div>
                <div>
                  <span><i class="dot purchases"></i>{t('Purchases')}</span>
                  <b dir="ltr">{fmt(purchasesTotal)} <small>{t(data.currency)}</small></b>
                </div>
                <div>
                  <span><i class="dot benefit"></i>{t('Benefit')}</span>
                  <b dir="ltr">{fmt(data.totals?.benefit ?? benefitTotal)} <small>{t(data.currency)}</small></b>
                </div>
                <div>
                  <span><i class="dot expense"></i>{t('Expenses')}</span>
                  <b dir="ltr">{fmt(data.totals?.expenses ?? expenseTotal)} <small>{t(data.currency)}</small></b>
                </div>
              </div>
            </section>

          </div>

        <div class="zb-block">
          <h3 class="zb-block-title"><i class="bi bi-boxes" aria-hidden="true"></i>{t('Inventory & Returns')}</h3>
          <div class="zb-block-row">
            <section class="zb-returns" aria-label={t('Returns & Wastes')}>
              <h4 class="zb-returns-title">
                <span class="zb-card-ic" data-hue="orange"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></span>
                {t('Returns & Wastes')}
              </h4>

              <div class="zb-return-content">
                <div class="zb-return-donut" aria-hidden="true">
                  <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" class="zb-return-track"></circle>
                    {#each data.reports.returns as row, index (row.label)}
                      <circle cx="50" cy="50" r="40" class="zb-return-segment" class:seg-0={index === 0} class:seg-1={index === 1} class:seg-2={index === 2} style={returnSegment(index)}></circle>
                    {/each}
                  </svg>
                  <div><small>{t('Total')}</small><b>{fmt(returnsTotal)}</b><small>{t(data.currency)}</small></div>
                </div>
                <div class="zb-returns-rows">
                  {#each data.reports.returns as row (row.label)}
                    <a class="zb-returns-row" href={row.href} use:link>
                      <span>{row.label}<small>{fmt(row.count)} {t('Bills')}</small></span>
                      <b dir="ltr">{fmt(row.value)} <small>{t(data.currency)}</small></b>
                      <em dir="ltr">{returnPercent(row.value)}</em>
                    </a>
                  {/each}
                </div>
              </div>
            </section>

          <section class="zb-card zb-warehouse" aria-label={t('Warehouses')}>
            <header class="zb-warehouse-hd">
              <span>{t('Warehouse stock value')}</span>
              <small>{t(data.currency)} · {t('Current')}</small>
            </header>
            {#if data.inventory?.warehouses?.length}
              <div class="zb-warehouse-list">
                {#each data.inventory.warehouses as warehouse (warehouse.id)}
                  <a class="zb-warehouse-row" href={warehouse.href} use:link>
                    <span class="zb-warehouse-name">{warehouse.name}</span>
                    <span class="zb-warehouse-bar"><i style={`width:${warehouse.share}%`}></i></span>
                    <b dir="ltr">{warehouse.value == null ? '—' : fmt(warehouse.value)} {#if warehouse.value != null}<small>{t(data.currency)}</small>{/if}</b>
                  </a>
                {/each}
              </div>
            {:else}
              <span class="zb-empty">{t('No Data')}</span>
            {/if}
          </section>
          </div>
        </div>

        {#if data.reports.topProducts?.length}
          <div class="zb-block">
            <h3 class="zb-block-title">
              <i class="bi bi-trophy" aria-hidden="true"></i>
              {t('Top Products')}
              <a class="zb-block-link" href="/dashboard/product-alerts?tab=products" use:link>
                {t('Open')}
                <i class="bi bi-box-arrow-up-left" aria-hidden="true"></i>
              </a>
            </h3>
            <section class="zb-card" aria-label={t('Top Products')}>
              <div class="zb-products">
                {#each data.reports.topProducts as product, index (product.name)}
                  <div class="zb-product">
                    <span class="zb-rank" dir="ltr">{index + 1}</span>
                    <span class="zb-product-body">
                      <span class="zb-product-line">
                        <b>{product.name}</b>
                        {#if product.code}<small>{product.code}</small>{/if}
                      </span>
                      <span class="zb-bar" data-hue="blue"><span style={`width:${product.share}%`}></span></span>
                    </span>
                    <span class="zb-product-value" dir="ltr">{fmt(product.revenue)} <small>{t(data.currency)}</small></span>
                  </div>
                {/each}
              </div>
            </section>
          </div>
        {/if}

        <div class="zb-block">
          <h3 class="zb-block-title"><i class="bi bi-receipt" aria-hidden="true"></i>{t('Transactions')}</h3>
          <section class="zb-card zb-transactions" aria-label={t('Transactions')}>
            <div class="zb-transaction-tabs" role="tablist" aria-label={t('Transaction type')}>
              {#each [
                { key: 'all', label: t('All') },
                { key: 'sale', label: t('Sales') },
                { key: 'purchase', label: t('Purchases') },
                { key: 'journal', label: t('Journals') },
                { key: 'exchange', label: t('Exchange') },
              ] as filter (filter.key)}
                <button type="button" role="tab" aria-selected={transactionFilter === filter.key}
                  on:click={() => (transactionFilter = filter.key)}>{filter.label}</button>
              {/each}
            </div>
            <div class="zb-transaction-scroll">
              <table>
                <thead><tr>
                  <th>{t('Type')}</th><th>{t('Number')}</th><th>{t('Account')}</th>
                  <th>{t('Date')}</th><th>{t('Status')}</th><th>{t('Amount')}</th>
                </tr></thead>
                <tbody>
                  {#if filteredTransactions.length}
                    {#each filteredTransactions as row (`${row.kind}-${row.id}`)}
                      <tr>
                        <td><span class="zb-transaction-type" data-kind={row.kind}>{row.label}</span></td>
                        <td dir="ltr">{row.number}</td>
                        <td>{row.party}</td>
                        <td dir="ltr">{row.date ? new Intl.DateTimeFormat(_lang || 'en', { dateStyle: 'short' }).format(new Date(row.date)) : '—'}</td>
                        <td>{row.status ?? '—'}</td>
                        <td dir="ltr"><a href={row.href} use:link>{fmt(row.amount)} <small>{t(row.currency)}</small></a></td>
                      </tr>
                    {/each}
                  {:else}
                    <tr><td class="zb-table-empty" colspan="6">{t('No Data')}</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </details>
  {/if}

  <footer class="zb-footer">
    <span><i aria-hidden="true"></i>{t('Online')} · {clockTime}</span>
    <span>{t('Zeno ERP')} {data?.appVersion}</span>
  </footer>
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
    --border: #e1e7f0;
    --border-soft: #eef2f7;
    --ink: #0b1530;
    --text: #475569;
    --muted: #64748b;
    --subtle: #94a3b8;
    --brand: #2f6fed;
    --brand-soft: #e3ecff;
    --navy: #0b1530;
    --navy-2: #132042;
    --ok: #15803d;
    --ok-soft: #dcfce7;
    --danger: #b91c1c;
    --danger-soft: #fee2e2;
    --warn: #92400e;
    --warn-soft: #fef3c7;
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
    --border: #1e2c4f;
    --border-soft: #18254a;
    --ink: #f1f5fb;
    --text: #b4c0da;
    --muted: #8a96b8;
    --subtle: #6b79a0;
    --brand-soft: #16295a;
    --ok-soft: #0f3324;
    --danger-soft: #3b1219;
    --warn-soft: #3a2a0a;
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

  .zb-treasury-actions {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: auto;
    padding-top: 4px;
  }

  .zb-treasury-actions a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 34px;
    border-radius: 9px;
    background: #2f6fed;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }

  .zb-treasury-actions a.soft {
    background: rgba(255, 255, 255, 0.1);
  }

  .zb-treasury-actions a:hover {
    filter: brightness(1.08);
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
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
    width: 155.67px;
    height: 81.75px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: color-mix(in srgb, var(--c) 7%, var(--surface));
    color: var(--ink);
    font-family: inherit;
    text-align: start;
    cursor: pointer;
    transition: border-color 0.18s, box-shadow 0.18s;
  }

  .zb-tile[data-hue='expiry'] { --c: #d97706; }
  .zb-tile[data-hue='stock'] { --c: #dc2626; }
  .zb-tile[data-hue='returns'] { --c: #2563eb; }
  .zb-tile[data-hue='wastes'] { --c: #64748b; }

  .zb-tile[aria-selected='true'] {
    border-color: color-mix(in srgb, var(--c) 55%, transparent);
    background: color-mix(in srgb, var(--c) 13%, var(--surface));
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
    background: color-mix(in srgb, var(--c) 12%, var(--surface));
    color: var(--c);
    font-size: 14px;
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
    color: color-mix(in srgb, var(--c) 85%, var(--text));
    font-size: 11px;
    font-weight: 500;
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
    padding: 6px 10px;
    border-radius: 10px;
    flex-wrap: wrap;
    transition: background 0.15s;
  }

  .zb-panel-row:hover {
    background: var(--surface);
  }

  .zb-panel-lead {
    --c: #64748b;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--c) 12%, var(--surface));
    color: var(--c);
    font-size: 13px;
  }

  .zb-panel-lead[data-hue='warn'] { --c: #d97706; }
  .zb-panel-lead[data-hue='danger'] { --c: #dc2626; }
  .zb-panel-lead[data-hue='ok'] { --c: #15803d; }
  .zb-panel-lead[data-hue='muted'] { --c: #64748b; }

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

  .zb-panel-value {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-panel-value.negative {
    color: #dc2626;
  }

  .zb-panel-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
  }

  .zb-panel-open {
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

  .zb-panel-open:hover {
    background: var(--surface);
    color: var(--brand);
  }

  .zb-panel-review {
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

  .zb-panel-review:hover {
    border-color: var(--border-strong);
    color: var(--ink);
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
    color: color-mix(in srgb, var(--c) 72%, var(--ink));
    font-size: 13.5px;
    font-weight: 800;
    line-height: 1.4;
  }

  .zb-card-title[data-hue='emerald'] { --c: #059669; }
  .zb-card-title[data-hue='cyan'] { --c: #0891b2; }

  .zb-card-ic {
    --c: #2f6fed;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c) 15%, var(--surface));
    color: var(--c);
    font-size: 15px;
  }

  .zb-card-ic[data-hue='orange'] { --c: #ea580c; }

  .zb-chip {
    --c: #059669;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 12%, var(--surface));
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
    gap: 7px;
    min-width: 0;
    min-height: 58px;
    padding: 9px 10px;
    background: var(--surface);
    transition: background 0.15s;
  }

  .zb-account:hover {
    background: var(--surface-2);
  }

  .zb-account-top {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .zb-account-ic {
    --c: #2f6fed;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--c) 12%, var(--surface));
    color: var(--c);
    font-size: 15px;
  }

  .zb-account-ic[data-hue='emerald'] { --c: #059669; }
  .zb-account-ic[data-hue='orange'] { --c: #ea580c; }
  .zb-account-ic[data-hue='violet'] { --c: #7c3aed; }
  .zb-account-ic[data-hue='cyan'] { --c: #0891b2; }
  .zb-account-ic[data-hue='slate'] { --c: #475569; }

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
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .zb-account-value {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .zb-account-value b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-account-new {
    color: var(--ok);
    font-size: 10.5px;
    font-weight: 700;
  }

  .zb-account-go {
    color: var(--subtle);
    font-size: 12px;
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
  }

  .zb-account-bar > span[data-hue='emerald'] { --c: #059669; }
  .zb-account-bar > span[data-hue='orange'] { --c: #ea580c; }
  .zb-account-bar > span[data-hue='violet'] { --c: #7c3aed; }
  .zb-account-bar > span[data-hue='cyan'] { --c: #0891b2; }
  .zb-account-bar > span[data-hue='slate'] { --c: #475569; }

  /* ---------- exchange rates ---------- */
  .zb-fx-time {
    color: var(--subtle);
    font-family: var(--num);
    font-size: 11px;
    font-weight: 500;
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
    background: var(--surface-2);
  }

  .zb-fx-note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: auto;
    padding-top: 2px;
    color: var(--subtle);
    font-size: 10.5px;
    font-weight: 500;
  }

  .zb-fx-badge {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: color-mix(in srgb, #0891b2 12%, var(--surface));
    color: #0891b2;
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
    color: var(--ink);
    font-family: var(--num);
    font-size: 13.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-fx-value small {
    color: var(--muted);
    font-size: 10.5px;
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

  /* ---------- financial trend ---------- */
  .zb-trend {
    display: flex;
    flex: 3 1 480px;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface);
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
    align-items: baseline;
    gap: 8px;
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
  .zb-period-group button { min-height: 26px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .zb-period-group button.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(11,21,48,.08); }
  .zb-custom-range { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
  .zb-custom-range label { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 11.5px; }
  .zb-custom-range input { width: 136px; height: 28px; padding: 0 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--ink); font: inherit; font-size: 11.5px; }
  .zb-custom-range button { height: 28px; padding: 0 11px; border: 0; border-radius: 7px; background: var(--surface-3); color: var(--text); font: inherit; font-size: 11.5px; cursor: pointer; }
  .zb-custom-range button.apply { background: var(--brand); color: #fff; font-weight: 700; }

  .zb-legend button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .zb-legend button.off {
    opacity: 0.45;
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
  .dot.net { background: #16a34a; }

  .zb-chart {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .zb-chart-plot {
    position: relative;
    height: 180px;
  }

  .zb-chart-grid {
    position: absolute;
    inset: 0 0 0 38px;
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
    inset-inline-start: -38px;
    width: 32px;
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
    inset: 0 0 0 38px;
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
    padding: 0 4px 0 38px;
    color: var(--muted);
    font-family: var(--num);
    font-size: 10.5px;
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

  /* ---------- returns & wastes ---------- */
  .zb-returns {
    display: flex;
    flex: 1 1 240px;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--border-soft);
    border-radius: 16px;
    background: var(--surface);
  }

  .zb-returns-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink);
    font-size: 13px;
    font-weight: 800;
  }

  .zb-returns-rows {
    display: flex;
    flex: 1 1 140px;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .zb-return-content { display: flex; flex: 1; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px; }
  .zb-return-donut { position: relative; flex: 0 0 132px; width: 132px; height: 132px; }
  .zb-return-donut svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .zb-return-donut circle { fill: none; stroke-width: 13; }
  .zb-return-track { stroke: var(--surface-3); }
  .zb-return-segment { stroke-linecap: butt; }
  .zb-return-segment.seg-0 { stroke: #d97706; }
  .zb-return-segment.seg-1 { stroke: #64748b; }
  .zb-return-segment.seg-2 { stroke: #dc2626; }
  .zb-return-donut > div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.2; }
  .zb-return-donut small { color: var(--muted); font-size: 10.5px; }
  .zb-return-donut b { color: var(--ink); font-family: var(--num); font-size: 16px; font-weight: 800; }

  .zb-returns-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    transition: background 0.15s;
  }

  .zb-returns-row:hover {
    background: var(--surface-3);
  }

  .zb-returns-row > span {
    flex: 1;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }

  .zb-returns-row b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .zb-returns-row b small {
    color: var(--muted);
    font-size: 10px;
    font-weight: 500;
  }

  .zb-returns-row em {
    min-width: 22px;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, #ea580c 12%, var(--surface));
    color: #ea580c;
    font-family: var(--num);
    font-size: 10.5px;
    font-style: normal;
    font-weight: 700;
    text-align: center;
  }

  .zb-returns-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: auto;
    padding-top: 9px;
    border-top: 1px solid var(--border-soft);
  }

  .zb-returns-total span {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 600;
  }

  .zb-returns-total b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .zb-returns-total b small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  .zb-warehouse {
    gap: 8px;
  }

  .zb-warehouse-hd,
  .zb-warehouse-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .zb-warehouse-hd {
    justify-content: space-between;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 700;
  }

  .zb-warehouse-hd small,
  .zb-warehouse-row b small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 500;
  }

  .zb-warehouse-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 6px;
  }

  .zb-warehouse-row {
    min-width: 0;
    padding: 7px 9px;
    border-radius: 9px;
    background: var(--surface-2);
  }

  .zb-warehouse-name {
    flex: 0 1 110px;
    overflow: hidden;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zb-warehouse-bar {
    flex: 1;
    height: 4px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-3);
  }

  .zb-warehouse-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #2f6fed;
  }

  .zb-warehouse-row b {
    color: var(--ink);
    font-family: var(--num);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .zb-transactions {
    gap: 8px;
  }

  .zb-transaction-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--surface-3);
    align-self: flex-start;
  }

  .zb-transaction-tabs button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .zb-transaction-tabs button[aria-selected='true'] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(11, 21, 48, .08);
  }

  .zb-transaction-scroll { overflow-x: auto; }
  .zb-transactions table { width: 100%; min-width: 620px; border-collapse: separate; border-spacing: 0; text-align: start; font-size: 12px; }
  .zb-transactions th { padding: 7px 10px; background: var(--surface-2); color: var(--muted); font-size: 11px; font-weight: 600; white-space: nowrap; }
  .zb-transactions th:first-child { border-start-start-radius: 8px; }
  .zb-transactions th:last-child { border-start-end-radius: 8px; text-align: end; }
  .zb-transactions td { padding: 8px 10px; border-bottom: 1px solid var(--border-soft); color: var(--text); white-space: nowrap; }
  .zb-transactions td:nth-child(3) { color: var(--ink); font-weight: 600; }
  .zb-transactions td:last-child { text-align: end; color: var(--ink); font-family: var(--num); font-weight: 800; }
  .zb-transactions td:last-child a { color: inherit; }
  .zb-transactions td:last-child small { color: var(--muted); font-family: inherit; font-size: 10.5px; font-weight: 500; }
  .zb-transaction-type { display: inline-flex; align-items: center; gap: 5px; }
  .zb-transaction-type::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #2f6fed; }
  .zb-transaction-type[data-kind='purchase']::before { background: #64748b; }
  .zb-transaction-type[data-kind='journal']::before { background: #d97706; }
  .zb-transaction-type[data-kind='exchange']::before { background: #0891b2; }
  .zb-table-empty { padding: 20px !important; text-align: center; color: var(--muted) !important; }

  /* ---------- top products ---------- */
  .zb-products {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .zb-product {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 4px 6px;
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
    border-radius: 8px;
    background: color-mix(in srgb, #2f6fed 11%, var(--surface));
    color: var(--brand);
    font-family: var(--num);
    font-size: 11px;
    font-weight: 800;
  }

  .zb-product-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .zb-product-line {
    display: flex;
    align-items: baseline;
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
    color: var(--subtle);
    font-family: var(--num);
    font-size: 10.5px;
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

  .zb-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px; color: var(--subtle); font-size: 11px; }
  .zb-footer span:first-child { display: inline-flex; align-items: center; gap: 6px; }
  .zb-footer span:first-child i { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }

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

  @media (max-width: 640px) {
    .zb-sec-tools {
      width: 100%;
      justify-content: space-between;
    }

    .zb-clock-date,
    .zb-clock-sep {
      display: none;
    }

    .zb-accounts-grid {
      grid-template-columns: 1fr;
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
  .zb .zb-kpi-sub { flex-wrap: nowrap; gap: 5px; color: var(--muted); font-size: 11px; }
  .zb .zb-kpi-chip { min-height: 0; padding: 0; border-radius: 0; background: transparent; }
  .zb .zb-kpi-chip + .zb-kpi-chip::before { content: ''; height: 10px; margin-inline-end: 5px; border-inline-start: 1px solid var(--border); }
  .zb .zb-kpi-sub b { color: var(--ink); font-size: 11px; }

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
  .zb .zb-qa-ic { width: 34px; height: 34px; border-radius: 11px; background: color-mix(in srgb, var(--g) 13%, var(--surface)); color: var(--g); }
  .zb .zb-qa-ic i { font-size: 19px; }
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
