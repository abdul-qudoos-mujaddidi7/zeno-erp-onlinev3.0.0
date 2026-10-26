/*
 * Throw-away render harness for the Journal table's row actions (see
 * ta-preview.html). Only `fetch` is stubbed so the production page renders a
 * few rows; delete this file, ta-preview.html and ta-preview.svelte later.
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
  { id: 1, code: 'CASH-1', name: 'Cash Box', name_fa: 'صندوق نقدی', account_type_id: 1, status: 1 },
  { id: 2, code: 'TREASURY', name: 'Treasury', name_fa: 'خزانه', account_type_id: 1, status: 1 },
  { id: 4, code: 'C-1001', name: 'Lal Gul Pharmacy', name_fa: 'لمعان درملتون', account_type_id: 4, status: 1 },
  { id: 5, code: 'C-1002', name: 'Noor Gul Pharmacy', name_fa: 'نور درملتون', account_type_id: 4, status: 1 },
  { id: 7, code: 'S-2001', name: 'Zahid Traders', name_fa: 'زاہد تجارتی', account_type_id: 3, status: 1 },
  { id: 9, code: 'E-500', name: 'Rent', name_fa: 'کرایه', account_type_id: 5, status: 1 },
];

const JOURNALS = [
  { id: 101, reference: 'JV-1001', reference_type: 'account', reference_id: 4, status: 1, currency: 'AFN', date: '2026-10-20', created_at: '2026-10-20 09:12:00', description: 'وصول نقدی از مشتری', first_entry_account: 1, first_entry_debit: 25400, first_entry_credit: 0, second_entry_account: 4, second_entry_debit: 0, second_entry_credit: 25400 },
  { id: 102, reference: 'JV-1002', reference_type: null, reference_id: null, status: 1, currency: 'AFN', date: '2026-10-20', created_at: '2026-10-20 10:04:00', description: 'خرید لوازم اداری', first_entry_account: 9, first_entry_debit: 3200, first_entry_credit: 0, second_entry_account: 1, second_entry_debit: 0, second_entry_credit: 3200 },
  { id: 103, reference: 'JV-1003', reference_type: 'sale', reference_id: 4418, status: 1, currency: 'USD', date: '2026-10-21', created_at: '2026-10-21 08:30:00', description: 'فروش نقدی دالری', first_entry_account: 1, first_entry_debit: 420, first_entry_credit: 0, second_entry_account: 6, second_entry_debit: 0, second_entry_credit: 420 },
  { id: 104, reference: 'JV-1004', reference_type: null, reference_id: null, status: 1, currency: 'AFN', date: '2026-10-22', created_at: '2026-10-22 14:45:00', description: 'پرداخت کرایه دفتر', first_entry_account: 9, first_entry_debit: 15000, first_entry_credit: 0, second_entry_account: 2, second_entry_debit: 0, second_entry_credit: 15000 },
  { id: 105, reference: 'JV-1005', reference_type: null, reference_id: null, status: 1, currency: 'AFN', date: '2026-10-22', created_at: '2026-10-22 16:10:00', description: 'دریافت از مشتری', first_entry_account: 2, first_entry_debit: 6800, first_entry_credit: 0, second_entry_account: 5, second_entry_debit: 0, second_entry_credit: 6800 },
];

const CURRENCIES = [
  { id: 1, code: 'AFN', name: 'Afghani', name_fa: 'افغانی', symbol: '؋', isDefault: 1, status: 1 },
  { id: 2, code: 'USD', name: 'US Dollar', name_fa: 'دالر امریکایی', symbol: '$', isDefault: 0, status: 1 },
];

const FISCAL_YEAR = {
  id: 1,
  name: '1405',
  start_date: '2026-04-04',
  end_date: '2027-04-03',
  fiscal_status: 'open',
};

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

  if (path.startsWith('/api/v2/account-types')) return json({ data: ACCOUNT_TYPES });
  if (path.startsWith('/api/v2/accounts/balances')) return json({ data: {} });
  if (path.startsWith('/api/v2/accounts')) return json({ data: ACCOUNTS });
  if (path.startsWith('/api/v2/currencies')) return json({ data: CURRENCIES });
  if (path.startsWith('/api/v2/fiscal-years/current')) return json({ data: FISCAL_YEAR });
  if (path.startsWith('/api/v2/fiscal-years')) return json({ data: [FISCAL_YEAR] });
  if (path.startsWith('/api/v2/settings')) {
    return json({
      data: [
        { id: 1, key: 'enable_a4_default_print_mode', value: '0' },
        { id: 2, key: 'enable_notrack', value: '1' },
      ],
    });
  }
  if (path.startsWith('/api/v2/journals')) {
    return json({
      data: JOURNALS,
      meta: { total: JOURNALS.length, page: 1, limit: 15, totalPages: 1 },
    });
  }
  if (path.startsWith('/api/')) return json({ data: [] });

  return nativeFetch(input, init);
};

const { default: Preview } = await import('./ta-preview.svelte');

mount(Preview, { target: document.getElementById('app') });

const params = new URLSearchParams(location.search);

function metric(el, keys) {
  if (!el) return 'missing';
  const cs = getComputedStyle(el);
  return keys.map((key) => `${key}=${cs[key]}`).join(' ');
}

function probe() {
  const trigger = document.querySelector('.action-menu-trigger');
  const menu = document.querySelector('.action-menu');
  const items = [...document.querySelectorAll('.action-menu button')];
  const lines = [
    `trigger ${metric(trigger, ['width', 'height', 'borderRadius', 'backgroundColor', 'color', 'fontSize'])}` +
      ` glyph=${getComputedStyle(trigger.querySelector('.ms')).fontSize}`,
    `menu ${metric(menu, ['width', 'padding', 'borderRadius', 'backgroundColor', 'borderTopWidth', 'fontSize'])}`,
    `heading ${metric(document.querySelector('.action-menu__heading'), ['fontSize', 'fontWeight', 'color', 'padding'])}`,
    ...items.map((item) =>
      `item "${item.textContent.trim()}" ${metric(item, ['height', 'fontSize', 'fontWeight', 'color', 'paddingInlineStart'])}` +
      ` glyph=${metric(item.querySelector('.ms'), ['fontSize', 'color'])}`,
    ),
  ];
  const pre = document.createElement('pre');
  pre.textContent = lines.join('\n');
  pre.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;border-radius:8px;' +
    'background:rgba(11,21,48,.92);color:#e2e8f0;font:11px/1.5 monospace;direction:ltr;max-width:640px;white-space:pre-wrap';
  document.body.appendChild(pre);
}

/* `?menu=1` opens the first row's kebab so the popup can be screenshotted. */
if (params.get('menu') === '1') {
  setTimeout(() => {
    document.querySelector('.action-menu-trigger')?.click();
    if (params.get('probe') === '1') setTimeout(probe, 400);
  }, 900);
}

