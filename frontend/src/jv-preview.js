/*
 * Throw-away render harness for the Add Journal voucher (see jv-preview.html).
 *
 * The production dialog is mounted untouched; only `fetch` is stubbed so the
 * reference reads return a small, realistic organisation. Delete this file,
 * jv-preview.html and jv-preview.svelte once the screenshot work is done.
 */
import { mount } from 'svelte';
import './app.css';
import 'material-symbols/rounded.css';
import './components/common/quick-action-modal.css';
import './components/common/track-picker.css';

const ACCOUNT_TYPES = [
  { id: 1, name: 'Assets', name_fa: 'دارایی', name_ps: 'شتمنې', status: 1 },
  { id: 2, name: 'Liabilities', name_fa: 'بدهی‌ها', name_ps: 'پورونه', status: 1 },
  { id: 3, name: 'Suppliers', name_fa: 'عرضه‌کنندگان', name_ps: 'عرضه کوونکي', status: 1 },
  { id: 4, name: 'Customers', name_fa: 'مشتریان', name_ps: 'پیرودونکي', status: 1 },
  { id: 5, name: 'Expenses', name_fa: 'مصارف', name_ps: 'لګښتونه', status: 1 },
  { id: 6, name: 'Revenue', name_fa: 'عواید', name_ps: 'عواید', status: 1 },
  { id: 7, name: 'Equity', name_fa: 'سرمایه', name_ps: 'پانګه', status: 1 },
];

const ACCOUNTS = [
  { id: 1, code: 'CASH-1', name: 'Cash Box', name_fa: 'صندوق نقدی', name_ps: 'نغدي صندوق', account_type_id: 1, status: 1, account_status: 'active' },
  { id: 2, code: 'TREASURY', name: 'Treasury', name_fa: 'خزانه', name_ps: 'خزانه', account_type_id: 1, status: 1, account_status: 'active' },
  { id: 3, code: 'NOTRACK', name: 'No Track', name_fa: 'بدون مدرک', name_ps: 'بې سند', account_type_id: 1, status: 1, account_status: 'active' },
  { id: 4, code: 'C-1001', name: 'Lal Gul Pharmacy', name_fa: 'لمعان درملتون', name_ps: 'لمعان درملتون', account_type_id: 4, can_be_customer: 1, status: 1, account_status: 'active' },
  { id: 5, code: 'C-1002', name: 'Noor Gul Pharmacy', name_fa: 'نور درملتون', name_ps: 'نور درملتون', account_type_id: 4, can_be_customer: 1, status: 1, account_status: 'active' },
  { id: 6, code: 'C-1003', name: 'Karwan Restaurant', name_fa: 'کاروان رستورانت', name_ps: 'کاروان رستورانت', account_type_id: 4, can_be_customer: 1, status: 1, account_status: 'active' },
  { id: 7, code: 'S-2001', name: 'Zahid Traders', name_fa: 'زاہد تجارتی', name_ps: 'زاہد تجارتی', account_type_id: 3, can_be_supplier: 1, status: 1, account_status: 'active' },
  { id: 8, code: 'S-2002', name: 'Balkh Supply Co', name_fa: 'شرکت تدارکاتی بلخ', name_ps: 'بلخ عرضه شرکت', account_type_id: 3, can_be_supplier: 1, status: 1, account_status: 'active' },
  { id: 9, code: 'E-500', name: 'Rent', name_fa: 'کرایه', name_ps: 'کرایه', account_type_id: 5, status: 1, account_status: 'active' },
];

const BALANCES = {
  1: { AFN: 254300.5, USD: 1200 },
  2: { AFN: -1520000, USD: -4200 },
  3: { AFN: 0, USD: 0 },
  4: { AFN: -14078.2, USD: 0 },
  5: { AFN: -14078.2, USD: 0 },
  6: { AFN: -8757, USD: -200 },
  7: { AFN: -22150, USD: 0 },
  8: { AFN: -9800, USD: 0 },
  9: { AFN: 2250, USD: 0 },
};

const CURRENCIES = [
  { id: 1, code: 'AFN', name: 'Afghani', name_fa: 'افغانی', symbol: '؋', isDefault: 1, status: 1 },
  { id: 2, code: 'USD', name: 'US Dollar', name_fa: 'دالر امریکایی', symbol: '$', isDefault: 0, status: 1 },
];

