<script>
  import DatePicker from '@hamedf/svelte-persian-datepicker';
  import { createEventDispatcher, onMount } from 'svelte';

  export let value = '';
  export let label = '';
  export let required = false;
  export let disabled = false;
  export let min = '1921-03-22';
  export let max = '2051-03-21';

  /*
   * Available calendars shown by the package.
   *
   * Examples:
   *   "fa"       -> Solar/Jalali only
   *   "en"       -> Gregorian only
   *   "fa,en"    -> both calendars
   *   "en,fa"    -> both calendars
   */
  export let calendarLocale = 'fa,en';

  /*
   * Controls how the visible input is displayed and parsed.
   *
   * Keep this as "auto" when both calendars are enabled:
   * - Gregorian calendar -> 2026-08-03
   * - Shamsi calendar    -> 1405/05/12
   *
   * The bound model/database value still remains Gregorian.
   */
  export let inputCalendar = 'auto';

  /*
   * Controls which calendar opens first.
   *
   * Values:
   *   "auto"
   *   "gregorian"
   *   "jalali"
   */
  export let defaultCalendar = 'auto';

  export let format = 'YYYY-MM-DD';
  export let inputFormat = undefined;
  export let displayFormat = undefined;

  export let onChange = () => {};

  /*
   * When enabled, pressing Enter while the date input is focused
   * emits an "enter" event instead of allowing the package to
   * consume Enter for its own keyboard handler.
   *
   * Keep this false by default so other date pickers remain unchanged.
   */
  export let enterMovesNext = false;

  const dispatch = createEventDispatcher();

  const AFGHAN_MONTH_MAP = Object.freeze({
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
  });

  let patchTimerIds = [];
  let calendarSwitchTimerIds = [];
  let pickerRoot;

  /*
   * True only when the user explicitly selects a calendar day.
   * This prevents initialization/model synchronization from being
   * treated as a user date selection.
   */
  let userDateSelectionPending = false;

  /*
   * Keep the picker mounted normally with its complete locale list.
   *
   * When it opens, use the package's own calendar-switch button.
   * This is important because the package's internal changeLocale()
   * function converts:
   *
   * - the current date,
   * - the visible month,
   * - the minimum/maximum dates,
   * - and selected values
   *
   * into the requested calendar.
   *
   * Changing only the locale prop does not perform that conversion
   * and can make an empty picker jump to its maximum year.
   */
  function clearCalendarSwitchTimers() {
    for (const timerId of calendarSwitchTimerIds) {
      clearTimeout(timerId);
    }

    calendarSwitchTimerIds = [];
  }

  function switchToDefaultCalendar() {
    if (
      defaultCalendar === 'auto' ||
      !pickerRoot
    ) {
      return;
    }

    const picker =
      pickerRoot.querySelector(
        '.pdp-picker',
      );

    if (!picker) {
      return;
    }

    /*
     * The picker uses:
     * - rtl for the Persian/Jalali calendar
     * - ltr for the Gregorian calendar
     */
    const isJalali =
      picker.classList.contains('rtl');

    const isGregorian =
      picker.classList.contains('ltr');

    const shouldSwitch =
      (defaultCalendar === 'gregorian' &&
        isJalali) ||
      (defaultCalendar === 'jalali' &&
        isGregorian);

    if (!shouldSwitch) {
      return;
    }

    const calendarSwitchButton =
      picker.querySelector(
        '.pdp-header .top button',
      );

    if (
      calendarSwitchButton instanceof
      HTMLButtonElement
    ) {
      calendarSwitchButton.click();
    }
  }

  function scheduleDefaultCalendarSwitch() {
    clearCalendarSwitchTimers();

    /*
     * The popup is created asynchronously after the open callback.
     * These one-time checks cover the first rendered frame.
     */
    calendarSwitchTimerIds = [
      setTimeout(
        switchToDefaultCalendar,
        0,
      ),
      setTimeout(
        switchToDefaultCalendar,
        30,
      ),
      setTimeout(
        switchToDefaultCalendar,
        80,
      ),
    ];
  }

  function handlePickerOpen() {
    scheduleDefaultCalendarSwitch();
    scheduleAfghanMonthPatch();
  }

  function escapeRegExp(value) {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
  }

  function replaceIranianMonths(value) {
    let result = String(value ?? '');

    for (
      const [iranianName, afghanName]
      of Object.entries(AFGHAN_MONTH_MAP)
    ) {
      const escapedName =
        escapeRegExp(iranianName);

      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}_])${escapedName}(?=$|[^\\p{L}\\p{N}_])`,
        'gu',
      );

      result = result.replace(
        pattern,
        (_, prefix) =>
          `${prefix}${afghanName}`,
      );
    }

    return result;
  }

  function patchTextNodes(root) {
    const walker =
      document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
      );

    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(
        walker.currentNode,
      );
    }

    for (const textNode of textNodes) {
      const currentValue =
        textNode.nodeValue || '';

      const nextValue =
        replaceIranianMonths(
          currentValue,
        );

      if (nextValue !== currentValue) {
        textNode.nodeValue =
          nextValue;
      }
    }
  }

  function patchElementAttributes(root) {
    root
      .querySelectorAll(
        'input, button, option, [title], [aria-label], [placeholder]',
      )
      .forEach((element) => {
        if (
          element instanceof HTMLInputElement &&
          typeof element.value === 'string'
        ) {
          const nextValue =
            replaceIranianMonths(
              element.value,
            );

          if (
            nextValue !==
            element.value
          ) {
            element.value =
              nextValue;
          }
        }

        for (
          const attributeName of [
            'title',
            'aria-label',
            'placeholder',
          ]
        ) {
          const currentValue =
            element.getAttribute(
              attributeName,
            );

          if (!currentValue) {
            continue;
          }

          const nextValue =
            replaceIranianMonths(
              currentValue,
            );

          if (
            nextValue !==
            currentValue
          ) {
            element.setAttribute(
              attributeName,
              nextValue,
            );
          }
        }
      });
  }

  function applyAfghanMonthNames() {
    if (
      typeof document ===
      'undefined'
    ) {
      return;
    }

    const pickerRoots =
      document.querySelectorAll(
        '.pdp, .pdp-container, .pdp-calendar',
      );

    for (const root of pickerRoots) {
      patchTextNodes(root);
      patchElementAttributes(root);
    }
  }

  function clearPatchTimers() {
    for (
      const timerId
      of patchTimerIds
    ) {
      clearTimeout(timerId);
    }

    patchTimerIds = [];
  }

  function scheduleAfghanMonthPatch() {
    clearPatchTimers();

    patchTimerIds = [
      setTimeout(
        applyAfghanMonthNames,
        0,
      ),
      setTimeout(
        applyAfghanMonthNames,
        40,
      ),
      setTimeout(
        applyAfghanMonthNames,
        120,
      ),
    ];
  }

  function normalizeValue(
    submittedValue,
  ) {
    if (
      typeof submittedValue ===
      'string'
    ) {
      value =
        submittedValue || '';
    } else {
      value = value || '';
    }

    return value;
  }

  function handleSubmit(
    submittedValue,
  ) {
    const nextValue =
      normalizeValue(
        submittedValue,
      );

    onChange(nextValue);

    /*
     * "change" is the normal value-update event.
     */
    dispatch(
      'change',
      nextValue,
    );

    /*
     * "select" is emitted only after the user clicks a valid day
     * or confirms a day with the keyboard.
     *
     * The purchase table uses this event for auto-next navigation.
     */
    if (userDateSelectionPending) {
      userDateSelectionPending = false;

      dispatch(
        'select',
        nextValue,
      );
    }

    scheduleAfghanMonthPatch();
  }

  function closePickerPopup() {
    if (!pickerRoot) return;

    const overlay =
      pickerRoot.querySelector(
        '.pdp-overlay',
      );

    if (
      overlay instanceof
      HTMLButtonElement
    ) {
      overlay.click();
    }
  }

  function handleDatePickerPointerDown(
    event,
  ) {
    const target =
      event.target instanceof
      Element
        ? event.target
        : null;

    /*
     * Mark only a selectable calendar day.
     * Month/year navigation and ordinary input focus do not count
     * as a completed date selection.
     */
    userDateSelectionPending =
      Boolean(
        target?.closest(
          '.pdp-day:not(.disabled)',
        ),
      );
  }

  function handleDateInputKeydown(
    event,
  ) {
    const eventTarget =
      event.target instanceof
      Element
        ? event.target
        : null;

    /*
     * Enter or Space on a calendar day is a real user selection.
     */
    if (
      (event.key === 'Enter' ||
        event.key === ' ') &&
      eventTarget?.closest(
        '.pdp-day:not(.disabled)',
      )
    ) {
      userDateSelectionPending = true;
      return;
    }

    if (
      !enterMovesNext ||
      event.key !== 'Enter'
    ) {
      return;
    }

    const target =
      event.target instanceof
      HTMLInputElement
        ? event.target
        : null;

    /*
     * Handle Enter only from the actual date text input.
     * Enter on calendar days/buttons must continue to work normally.
     */
    if (
      !target ||
      !target.classList.contains(
        'pdp-input',
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (
      typeof event.stopImmediatePropagation ===
      'function'
    ) {
      event.stopImmediatePropagation();
    }

    /*
     * Close this calendar before the parent focuses the next field.
     * The next date field can then open its own calendar normally.
     */
    closePickerPopup();

    dispatch('enter', {
      value,
    });
  }

  function handleLocalInteraction() {
    scheduleAfghanMonthPatch();
  }

  function handleDocumentInteraction(
    event,
  ) {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    if (
      target?.closest(
        '.pdp, .pdp-container, .pdp-calendar',
      )
    ) {
      scheduleAfghanMonthPatch();
    }
  }

  onMount(() => {
    scheduleAfghanMonthPatch();

    document.addEventListener(
      'click',
      handleDocumentInteraction,
      true,
    );

    return () => {
      clearPatchTimers();

      clearCalendarSwitchTimers();

      document.removeEventListener(
        'click',
        handleDocumentInteraction,
        true,
      );
    };
  });
</script>

<div
  bind:this={pickerRoot}
  class="app-date-field"
  class:disabled
  on:click={handleLocalInteraction}
  on:focusin={handleLocalInteraction}
  on:pointerdown|capture={handleDatePickerPointerDown}
  on:keydown|capture={handleDateInputKeydown}
>
  {#if label}
    <label class="date-label">
      {label}

      {#if required}
        <span class="required">
          *
        </span>
      {/if}
    </label>
  {/if}

  <DatePicker
    bind:model={value}
    mode="single"
    type="date"
    locale={calendarLocale}
    input_calendar={inputCalendar}
    {format}
    input_format={inputFormat}
    display_format={displayFormat}
    color="blue"
    clearable={false}
    auto_submit={true}
    {disabled}
    from={min}
    to={max}
    submit={handleSubmit}
    open={handlePickerOpen}
  />
</div>

<style>
  .app-date-field {
    display: grid;
    gap: 0.4rem;
    width: 100%;
    min-width: 0;
  }

  .app-date-field.disabled {
    pointer-events: none;
    opacity: 0.55;
  }

  .date-label {
    color: #344054;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .required {
    color: #d92d20;
  }

  :global(.app-date-field .pdp-icon) {
    display: none !important;
  }

  :global(.app-date-field input) {
    width: 100%;
    min-height: 2.875rem;
    padding-inline: 0.5rem !important;
    color: #172554;
    background: #ffffff;
    border: 1px solid #dce4f1;
    border-radius: 0.75rem !important;
    outline: none;
    text-align: center !important;
  }

  :global(
    .app-date-field
      .pdp.rtl
      .pdp-group
      .pdp-icon.pdp-inside
      + input
  ),
  :global(
    .app-date-field
      .pdp.ltr
      .pdp-group
      .pdp-icon.pdp-inside
      + input
  ) {
    padding-inline: 0.5rem !important;
  }

  :global(.app-date-field input:focus) {
    border-color: #2f6fed;
    box-shadow:
      0 0 0 3px
      rgba(47, 111, 237, 0.12);
  }

  :global(.pdp-container),
  :global(.pdp-calendar) {
    z-index: 100000 !important;
  }

  :global(html.dark .app-date-field) {
    color-scheme: dark;
  }

  :global(
    html.dark
      .app-date-field
      .date-label
  ) {
    color:
      var(
        --erp-text-soft,
        #cbd5e1
      );
  }

  :global(
    html.dark
      .app-date-field
      .pdp
  ) {
    --text-color:
      var(
        --erp-text,
        #e5edf8
      );

    --hover-color: #ffffff;

    --background:
      var(
        --erp-surface-soft,
        #172033
      );

    --border-color:
      var(
        --erp-border,
        #2b3a4f
      );

    --icon-background: #202b3d;
    --in-range-background: #1d2b40;
    --overlay-color:
      rgba(2, 6, 15, 0.72);

    --main-box-shadow:
      0 20px 48px
        rgba(0, 0, 0, 0.48),
      0 0 0 1px
        rgba(
          148,
          163,
          184,
          0.08
        );
  }

  :global(
    html.dark
      .app-date-field
      input
  ),
  :global(
    html.dark
      .app-date-field
      .pdp-input
  ) {
    border-color:
      var(
        --erp-border,
        #2b3a4f
      ) !important;

    background:
      var(
        --erp-surface-soft,
        #172033
      ) !important;

    color:
      var(
        --erp-text,
        #e5edf8
      ) !important;

    -webkit-text-fill-color:
      var(
        --erp-text,
        #e5edf8
      );
  }

  :global(
    html.dark
      .app-date-field
      input::placeholder
  ),
  :global(
    html.dark
      .app-date-field
      .pdp-input::placeholder
  ) {
    color: #718198 !important;
    -webkit-text-fill-color:
      #718198;
  }

  :global(
    html.dark
      .app-date-field
      input:focus
  ),
  :global(
    html.dark
      .app-date-field
      .pdp-input.pdp-focus
  ) {
    border-color:
      #60a5fa !important;

    background:
      #0f172a !important;

    box-shadow:
      0 0 0 3px
      rgba(
        96,
        165,
        250,
        0.18
      ) !important;
  }

  :global(
    html.dark
      .pdp
      .pdp-picker
  ),
  :global(
    html.dark
      .pdp
      .pdp-auto
  ),
  :global(
    html.dark
      .pdp
      .pdp-main
  ),
  :global(
    html.dark
      .pdp
      .pdp-header
  ),
  :global(
    html.dark
      .pdp
      .pdp-footer
  ) {
    border-color:
      var(
        --erp-border,
        #2b3a4f
      ) !important;

    background:
      var(
        --erp-surface,
        #111827
      ) !important;

    color:
      var(
        --erp-text,
        #e5edf8
      ) !important;
  }

  :global(
    html.dark
      .pdp
      .pdp-picker::after
  ) {
    border-bottom-color:
      var(
        --erp-surface,
        #111827
      ) !important;
  }

  :global(
    html.dark
      .pdp
      .pdp-weekday
  ),
  :global(
    html.dark
      .pdp
      .pdp-day
  ),
  :global(
    html.dark
      .pdp
      .pdp-month
  ),
  :global(
    html.dark
      .pdp
      .pdp-year
  ),
  :global(
    html.dark
      .pdp
      .pdp-arrow
  ) {
    color:
      var(
        --erp-text-soft,
        #cbd5e1
      ) !important;
  }

  :global(
    html.dark
      .pdp
      .pdp-day:not(.disabled):hover
  ),
  :global(
    html.dark
      .pdp
      .pdp-month:hover
  ),
  :global(
    html.dark
      .pdp
      .pdp-year:hover
  ) {
    background:
      #1d2b40 !important;

    color:
      #bfdbfe !important;
  }

  :global(
    html.dark
      .pdp
      .pdp-day.today
  ) {
    background:
      rgba(
        96,
        165,
        250,
        0.14
      ) !important;

    color:
      #93c5fd !important;
  }
</style>
