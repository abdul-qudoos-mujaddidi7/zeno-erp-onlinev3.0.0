import { writable } from 'svelte/store';
import translations from './translations.json';
import { settingsApi } from '../api/settingsApi.js';


export const supported = [
  { code: 'en', label: translations.en['English'], rtl: false },
  { code: 'fa', label: translations.fa['Dari'], rtl: true },
  { code: 'ps', label: translations.ps['Pashto'], rtl: true }
];

export const lang = writable(localStorage.getItem('lang') || 'fa');

export const settings_all = writable([]);

export async function loadSettings() {
  await refreshSettings();
}

export async function refreshSettings() {
  let settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  settings_all.set(settings);
}



export function shortID(id) {
  let string = String(id);

  if (string.length > 6) {
    return string.slice(-6);
  } else {
    return string;
  }
}

export function setSettingsAll(settings) {
  settings_all.set(settings);
}

// 🔥 helper (VERY useful)
export function getSetting(key) {
  let value;
  settings_all.subscribe(s => {
    value = s.find(x => x.key === key);
  })();
  return value;
}


let current = 'fa';
lang.subscribe(v => { current = v; localStorage.setItem('lang', v); });



let translateConditions = {
  fa:{
    exchange:{
      "محصولات": 'پول‌ها',
      "محصول": 'پول',
      "گدام": 'صندوق',
      "کالاهای": 'پول‌های',
      "کالا": 'پول',
    },
    pharmacy:{
      "محصولات": 'ادویه‌جات',
      "محصول": 'ادویه',
      "کالاهای": 'ادویه‌های',
      "کالا": 'ادویه',
    },
    hospital:{
      "مشتری": 'مریض',
      "مشتریان": 'مریضان',
    },
    barbershop:{
      "مریض": 'مشتری',
      "داکتر": 'سلمان',
    },
  },
  en:{
    exchange:{
      "Products": 'Monies',
      "Product": 'Money',
      "products": 'monies',
      "product": 'money',
    },
    pharmacy:{
      "Products": 'Medicines',
      "Product": 'Medicine',
      "products": 'medicines',
      "product": 'medicine',
    },
    hospital:{
      "customer":"patient",
      "Customer":"Patient",
    },
    barbershop:{
      "Patient":"Customer",
      "patient":"customer",
      "Doctor":"Barber",
      "doctor":"barber",
    },
  }
};

export const translate_org_type = writable(localStorage.getItem('org_type') || 'general');

let currentOrgType = localStorage.getItem('org_type') || 'general';
translate_org_type.subscribe(v => { currentOrgType = v; localStorage.setItem('org_type', v); });
  console.log('currentOrgType', currentOrgType);


export function t(key) {
  try {

    if (current === 'ps') {
      const block = translations[current] || translations.fa;
      return block[key] || translations.fa[key] || key;
    } else {
      const block = translations[current] || translations.en;
      let returner = block[key] || translations.en[key] || key;
      if (translateConditions[current] && translateConditions[current][currentOrgType]) {
        const conditionBlock = translateConditions[current][currentOrgType];
        Object.keys(conditionBlock).forEach(key => {
          returner = returner.replace(new RegExp(key, 'g'), conditionBlock[key]);
        });
      }
      return returner;
    }
  } catch (e) {
    return key;
  }
}

export function setLanguage(code) {
  if (!code) return;
  if (!translations[code]) code = 'fa';
  lang.set(code);
}


export function setTranslateOrgType(orgType) {
  console.log('Setting translate_org_type to', orgType);
  if (!orgType) return;
  translate_org_type.set(orgType);
}

export function isRTL(code) {
  const s = supported.find(x => x.code === code);
  return s ? s.rtl : false;
}
