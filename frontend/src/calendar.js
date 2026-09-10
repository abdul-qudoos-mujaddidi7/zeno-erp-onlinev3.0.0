import { mount, unmount } from 'svelte';
import AppDatePicker from './components/common/AppDatePicker.svelte';

function parseDateOnly(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  const date = new Date(year, month, day, 12);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function getKabulDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function showDate(inputDate, context = 'default') {
  const date = parseDateOnly(inputDate);

  if (!date) {
    return context === 'forPDF' ? ['', '', ''] : inputDate;
  }

  const formatter = new Intl.DateTimeFormat(
    'fa-AF-u-ca-persian',
    context === 'forPDF'
      ? {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }
      : {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        },
  );

  const parts = formatter.formatToParts(date);

  const day =
    parts.find((part) => part.type === 'day')?.value || '';

  const month =
    parts.find((part) => part.type === 'month')?.value || '';

  const year =
    parts.find((part) => part.type === 'year')?.value || '';

  if (context === 'forPDF') {
    return [year, month, day];
  }

  const persianDate = `
    <span
      class="persian-date-display"
      dir="ltr"
    >
    <span dir="ltr">${year}</span>
    <span dir="rtl">${month}</span>
      <span dir="ltr">${day}</span>
      
      
    </span>
  `;

  if (context === 'justPersian') {
    return persianDate;
  }

  return `
    <small>${persianDate}</small>
    ${
      context === 'default'
        ? `
          <br />
          <small class="text-secondary" dir="ltr">
            ${String(inputDate).slice(0, 10)}
          </small>
        `
        : ''
    }
  `;
}

const mountedPickers = new Map();

function getDateLabel(input) {
  return (
    input.getAttribute('aria-label') ||
    input
      .closest('.date-field')
      ?.querySelector('label')
      ?.textContent?.trim() ||
    input
      .closest('.form-outline')
      ?.querySelector('label')
      ?.textContent?.trim() ||
    ''
  );
}

function enhanceDateInput(input, callback) {
  if (
    !(input instanceof HTMLInputElement) ||
    input.type !== 'date' ||
    input.dataset.appDatePicker === 'true' ||
    input.closest('.app-date-field')
  ) {
    return;
  }

  const host = document.createElement('div');
  host.className = 'legacy-app-date-picker-host';

  input.insertAdjacentElement('afterend', host);
  input.dataset.appDatePicker = 'true';
  input.classList.add('legacy-date-input');

  const component = mount(AppDatePicker, {
    target: host,
    props: {
      value: input.value || '',
      label: getDateLabel(input),
      required: input.required,
      disabled: input.disabled,
      min: input.min || '1921-03-22',
      max: input.max || '2051-03-21',

      onChange: (value) => {
        input.value = value || '';

        input.dispatchEvent(
          new Event('input', {
            bubbles: true,
          }),
        );

        input.dispatchEvent(
          new Event('change', {
            bubbles: true,
          }),
        );

        callback?.(
          input.dataset.bind || input.name || input.id || '',
          value || '',
        );
      },
    },
  });

  mountedPickers.set(input, {
    component,
    host,
  });
}

function setDatePickers(callback, root = document) {
  root
    ?.querySelectorAll?.('input[type="date"]')
    .forEach((input) => enhanceDateInput(input, callback));
}

function initGlobalDatePickers() {
  setDatePickers();

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node.matches?.('input[type="date"]')) {
          enhanceDateInput(node);
        }

        setDatePickers(undefined, node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}

function destroyDatePickers(root = document) {
  for (const [input, entry] of mountedPickers) {
    if (root !== document && !root.contains(input)) {
      continue;
    }

    unmount(entry.component);
    entry.host.remove();

    input.classList.remove('legacy-date-input');
    delete input.dataset.appDatePicker;

    mountedPickers.delete(input);
  }
}

export {
  showDate,
  setDatePickers,
  initGlobalDatePickers,
  destroyDatePickers,
};