const BILLS = [
  {
    id: 4418,
    invoice_number: 'POS-6109',
    invoice_no: '#4481',
    invoice_date: '2026-09-30',
    invoice_status: 'confirmed',
    total_amount: 14078.2,
    remaining_amount: 14078.2,
    currency: 'AFN',
    account_id: 4,
    status: 1,
  },
  {
    id: 4419,
    invoice_number: 'POS-1944',
    invoice_no: '#4482',
    invoice_date: '2026-08-06',
    invoice_status: 'confirmed',
    total_amount: 5439.5,
    remaining_amount: 5439.5,
    currency: 'AFN',
    account_id: 4,
    status: 1,
  },
  {
    id: 4420,
    invoice_number: 'POS-6111',
    invoice_no: '#4483',
    invoice_date: '2026-06-16',
    invoice_status: 'confirmed',
    total_amount: 37560,
    remaining_amount: 37560,
    currency: 'AFN',
    account_id: 4,
    status: 1,
  },
];

const json = (body, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init) => {
  const url = String(input && input.url ? input.url : input);
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const method = String(init?.method || (input && input.method) || 'GET').toUpperCase();

  if (path.startsWith('/api/v2/account-types')) return json({ data: ACCOUNT_TYPES });
  if (path.startsWith('/api/v2/accounts/balances')) return json({ data: BALANCES });
  if (path.startsWith('/api/v2/accounts')) return json({ data: ACCOUNTS });
  if (path.startsWith('/api/v2/currencies')) return json({ data: CURRENCIES });
  if (path.startsWith('/api/v2/settings')) {
    return json({ data: [{ id: 1, key: 'enable_notrack', value: '1' }] });
  }
  if (path.startsWith('/api/v2/sales')) return json({ data: BILLS, meta: { total: BILLS.length } });
  if (path.startsWith('/api/v2/purchases')) return json({ data: [], meta: { total: 0 } });
  if (path.startsWith('/api/v2/journals')) {
    if (method === 'POST') {
      const body = JSON.parse(init?.body || '{}');
      window.__jvPreview.posted = body;
      return json({ data: { ...body, id: 9001 } });
    }
    return json({ data: [] });
  }
  if (path.startsWith('/api/')) return json({ data: [] });

  return nativeFetch(input, init);
};

const { default: Preview } = await import('./jv-preview.svelte');

/* ---- optional scripted run: ?fill=14078.2&submit=1&counter=1 ---- */
const params = new URLSearchParams(location.search);

/*
 * Pins live in localStorage and are read on mount, so they have to be
 * seeded before the dialog mounts: ?pins=2,4
 */
if (params.get('pins')) {
  localStorage.setItem('zeno.jvPins', JSON.stringify(params.get('pins').split(',')));
}

mount(Preview, { target: document.getElementById('app') });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function prove(label, payload) {
  const box = document.createElement('pre');
  box.id = 'prove';
  box.textContent = label + '\n' + JSON.stringify(payload, null, 1);
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;max-width:380px;margin:0;padding:8px 10px;' +
    'background:#0b1530;color:#b9f6ca;border-radius:8px;font:11px/1.5 monospace;direction:ltr;' +
    'white-space:pre-wrap;box-shadow:0 10px 30px rgba(11,21,48,.45)';
  document.body.appendChild(box);
}

