<script>
  import { createEventDispatcher } from 'svelte';
  import { t, lang } from '../../i18n/i18n';

  /*
   * Read-only journal details.
   *
   * Mirrors the reference «journal voucher view» card (`.jvd` in Journal.dc.html):
   * a 640px sheet with an 18px radius, a tinted gradient header carrying the type
   * tile, status chip, document number and a Jalali date card; a description
   * panel, one debit/credit story row per side, the posting lines table with its
   * totals footer, and a surface-2 action bar.
   *
   * Everything is rendered from the page's `journalView()` model so this file
   * never re-resolves account names, currencies or permissions.
   */
  export let view = null;

  const dispatch = createEventDispatcher();

  /* Wording the shared dictionary does not carry (the reference's own labels). */
  const L = {
    fa: {
      details: 'جزئیات سند', posted: 'ثبت شده', inactive: 'غیرفعال',
      debtor: 'بدهکار', creditor: 'طلبکار', side: 'جهت', total: 'جمع',
      balanced: 'متوازن', unbalanced: 'نامتوازن',
      editIn: 'ویرایش در', editDoc: 'ویرایش سند',
    },
    ps: {
      details: 'د سند تفصیل', posted: 'ثبت شوی', inactive: 'غیر فعال',
      debtor: 'بدهکار', creditor: 'طلبکار', side: 'لوری', total: 'ټول',
      balanced: 'متوازن', unbalanced: 'نامتوازن',
      editIn: 'سمون په', editDoc: 'د سند سمون',
    },
    en: {
      details: 'Journal details', posted: 'Posted', inactive: 'Inactive',
      debtor: 'Debit', creditor: 'Credit', side: 'Side', total: 'Total',
      balanced: 'Balanced', unbalanced: 'Unbalanced',
      editIn: 'Edit in', editDoc: 'Edit journal',
    },
  };

  $: dict = L[$lang] || L.fa;
  $: lbl = (key) => dict[key] || L.fa[key] || key;

  function close() {
    dispatch('close');
  }

  function handleOverlayClick(event) {
    if (event.currentTarget === event.target) close();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="jvd-overlay" role="presentation" on:click={handleOverlayClick}>
  <section class="jvd" role="dialog" aria-modal="true" aria-label={lbl('details')} dir={t('dir')}>
    <!-- Reference header: tinted wash, 40px type tile, type + status, doc chips,
         and the date card pinned to the far end. -->
    <header class="jvd__head">
      <button type="button" class="jvd__close" aria-label={t('Close')} on:click={close}>
        <span class="ms" aria-hidden="true">close</span>
      </button>

      <span class="jvd__tile" style={`--jvd-tone: ${view.typeColor};`} aria-hidden="true">
        <span class="ms">{view.typeIcon}</span>
      </span>

      <div class="jvd__titles">
        <div class="jvd__title-row">
          <b class="jvd__title">{view.typeLabel}</b>
          <span class="jvd__status" class:is-inactive={!view.active}>
            {view.active ? lbl('posted') : lbl('inactive')}
          </span>
        </div>
        <div class="jvd__chips">
          <span class="jvd__chip" dir="ltr">
            <span class="ms" aria-hidden="true">tag</span>{view.no}
          </span>
          {#if view.sourceLabel}
            <span class="jvd__chip jvd__chip--source">
              {t('Reference')}<b dir="ltr">{view.sourceLabel}</b>
            </span>
          {/if}
        </div>
      </div>

      <div class="jvd__date" dir="ltr">
        <b>{view.dateText}</b>
        <span class="jvd__date-sub">
          {#if view.gregorian}<span>{view.gregorian}</span>{/if}
          {#if view.time}
            <i aria-hidden="true"></i>
            <span class="jvd__time"><span class="ms" aria-hidden="true">schedule</span>{view.time}</span>
          {/if}
        </span>
      </div>
    </header>

    <div class="jvd__body">
      <div class="jvd__desc">
        <span class="ms" aria-hidden="true">notes</span>
        <span class="jvd__desc-text">
          <span class="jvd__desc-label">{t('Description')}</span>
          <span class="jvd__desc-body">{view.description}</span>
        </span>
      </div>

      {#if view.story.length}
        <div class="jvd__story">
          {#each view.story as group (group.side)}
            <div class="jvd__story-row" class:is-cr={group.side === 'cr'}>
              <span class="jvd__story-chip">
                <span class="ms" aria-hidden="true">{group.icon}</span>{lbl(group.side === 'dr' ? 'debtor' : 'creditor')}
              </span>
              <span class="jvd__story-names">{group.names}</span>
              <span class="jvd__story-amt" dir="ltr">{group.amount}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="jvd__table-wrap">
        <table class="jvd__table">
          <thead>
            <tr>
              <th>{t('Account')}</th>
              <th class="is-side">{lbl('side')}</th>
              <th class="is-amt">{lbl('debtor')}</th>
              <th class="is-amt">{lbl('creditor')}</th>
            </tr>
          </thead>
          <tbody>
            {#each view.lines as line (line.key)}
              <tr>
                <td>
                  <b class="jvd__acc">{line.name}</b>
                </td>
                <td class="is-side">
                  <span class="jvd__side" class:is-cr={!line.dr}>
                    {lbl(line.dr ? 'debtor' : 'creditor')}
                  </span>
                </td>
                <td class="is-amt is-dr" dir="ltr">{line.dr}</td>
                <td class="is-amt is-cr" dir="ltr">{line.cr}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">
                {lbl('total')}
                {#if view.balanced}
                  <span class="jvd__balance is-ok">· {lbl('balanced')} ✓</span>
                {:else}
                  <span class="jvd__balance is-bad">· {lbl('unbalanced')}</span>
                {/if}
              </td>
              <td class="is-amt is-dr" dir="ltr">{view.totalDr}</td>
              <td class="is-amt is-cr" dir="ltr">{view.totalCr}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <footer class="jvd__foot">
      <span class="jvd__hint">
        <span class="ms" aria-hidden="true">info</span>
        {view.sourceType ? `${lbl('editIn')} ${view.sourceType}` : lbl('editDoc')}
      </span>
      <span class="jvd__spacer"></span>

      {#if view.canDelete}
        <button type="button" class="jvd__btn is-danger" on:click={() => dispatch('delete')}>
          <span class="ms" aria-hidden="true">delete</span>{t('Delete')}
        </button>
      {/if}
      {#if view.editMode !== 'none'}
        <button type="button" class="jvd__btn" on:click={() => dispatch('edit')}>
          <span class="ms" aria-hidden="true">edit</span>{t('Edit')}
        </button>
      {/if}
      <button type="button" class="jvd__btn is-primary" on:click={() => dispatch('print')}>
        <span class="ms" aria-hidden="true">print</span>{t('Print')}
      </button>
    </footer>
  </section>
</div>

<style>
  .jvd-overlay {
    position: fixed;
    inset: 0;
    z-index: 10080;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Reference backdrop: .45 navy with a 3px blur. */
    padding: 16px 12px;
    background: rgba(11, 21, 48, 0.45);
    backdrop-filter: blur(3px);
    animation: jvdOverlayIn 160ms ease;
  }

  /* Reference sheet: 640px wide, 18px radius, deep 90px drop shadow. */
  .jvd {
    display: flex;
    flex-direction: column;
    width: 640px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 32px);
    border-radius: 18px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 40px 90px -24px rgba(11, 21, 48, 0.6);
    overflow: hidden;
    animation: jvdIn 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* --- header --- */
  .jvd__head {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #2f6fed 6%, var(--z-surface, #ffffff)),
      var(--z-surface, #ffffff)
    );
  }

  .jvd__close {
    flex-shrink: 0;
    align-self: flex-start;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-muted, #64748b);
    cursor: pointer;
  }

  .jvd__close .ms {
    font-size: 18px;
  }

  .jvd__close:hover {
    background: var(--z-border-soft, #eef2f7);
    color: var(--z-ink, #0b1530);
  }

  .jvd__tile {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    font-size: 22px;
    background: color-mix(in srgb, var(--jvd-tone, #2f6fed) 13%, transparent);
    color: var(--jvd-tone, #2f6fed);
  }

  .jvd__titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .jvd__title-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .jvd__title {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.1px;
    color: var(--z-ink, #0b1530);
  }

  /* Reference status chip: 20px pill, 10.5px/700, ok-soft. */
  .jvd__status {
    height: 20px;
    display: inline-flex;
    align-items: center;
    padding: 0 8px;
    border-radius: var(--z-r-pill, 999px);
    font-size: 10.5px;
    font-weight: 700;
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .jvd__status.is-inactive {
    background: var(--z-danger-soft, #fee2e2);
    color: var(--z-danger, #b91c1c);
  }

  .jvd__chips {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .jvd__chip {
    height: 22px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 7px;
    background: var(--z-surface, #ffffff);
    font-family: var(--z-font-num);
    font-size: 11px;
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  .jvd__chip .ms {
    font-size: 13px;
    color: var(--z-subtle, #94a3b8);
  }

  .jvd__chip--source {
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--z-muted, #64748b);
  }

  .jvd__chip--source b {
    font-family: var(--z-font-num);
    color: var(--z-ink, #0b1530);
  }

  /* Reference date card: surface card, 11px radius, Jalali 13.5/800. */
  .jvd__date {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    padding: 7px 11px;
    border: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 11px;
    background: var(--z-surface, #ffffff);
    line-height: 1.25;
  }

  .jvd__date b {
    font-family: var(--z-font-num);
    font-size: 13.5px;
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  .jvd__date-sub {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--z-font-num);
    font-size: 11px;
    font-weight: 600;
    color: var(--z-muted, #64748b);
    white-space: nowrap;
  }

  .jvd__date-sub i {
    width: 1px;
    height: 10px;
    background: var(--z-border, #e1e7f0);
  }

  .jvd__time {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--z-text, #475569);
  }

  .jvd__time .ms {
    font-size: 12px;
  }

  /* --- body --- */
  .jvd__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 18px 14px;
    overflow-y: auto;
  }

  .jvd__desc {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 11px;
    background: var(--z-surface-2, #f8fafc);
  }

  .jvd__desc > .ms {
    margin-top: 1px;
    font-size: 17px;
    color: var(--z-subtle, #94a3b8);
  }

  .jvd__desc-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.6;
  }

  .jvd__desc-label {
    font-size: 10.5px;
    font-weight: 800;
    color: var(--z-muted, #64748b);
  }

  .jvd__desc-body {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--z-ink, #0b1530);
  }

  /* Reference story: soft red/green bands with a solid side chip. */
  .jvd__story {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .jvd__story-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--z-debit-soft, #fdecec);
  }

  .jvd__story-row.is-cr {
    background: var(--z-credit-soft, #e7f6ec);
  }

  .jvd__story-chip {
    height: 22px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 9px;
    border-radius: var(--z-r-pill, 999px);
    font-size: 11px;
    font-weight: 800;
    color: #ffffff;
    background: var(--z-debit, #dc2626);
  }

  .jvd__story-row.is-cr .jvd__story-chip {
    background: var(--z-credit, #16a34a);
  }

  .jvd__story-chip .ms {
    font-size: 14px;
  }

  .jvd__story-names {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--z-ink, #0b1530);
  }

  .jvd__story-amt {
    font-family: var(--z-font-num);
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    color: var(--z-debit, #dc2626);
  }

  .jvd__story-row.is-cr .jvd__story-amt {
    color: var(--z-credit, #16a34a);
  }

  /* --- lines table --- */
  .jvd__table-wrap {
    border: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 12px;
    overflow: hidden;
  }

  .jvd__table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .jvd__table th {
    height: 32px;
    padding: 0 12px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface-2, #f8fafc);
    font-size: 10.5px;
    font-weight: 800;
    color: var(--z-muted, #64748b);
    text-align: start;
    white-space: nowrap;
  }

  .jvd__table th.is-side {
    width: 76px;
  }

  .jvd__table th.is-amt {
    width: 110px;
    /* Literal `left`, like the reference: the amount cells carry dir="ltr",
       so a logical `end` would resolve to the opposite edge and the numbers
       would drift away from their headings. */
    text-align: left;
  }

  .jvd__table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    vertical-align: middle;
  }

  .jvd__acc {
    font-weight: 700;
    line-height: 1.35;
    color: var(--z-ink, #0b1530);
  }

  /* Detail pill: 20px tall, 10.5/800, 8px inset (reference `l.sideS`). */
  .jvd__side {
    height: 20px;
    display: inline-flex;
    align-items: center;
    padding: 0 8px;
    border-radius: var(--z-r-pill, 999px);
    font-size: 10.5px;
    font-weight: 800;
    white-space: nowrap;
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .jvd__side.is-cr {
    background: var(--z-credit-soft, #e7f6ec);
    color: var(--z-credit, #16a34a);
  }

  .jvd__table td.is-amt {
    font-family: var(--z-font-num);
    font-weight: 800;
    text-align: left;
  }

  .jvd__table td.is-dr {
    color: var(--z-debit, #dc2626);
  }

  .jvd__table td.is-cr {
    color: var(--z-credit, #16a34a);
  }

  .jvd__table tfoot td {
    padding: 9px 12px;
    border-bottom: 0;
    background: var(--z-surface-2, #f8fafc);
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  .jvd__balance {
    font-size: 10.5px;
    font-weight: 700;
  }

  .jvd__balance.is-ok {
    color: var(--z-ok, #15803d);
  }

  .jvd__balance.is-bad {
    color: var(--z-danger, #b91c1c);
  }

  /* --- footer --- */
  .jvd__foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface-2, #f8fafc);
  }

  .jvd__hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--z-muted, #64748b);
  }

  .jvd__hint .ms {
    font-size: 15px;
  }

  .jvd__spacer {
    flex: 1;
  }

  .jvd__btn {
    height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 13px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 9px;
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #0b1530);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .jvd__btn .ms {
    font-size: 17px;
  }

  .jvd__btn:hover {
    background: var(--z-surface-3, #f1f5f9);
  }

  .jvd__btn.is-danger {
    border-color: color-mix(in srgb, #dc2626 28%, transparent);
    background: color-mix(in srgb, #dc2626 5%, var(--z-surface, #ffffff));
    color: var(--z-debit, #dc2626);
  }

  .jvd__btn.is-danger:hover {
    background: color-mix(in srgb, #dc2626 10%, var(--z-surface, #ffffff));
  }

  .jvd__btn.is-primary {
    border: 0;
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
    box-shadow: 0 6px 14px -6px rgba(47, 111, 237, 0.6);
  }

  .jvd__btn.is-primary:hover {
    background: color-mix(in srgb, var(--z-brand, #2f6fed) 88%, #000000);
  }

  @media (max-width: 620px) {
    .jvd__head {
      flex-wrap: wrap;
    }

    .jvd__date {
      width: 100%;
      align-items: flex-start;
    }

    .jvd__foot {
      flex-wrap: wrap;
    }

    .jvd__hint {
      flex: 1 0 100%;
    }
  }

  @keyframes jvdOverlayIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes jvdIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