/* `?view=<row>` opens the read-only voucher dialog of that row. */
function showProbe(lines) {
  const pre = document.createElement('pre');
  pre.textContent = lines.join('\n');
  pre.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:99999;margin:0;padding:8px 10px;border-radius:8px;' +
    'background:rgba(11,21,48,.92);color:#e2e8f0;font:11px/1.5 monospace;direction:ltr;max-width:700px;white-space:pre-wrap';
  document.body.appendChild(pre);
}

function probeView() {
  const sheet = document.querySelector('.jvd');
  const head = document.querySelector('.jvd__head');
  const closeBtn = document.querySelector('.jvd__close');
  const tile = document.querySelector('.jvd__tile');
  const title = document.querySelector('.jvd__title');
  const status = document.querySelector('.jvd__status');
  const chip = document.querySelector('.jvd__chip');
  const dateCard = document.querySelector('.jvd__date');
  const desc = document.querySelector('.jvd__desc');
  const story = document.querySelector('.jvd__story-row');
  const storyChip = document.querySelector('.jvd__story-chip');
  const storyAmt = document.querySelector('.jvd__story-amt');
  const th = document.querySelector('.jvd__table th');
  const td = document.querySelector('.jvd__table td');
  const side = document.querySelector('.jvd__side');
  const dr = document.querySelector('.jvd__table td.is-dr');
  const cr = document.querySelector('.jvd__table td.is-cr');
  const foot = document.querySelector('.jvd__foot');
  const footCell = document.querySelector('.jvd__table tfoot td');
  const btn = document.querySelector('.jvd__btn');
  const primary = document.querySelector('.jvd__btn.is-primary');

  showProbe([
    `sheet ${metric(sheet, ['width', 'borderRadius', 'boxShadow', 'backgroundColor'])}`,
    `head ${metric(head, ['padding', 'gap', 'backgroundImage'])}`,
    `close ${metric(closeBtn, ['width', 'height', 'borderRadius', 'backgroundColor', 'color'])} glyph=${metric(closeBtn?.querySelector('.ms'), ['fontSize'])}`,
    `tile ${metric(tile, ['width', 'height', 'borderRadius', 'fontSize', 'backgroundColor', 'color'])}`,
    `title ${metric(title, ['fontSize', 'fontWeight', 'color', 'letterSpacing'])}`,
    `status ${metric(status, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'paddingInlineStart'])}`,
    `chip ${metric(chip, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'paddingInlineStart'])}`,
    `date ${metric(dateCard, ['padding', 'borderRadius', 'backgroundColor', 'borderTopWidth'])}`,
    `dateNo ${metric(dateCard?.querySelector('b'), ['fontSize', 'fontWeight', 'color'])}`,
    `desc ${metric(desc, ['padding', 'borderRadius', 'backgroundColor', 'borderTopWidth'])}`,
    `descLabel ${metric(document.querySelector('.jvd__desc-label'), ['fontSize', 'fontWeight', 'color'])}`,
    `descBody ${metric(document.querySelector('.jvd__desc-body'), ['fontSize', 'fontWeight', 'color'])}`,
    `story ${metric(story, ['padding', 'borderRadius', 'backgroundColor', 'gap'])}`,
    `storyChip ${metric(storyChip, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color'])}`,
    `storyNames ${metric(document.querySelector('.jvd__story-names'), ['fontSize', 'fontWeight', 'color'])}`,
    `storyAmt ${metric(storyAmt, ['fontSize', 'fontWeight', 'color'])}`,
    `th ${metric(th, ['height', 'padding', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'textAlign'])}`,
    `td ${metric(td, ['padding', 'fontSize', 'borderBottomWidth'])} code=${metric(td, ['fontSize', 'color', 'textAlign'])}`,
    `side ${metric(side, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'paddingInlineStart'])}`,
    `dr ${metric(dr, ['fontWeight', 'color', 'textAlign', 'width'])} cr ${metric(cr, ['fontWeight', 'color', 'textAlign'])}`,
    `tfoot ${metric(footCell, ['padding', 'backgroundColor', 'fontWeight', 'color'])}`,
    `foot ${metric(foot, ['padding', 'gap', 'backgroundColor', 'borderTopWidth'])}`,
    `btn ${metric(btn, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'paddingInlineStart'])}`,
    `primary ${metric(primary, ['height', 'borderRadius', 'fontSize', 'fontWeight', 'backgroundColor', 'color'])}`,
  ]);
}

const viewIndex = Number(params.get('view') ?? -1);
if (viewIndex >= 0) {
  setTimeout(() => {
    document.querySelectorAll('.action-menu-trigger')[viewIndex]?.click();
    setTimeout(() => {
      document.querySelector('.action-menu button')?.click();
      if (params.get('probe') === '1') setTimeout(probeView, 500);
    }, 300);
  }, 900);
}