async function drive() {
  const fill = params.get('fill');
  const side = params.get('side') === 'cr' ? 'cr' : 'dr';

  if (params.get('lang')) {
    const { setLanguage } = await import('./i18n/i18n.js');
    setLanguage(params.get('lang'));
    await wait(250);
  }

  if (params.get('counter') === '1') {
    const tab = document.querySelector('.jv-tab--cr');
    if (tab) tab.click();
    await wait(200);
  }

  if (fill) {
    const input = document.getElementById(side === 'cr' ? 'first_entry_credit' : 'first_entry_debit');
    if (input) {
      input.value = fill;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(250);
  }

  if (params.get('customer')) {
    const input = document.getElementById('form_account_search');
    if (input) {
      input.dispatchEvent(new FocusEvent('focus'));
      await wait(300);
      const row = [...document.querySelectorAll('.jv-dd .jv-opt')][Number(params.get('customer'))];
      if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await wait(400);
    }
  }

  if (params.get('billopen') === '1') {
    const input = document.getElementById('journal_bill_search');
    if (input) input.dispatchEvent(new FocusEvent('focus'));
    await wait(350);
  }

  if (params.get('bill') === '1') {
    const bill = document.querySelector('.jv-bill-opt:not(.jv-bill-opt--clear)');
    if (bill) bill.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wait(250);
  }

  if (params.get('ddsearch')) {
    const input = document.getElementById('form_account_panel_search');
    if (input) {
      input.focus();
      input.value = params.get('ddsearch');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(300);
    prove('customer search', {
      open: Boolean(document.querySelector('.jv-dd')),
      rows: document.querySelectorAll('.jv-dd .jv-opt').length,
      names: [...document.querySelectorAll('.jv-dd .jv-opt__copy strong')].map((el) =>
        el.textContent.trim(),
      ),
    });
  }

  if (params.get('ddpin')) {
    const pin = [...document.querySelectorAll('.jv-opt__pin')][Number(params.get('ddpin'))];
    if (pin) pin.click();
    await wait(350);
    prove('customer pin', {
      stored: localStorage.getItem('zeno.jvPins'),
      open: Boolean(document.querySelector('.jv-dd')),
      first: [...document.querySelectorAll('.jv-dd .jv-opt__copy strong')].map((el) =>
        el.textContent.trim(),
      )[0],
    });
  }

  if (params.get('picker')) {
    if (params.get('wait')) await wait(Number(params.get('wait')));
    const pick = document.querySelector(
      params.get('picker') === 'toggle' ? '.jv-account-toggle' : '.jv-account-select',
    );
    if (pick) pick.click();
    await wait(350);
  }

  if (params.get('psearch')) {
    const search = document.getElementById('jvp-search');
    if (search) {
      search.value = params.get('psearch');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(250);
    prove('search', {
      query: params.get('psearch'),
      rows: document.querySelectorAll('.jvp-row').length,
      empty: Boolean(document.querySelector('.jvp-empty')),
      sections: [...document.querySelectorAll('.jvp-sect')].map((s) => s.textContent.trim()),
    });
  }

  if (params.get('pin')) {
    const pin = [...document.querySelectorAll('.jvp-pin')][Number(params.get('pin'))];
    if (pin) pin.click();
    await wait(250);
    prove('pin toggle', {
      stored: localStorage.getItem('zeno.jvPins'),
      sections: [...document.querySelectorAll('.jvp-sect')].map((s) => s.textContent.trim()),
      rows: document.querySelectorAll('.jvp-row').length,
    });
  }

  if (params.get('row')) {
    const row = [...document.querySelectorAll('.jvp-row')][Number(params.get('row'))];
    const label = row ? row.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : 'missing';
    if (row) row.click();
    await wait(300);
    prove('pick row', {
      row: label,
      pickerClosed: !document.querySelector('.jvp-modal'),
      trigger: document
        .getElementById('second_entry_account_search')
        ?.textContent.replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60),
    });
  }

  if (params.get('newacc') === '1') {
    const chip = document.querySelector('.jvp-new');
    if (chip) chip.click();
    await wait(600);
    prove('new account chip', {
      pickerClosed: !document.querySelector('.jvp-modal'),
      appModals: [...document.querySelectorAll('.app-modal')].map(
        (el) => el.querySelector('.app-modal__title')?.textContent.trim() || '(untitled)',
      ),
      formFields: document.querySelectorAll('.app-modal input').length,
    });
  }

  if (params.get('outside') === '1') {
    const layer = document.querySelector('.jvp-layer');
    if (layer) layer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(250);
    prove('outside click', { pickerClosed: !document.querySelector('.jvp-modal') });
  }

  if (params.get('submit') === '1') {
    /* Real click path: the button's handler runs saveJournal(). */
    const save = document.querySelector('.jv-btn--save');
    if (save) save.click();
    await wait(900);
    const { get } = await import('svelte/store');
    const { toasts } = await import('./ToastUI/toastStore.js');
    prove('POST /api/v2/journals', {
      posted: window.__jvPreview.posted || '(nothing posted)',
      toasts: get(toasts).map((item) => `${item.type}: ${item.title} ${item.message || ''}`.trim()),
    });
  }
}

await wait(700);
await drive();

if (params.get('jvpdebug') === '1') {
  const m = document.querySelector('.jvp-modal');
  const t0 = document.getElementById('second_entry_account_search');
  const cs = m ? getComputedStyle(m) : null;
  const rectOf = (el) => {
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  prove('jvp debug', {
    trigger: rectOf(t0),
    panel: rectOf(m),
    panelStyle: m?.getAttribute('style'),
    panelMaxHeight: cs?.maxHeight,
    listScroll: (() => {
      const l = document.querySelector('.jvp-list');
      return l ? `${l.clientHeight}/${l.scrollHeight}` : 'missing';
    })(),
    inner: `${window.innerWidth}x${window.innerHeight}`,
  });
}

if (params.get('cust') === '1') {
  const box = document.querySelector('.jv-acc');
  const rect = box?.getBoundingClientRect();
  const text = (selector) =>
    document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '(none)';
  prove('customer box', {
    empty: Boolean(box?.classList.contains('is-empty')),
    size: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'missing',
    tile: Boolean(document.querySelector('.jv-acc__tile')),
    name: text('.jv-acc__name'),
    meta: text('.jv-acc__meta'),
    balance: text('.jv-acc__bal'),
    chevron: Boolean(document.querySelector('.jv-acc__chev')),
  });
}

if (params.get('pos') === '1') {
  const trigger = document.getElementById('second_entry_account_search');
  const panel = document.querySelector('.jvp-modal');
  const body = document.querySelector('.jv-body');
  const t = trigger?.getBoundingClientRect();
  const p = panel?.getBoundingClientRect();
  prove('dropdown direction @ ' + window.innerWidth + 'x' + window.innerHeight, {
    triggerTop: Math.round(t?.top),
    triggerBottom: Math.round(t?.bottom),
    triggerSize: t ? `${Math.round(t.width)}x${Math.round(t.height)}` : 'missing',
    toggleSize: (() => {
      const b = document.querySelector('.jv-account-toggle')?.getBoundingClientRect();
      return b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'missing';
    })(),
    rowWidth: (() => {
      const r = document.querySelector('.jv-account-row')?.getBoundingClientRect();
      return r ? Math.round(r.width) : 'missing';
    })(),
    dateHeight: (() => {
      const d = document.querySelector('.jv-date__input')?.getBoundingClientRect();
      return d ? Math.round(d.height) : 'missing';
    })(),
    panelTop: Math.round(p?.top),
    panelBottom: Math.round(p?.bottom),
    panelHeight: Math.round(p?.height),
    opensBelow: Boolean(p && t && p.top >= t.bottom - 1),
    gapBetween: Math.round((p?.top || 0) - (t?.bottom || 0)),
    bodyScrollTop: Math.round(body?.scrollTop || 0),
    bodyMaxScroll: Math.round((body?.scrollHeight || 0) - (body?.clientHeight || 0)),
    listScrollable: (() => {
      const list = document.querySelector('.jvp-list');
      return list ? list.scrollHeight - list.clientHeight : null;
    })(),
  });
}

if (params.get('icon') === '1') {
  const icon = document.querySelector('.app-modal__icon');
  const cs = icon ? getComputedStyle(icon) : null;
  prove('header icon', {
    accent: getComputedStyle(document.documentElement).getPropertyValue('--jv-accent').trim(),
    glyph: icon?.querySelector('.ms')?.textContent.trim(),
    background: cs?.backgroundColor,
    color: cs?.color,
    creditTab: document.querySelector('.jv-tab--cr')?.getAttribute('aria-selected'),
    saveBg: getComputedStyle(document.querySelector('.jv-btn--save')).backgroundColor,
  });
}

if (params.get('measure') === '1') {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return `${selector}: (missing)`;
    const rect = el.getBoundingClientRect();
    return `${selector}: w=${Math.round(rect.width)} x=${Math.round(rect.x)} sw=${el.scrollWidth}`;
  };
  prove('measure @ ' + window.innerWidth + 'px viewport', [
    box('.app-modal'),
    box('.jv-body'),
    box('.jv-tabs'),
    box('.jv-grid'),
    box('.jv-grid--amount'),
    box('.jv-amount'),
    box('.jv-row--ctr'),
    box('.jv-desc__box'),
    box('.jv-balance'),
    box('.jv-foot'),
    box('.jvp-modal'),
    box('.jvp-list'),
    box('.jvp-row'),
    box('.jvp-row__bal'),
  ]);
}

