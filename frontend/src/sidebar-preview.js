import { mount } from 'svelte';
import './app.css';
import Sidebar from './components/Sidebar.svelte';
import { auth } from './auth/authStore';

window.addEventListener('unhandledrejection', (event) => event.preventDefault());

const params = new URLSearchParams(location.search);

localStorage.setItem('lang', params.get('lang') || 'fa');
localStorage.setItem('org_type', params.get('org') || 'hospital');
localStorage.setItem('role_id', '1');
localStorage.setItem('username', 'hewad');
localStorage.setItem('sidebar_collapsed', params.get('collapsed') === '1' ? '1' : '0');

auth.set({
  token: 'preview',
  user_id: '1',
  org_id: '1',
  username: 'hewad',
  role_id: '1',
  subscription: params.get('nosub') === '1'
    ? null
    : {
        subscription_status: 'active',
        subscription_plan: { name: 'Business', name_fa: 'پلان تجارتی' },
        end_date: '2027-01-01',
      },
  isAuthenticated: true,
  permissions: [
    { code: 'Dashboard', view: true },
    { code: 'POS', view: true },
    { code: 'Sales', view: true },
    { code: 'Purchases', view: true },
    { code: 'Products', view: true },
    { code: 'Services', view: true },
    { code: 'Accounts', view: true },
    { code: 'Journals', view: true },
    { code: 'Exchange', view: true },
    { code: 'Settings', view: true },
    { code: 'Benefit', view: true },
  ],
});

mount(Sidebar, {
  target: document.getElementById('app'),
  props: {
    sidebarOpen: params.get('open') === '1',
    sidebarCollapsed: params.get('collapsed') === '1',
  },
});

if (params.get('theme') === 'dark') {
  document.documentElement.classList.add('dark');
  document.documentElement.classList.remove('light');
  document.documentElement.dataset.mdbTheme = 'dark';
}

const content = document.createElement('div');
content.className = 'preview-content';
content.innerHTML =
  '<div class="preview-card" style="margin-inline-start: var(--sidebar-width)">page content</div>';
document.body.appendChild(content);

if (params.get('open') === '1') document.querySelector('#erp-sidebar').classList.add('show');
if (params.get('profile') === '1') document.querySelector('.sidebar-profile-trigger')?.click();

if (params.get('metrics') === '1') {
  const out = document.createElement('pre');
  out.id = 'metrics';
  document.body.appendChild(out);

  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return sel + ':missing';
    const r = el.getBoundingClientRect();
    return `${sel}:${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
  };

  const report = () => {
    try {
      const popup = document.querySelector('.sidebar-profile-menu');
      const cs = (el, ...props) => (el ? props.map((p) => p + '=' + getComputedStyle(el)[p]).join(' ') : 'none');
      const langButtons = [...document.querySelectorAll('.pm-lang')];
      const rows = [...document.querySelectorAll('.pm-row')].map((row) => row.textContent.replace(/\s+/g, ' ').trim());
      const icons = [...document.querySelectorAll('.pm-ic')].map((el) => (el.querySelector('i') || {}).className || '');
      out.textContent =
        'POPUP ' +
        [
          `open:${!!popup}`,
          box('.sidebar-profile-menu'),
          cs(popup, 'position', 'width', 'padding', 'borderRadius'),
          `head:${(document.querySelector('.pm-head') || {}).textContent ? document.querySelector('.pm-head').textContent.replace(/\s+/g, ' ').trim() : 'none'}`,
          box('.pm-avatar'),
          cs(document.querySelector('.pm-avatar'), 'borderRadius', 'backgroundColor', 'fontSize', 'fontWeight'),
          box('.pm-presence'),
          box('.pm-group'),
          cs(document.querySelector('.pm-group'), 'backgroundColor', 'borderRadius', 'gap', 'padding'),
          box('.pm-row'),
          rows.join(' / '),
          `value:${(document.querySelector('.pm-value') || {}).textContent || 'none'}`,
          box('.pm-foot'),
          `langs:${langButtons.map((b) => b.textContent.trim() + (b.classList.contains('active') ? '*' : '')).join(' ')}`,
          box('.pm-lang'),
          box('.pm-ic'),
          cs(document.querySelector('.pm-ic'), 'width', 'height', 'borderRadius', 'backgroundColor'),
          `icons:${icons.map((c) => c.replace('bi ', '').replace(' pm-chevron', '')).join(' ')}`,
        ].join(' | ');
    } catch (error) {
      out.textContent = 'POPUP error: ' + error;
    }
  };

  report();
  window.addEventListener('load', report);
  setTimeout(report, 600);
}
