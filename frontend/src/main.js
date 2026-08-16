import { mount } from 'svelte'
import App from './App.svelte'
import { ensureProductUnitsLoaded } from './pages/stocktransactions/calculateStock.js'
import './app.css'
import './components/common/quick-action-modal.css'
import './components/common/track-picker.css'
import { initGlobalDatePickers } from './calendar.js'
import { applyMdbStylesheet } from './lib/mdbTheme.js'

const langCode = localStorage.getItem('lang') || 'fa';
const isRtl = langCode === 'fa' || langCode === 'ps';
document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
document.documentElement.lang = langCode;
applyMdbStylesheet(isRtl);

const hash = window.location.hash || '';
if (hash.startsWith('#/dashboard') || hash.startsWith('#/pos')) {
  ensureProductUnitsLoaded().catch((error) => {
    console.warn('Failed to preload product units:', error);
  });
}

const app = mount(App, {
  target: document.getElementById('app'),
  intro: true,
})

initGlobalDatePickers()

export default app
