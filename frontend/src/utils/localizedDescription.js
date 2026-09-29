const JOURNAL_PATTERNS = [
  {
    pattern: /^Updated journal from (Sale|Purchase|Prescription|Inventory Record)\s*#?(.+)$/i,
    action: 'updated',
  },
  {
    pattern: /^Created (sale|purchase) journal for (?:sale|purchase)\s*#?(.+)$/i,
    action: 'created',
  },
];

const SUBJECTS = {
  sale: { en: 'sale journal', fa: 'سند روزنامه فروش', ps: 'د پلور ورځپاڼې سند' },
  purchase: { en: 'purchase journal', fa: 'سند روزنامه خرید', ps: 'د پېرود ورځپاڼې سند' },
  prescription: { en: 'prescription journal', fa: 'سند روزنامه نسخه', ps: 'د نسخې ورځپاڼې سند' },
  'inventory record': { en: 'inventory journal', fa: 'سند روزنامه موجودی', ps: 'د موجودۍ ورځپاڼې سند' },
};

export function localizeDescription(description, language = 'en', translate = (value) => value) {
  const source = String(description || '').trim();
  if (!source) return '';

  // Handles fixed legacy descriptions already present in translations.json.
  const directlyTranslated = translate(source);
  if (directlyTranslated && directlyTranslated !== source) return directlyTranslated;

  const lang = ['fa', 'ps'].includes(String(language)) ? String(language) : 'en';
  let localized = source;
  localized = localized.replace(
    /Payment via journal:([^\s/|]+)\s+for\s+(Sale|Purchase)\s+#([^/|]+?)(?=\s*(?:\/|\||$))/gi,
    (_full, journalId, type, rawReference) => {
      const reference = rawReference.trim();
      const isSale = type.toLowerCase() === 'sale';
      if (lang === 'fa') return `پرداخت ${isSale ? 'فروش' : 'خرید'} شماره ${reference} از طریق سند روزنامه ${journalId}`;
      if (lang === 'ps') return `د ${isSale ? 'پلور' : 'پېرود'} #${reference} تادیه د ورځپاڼې سند ${journalId} له لارې`;
      return `Payment for ${isSale ? 'sale' : 'purchase'} #${reference} via journal ${journalId}`;
    },
  );
  localized = localized.replace(/\b(Sale|Purchase) Invoice\s+#([^/|\n]+)/gi, (_full, type, rawReference) => {
    const reference = rawReference.trim();
    const isSale = type.toLowerCase() === 'sale';
    if (lang === 'fa') return `${isSale ? 'بل فروش' : 'بل خرید'} شماره ${reference}`;
    if (lang === 'ps') return `${isSale ? 'د پلور انوائس' : 'د پېرود بل'} #${reference}`;
    return `${isSale ? 'Sales invoice' : 'Purchase bill'} #${reference}`;
  });
  for (const fixedText of ['Payment for Sales Invoice', 'Payment for Purchase Invoice']) {
    const translatedText = translate(fixedText);
    if (localized.includes(fixedText) && translatedText && translatedText !== fixedText) {
      localized = localized.replaceAll(fixedText, translatedText);
    }
  }
  if (localized !== source) return localized;

  for (const entry of JOURNAL_PATTERNS) {
    const match = source.match(entry.pattern);
    if (!match) continue;
    const subjectKey = match[1].toLowerCase();
    const reference = match[2].replace(/^#/, '').trim();
    const subject = SUBJECTS[subjectKey]?.[lang] || SUBJECTS[subjectKey]?.en || match[1];

    if (lang === 'fa') {
      return entry.action === 'updated'
        ? `${subject} شماره ${reference} به‌روزرسانی شد.`
        : `${subject} شماره ${reference} ایجاد شد.`;
    }
    if (lang === 'ps') {
      return entry.action === 'updated'
        ? `${subject} #${reference} تازه شو.`
        : `${subject} #${reference} جوړ شو.`;
    }
    return entry.action === 'updated'
      ? `Updated ${subject} #${reference}.`
      : `Created ${subject} #${reference}.`;
  }

  return source;
}
