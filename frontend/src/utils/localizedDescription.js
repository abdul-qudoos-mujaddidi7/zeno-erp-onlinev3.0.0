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

const NOTE_MARKERS = ['توضیحات', 'یادونه', 'Note'];

/*
 * A bill payment description is built on the client as
 * "<summary> | <note label>: <note>". Saves made before that split existed
 * stored the whole generated summary as the note, so the stored row reads
 * twice. Collapse the repeat here: every surface that prints a journal
 * description (the voucher dialog, receipts, reports) runs through this file.
 */
function splitDescriptionNote(text) {
  for (const marker of NOTE_MARKERS) {
    const separator = ` | ${marker}: `;
    const index = text.indexOf(separator);

    if (index > 0) {
      return {
        head: text.slice(0, index).trim(),
        note: text.slice(index + separator.length).trim(),
      };
    }
  }

  return null;
}

export function collapseDuplicatedDescription(value = '') {
  let text = String(value ?? '').trim();

  /* A description is one summary plus at most one note, so a handful of passes
     unwinds even the older rows that nested the summary more than once. */
  for (let pass = 0; pass < 5; pass += 1) {
    const split = splitDescriptionNote(text);
    if (!split) return text;

    const noteHead = splitDescriptionNote(split.note)?.head ?? split.note;
    if (noteHead !== split.head) return text;

    text = split.head;
  }

  return text;
}

export function localizeDescription(description, language = 'en', translate = (value) => value) {
  const source = collapseDuplicatedDescription(description);
  if (!source) return '';

  // Handles fixed legacy descriptions already present in translations.json.
  const directlyTranslated = translate(source);
  if (directlyTranslated && directlyTranslated !== source) return directlyTranslated;

  const lang = ['fa', 'ps'].includes(String(language)) ? String(language) : 'en';
  let localized = source;
  /*
   * "Visitor benefit for Invoice #INV-9" is written once, in English, when the
   * visitor benefit journal is posted, so stored rows keep the English
   * wording; only the surrounding text is translated, the number is kept.
   */
  localized = localized.replace(
    /^Visitor benefit for Invoice\s*#?\s*([^/|\n]*)$/i,
    (_full, rawReference) => {
      const reference = rawReference.trim();
      if (lang === 'fa') {
        return reference
          ? `مفاد ویزیتور برای بل شماره ${reference}`
          : 'مفاد ویزیتور برای فروش';
      }
      if (lang === 'ps') {
        return reference
          ? `د ویزیتور ګټه د بل #${reference} لپاره`
          : 'د ویزیتور ګټه د پلور لپاره';
      }
      return reference ? `Visitor benefit for Invoice #${reference}` : 'Visitor benefit for sale';
    },
  );
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
