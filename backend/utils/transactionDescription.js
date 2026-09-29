function languageCode(language) {
  const code = String(language || 'en').toLowerCase().split(/[-_]/)[0];
  return code === 'fa' || code === 'ps' ? code : 'en';
}

function money(value, currency = 'AFN') {
  const amount = Math.abs(Number(value || 0)).toLocaleString('en-US', {
    maximumFractionDigits: 3,
  });
  return `${amount} ${currency || 'AFN'}`;
}

function referenceOf(record, keys, fallback) {
  for (const key of keys) {
    if (record?.[key] !== null && record?.[key] !== undefined && String(record[key]).trim()) {
      return String(record[key]).trim();
    }
  }
  return fallback;
}

function paymentDescription({ kind, document = {}, payment = {}, language }) {
  const lang = languageCode(language);
  const amount = money(payment.amount, payment.currency || document.currency);
  const reversal = Number(payment.amount || 0) < 0;
  const definitions = {
    sale: {
      ref: referenceOf(document, ['invoice_number'], `#${document.id || document.local_id || ''}`),
      en: 'sales invoice', fa: 'بل فروش', ps: 'د پلور انوائس',
    },
    purchase: {
      ref: referenceOf(document, ['bill_number'], `#${document.id || document.local_id || ''}`),
      en: 'purchase bill', fa: 'بل خرید', ps: 'د پېرود بل',
    },
    inventory: {
      ref: referenceOf(document, ['record_number'], `#${document.id || document.local_id || ''}`),
      en: 'inventory record', fa: 'سند موجودی', ps: 'د موجودۍ سند',
    },
    prescription: {
      ref: referenceOf(document, ['prescription_number'], `#${document.id || document.local_id || ''}`),
      en: 'prescription', fa: 'نسخه', ps: 'نسخه',
    },
    appointment: {
      ref: referenceOf(document, ['appointment_number', 'patient_id'], `#${document.id || document.local_id || ''}`),
      en: 'appointment', fa: 'نوبت', ps: 'وخت',
    },
  };
  const type = definitions[kind] || definitions.sale;

  if (lang === 'fa') {
    if (reversal) return `برگشت پرداخت به مبلغ ${amount} برای ${type.fa} «${type.ref}» ثبت شد.`;
    return kind === 'purchase'
      ? `مبلغ ${amount} برای ${type.fa} «${type.ref}» پرداخت شد.`
      : `مبلغ ${amount} برای ${type.fa} «${type.ref}» دریافت شد.`;
  }
  if (lang === 'ps') {
    if (reversal) return `${type.ps} «${type.ref}» لپاره د ${amount} تادیې بېرته ستنول ثبت شول.`;
    return kind === 'purchase'
      ? `${type.ps} «${type.ref}» لپاره ${amount} تادیه شوه.`
      : `${type.ps} «${type.ref}» لپاره ${amount} تادیه ترلاسه شوه.`;
  }
  if (reversal) return `Recorded a ${amount} payment reversal for ${type.en} “${type.ref}”.`;
  return kind === 'purchase'
    ? `Paid ${amount} toward ${type.en} “${type.ref}”.`
    : `Received ${amount} for ${type.en} “${type.ref}”.`;
}

module.exports = { languageCode, money, paymentDescription };
