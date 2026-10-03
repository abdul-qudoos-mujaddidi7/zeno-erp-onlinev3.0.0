/*
 * Money amounts spelled out in words, for the line a bill prints under its
 * total — the same amount again, unlabelled and without a currency name:
 * "Four Hundred" / "چهارصد" / "څلور سوه".
 *
 * A bill is a legal document: the total is printed twice, once in figures and
 * once in words, so a hand-altered digit cannot pass unnoticed. The words are
 * therefore generated from exactly the number the figures show, and never from
 * a re-rounded or locale-formatted string.
 *
 * The three languages the app ships in are all spelled here, because a receipt
 * is printed in the language of the bill, not in English:
 *
 *   amountInWords(400, 'en')  -> 'Four Hundred'
 *   amountInWords(400, 'fa')  -> 'چهارصد'
 *   amountInWords(400, 'ps')  -> 'څلور سوه'
 *
 * The currency is passed in as the bill's already-translated label ('AFN' ->
 * 'افغانی' / 'افغانۍ'), so this helper keeps no currency dictionary of its own
 * and the words can never name a currency the bill is not in. The small money,
 * on the other hand, is a matter of language and not of currency: the shop
 * calls the hundredth 'پول' in Dari, 'پیسی' in Pashto and 'Cent' in English,
 * whichever currency the bill happens to be in (SUBUNIT below).
 *
 * Everything here is a pure function so the exact string a printer receives
 * can be unit tested without a browser.
 */

/* The scale every group of three digits is read against, largest last. */
const SCALES = {
  en: ['', 'Thousand', 'Million', 'Billion', 'Trillion'],
  fa: ['', 'هزار', 'میلیون', 'میلیارد', 'بیلیون'],
  ps: ['', 'زر', 'میلیون', 'میلیارد', 'بیلیون'],
};

/* 0..19 stand alone; 20..99 are built from a tens stem (see TENS/TENS_STEM). */
const ONES = {
  en: [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ],
  fa: [
    '', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه',
    'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده',
    'هجده', 'نوزده',
  ],
  ps: [
    '', 'یو', 'دوه', 'درې', 'څلور', 'پنځه', 'شپږ', 'اووه', 'اته', 'نهه',
    'لس', 'یوولس', 'دوولس', 'دیارلس', 'څوارلس', 'پنځلس', 'شپاړس', 'اووهلس',
    'اتلس', 'نولس',
  ],
};

/*
 * The exact tens word, used when a group ends in a whole ten ("Twenty",
 * "بیست", "شل").
 */
const TENS = {
  en: ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'],
  fa: ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'],
  ps: ['', '', 'شل', 'دېرش', 'څلویښت', 'پنځوس', 'شپېته', 'اویا', 'اتيا', 'نوي'],
};

/*
 * The stem a Pashto 21..99 is glued to. Pashto has no "twenty and one": the
 * unit is prefixed to the tens stem, so 21 is یوویشت — not شل او یو. The 20s
 * switch stem (شل -> ویشت) but every other decade keeps its word.
 */
const PASHTO_TENS_STEM = ['', '', 'ویشت', 'دېرش', 'څلویښت', 'پنځوس', 'شپېته', 'اویا', 'اتيا', 'نوي'];

/*
 * Hundreds use Dari wording for the app's fa language (دوصد, سه‌صد, پنجصد) and a "سل"
 * family in Pashto, while English keeps "One Hundred" apart.
 */
const HUNDREDS = {
  en: ['', 'One Hundred', 'Two Hundred', 'Three Hundred', 'Four Hundred', 'Five Hundred',
    'Six Hundred', 'Seven Hundred', 'Eight Hundred', 'Nine Hundred'],
  fa: ['', 'صد', 'دوصد', 'سهصد', 'چهارصد', 'پنجصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'],
  ps: ['', 'سل', 'دوه سوه', 'درې سوه', 'څلور سوه', 'پنځه سوه', 'شپږ سوه', 'اووه سوه',
    'اته سوه', 'نهه سوه'],
};

const ZERO = { en: 'Zero', fa: 'صفر', ps: 'صفر' };
const MINUS = { en: 'Minus', fa: 'منفی', ps: 'منفي' };

/*
 * What the hundredth of a currency is called, per language.
 *
 * The name follows the language the bill is printed in rather than the currency
 * column: an afghani, a dollar and a euro all have a hundredth, and in this
 * market it is 'پول' in Dari, 'پیسی' in Pashto and 'Cent' in English either
 * way. A currency therefore needs no subunit of its own, and a currency added
 * later prints correctly without being taught a name here.
 */
const SUBUNIT = { en: 'Cent', fa: 'پول', ps: 'پیسی' };

/*
 * How the parts of a number are joined. Persian and Pashto write the
 * conjunction between *every* part ("سیصد و بیست و پنج"), English only
 * between the integer and a fraction ("Four Hundred and 50/100").
 */
const JOINT = {
  en: ' ',
  fa: ' و ',
  ps: ' او ',
};
const FRACTION_JOINT = { en: ' and ', fa: ' و ', ps: ' او ' };

/* Latin digits are the app's canonical numerals; fa/ps bills print theirs. */
const EASTERN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const LOCALE_LANG = { en: 'en', fa: 'fa', ps: 'ps' };

/* How many decimals are kept. The app stores money with up to 3. */
const MAX_DECIMALS = 3;

function normalizeLang(lang) {
  return LOCALE_LANG[String(lang ?? '').toLowerCase()] || 'fa';
}

/*
 * The language as a bill already knows it (i18n's lang store / t('Lang')) may
 * arrive as 'fa-AF' or 'English'; only the leading code matters here.
 */
function langCode(value) {
  const text = String(value ?? '').trim().toLowerCase();

  if (text.startsWith('en') || text.startsWith('english')) return 'en';
  if (text.startsWith('ps') || text.startsWith('pashto') || text.startsWith('پښتو')) return 'ps';
  if (text.startsWith('fa') || text.startsWith('dari') || text.startsWith('persian') || text.startsWith('دری')) return 'fa';

  return normalizeLang(text);
}

function digits(text, lang) {
  if (lang === 'en') return text;

  return String(text).replace(/\d/g, (digit) => EASTERN_DIGITS[Number(digit)]);
}

/* 1..999, the only range a single group can hold. */
function groupInWords(group, lang) {
  const parts = [];
  const hundreds = Math.floor(group / 100);
  const rest = group % 100;

  if (hundreds) parts.push(HUNDREDS[lang][hundreds]);

  if (rest) {
    if (rest < 20) {
      parts.push(ONES[lang][rest]);
    } else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;

      if (lang === 'ps' && ones) {
        /* یوویشت, دوهدېرش … the unit is prefixed to the stem. */
        parts.push(`${ONES[lang][ones]}${PASHTO_TENS_STEM[tens]}`);
      } else if (ones) {
        parts.push(`${TENS[lang][tens]}${JOINT[lang]}${ONES[lang][ones]}`);
      } else {
        parts.push(TENS[lang][tens]);
      }
    }
  }

  return parts.join(JOINT[lang]);
}

/* Every non-zero group of three, read against its scale, joined in order. */
function integerInWords(integerText, lang) {
  const groups = [];

  for (let end = integerText.length; end > 0; end -= 3) {
    groups.unshift(integerText.slice(Math.max(0, end - 3), end));
  }

  const parts = groups
    .map((text, index) => ({ value: Number(text), scale: groups.length - 1 - index }))
    .filter(({ value }) => value > 0)
    .map(({ value, scale }) => {
      const words = groupInWords(value, lang);

      return scale ? `${words} ${SCALES[lang][scale] || ''}`.trim() : words;
    });

  return parts.join(JOINT[lang]);
}

/* '50/100', in the numerals of the bill's own language. */
function fractionInWords(fractionText, lang) {
  const digitsOnly = String(fractionText).replace(/0+$/, '');

  if (!digitsOnly) return '';

  const scale = String(10 ** digitsOnly.length);

  return digits(
    `${digitsOnly.replace(/^0+(?=\d)/, '')}/${scale}`,
    lang,
  );
}

/* A label the caller passed: a string, trimmed, or '' when it is not one. */
function label(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/*
 * English writes the small money in the plural for anything but exactly one
 * ("Fifty Cents", "One Cent"); Persian and Pashto leave the noun alone after a
 * numeral.
 */
function subunitWords(hundredths, lang) {
  const subunit = SUBUNIT[lang];

  if (lang !== 'en' || hundredths === 1) return subunit;

  return subunit.endsWith('s') ? subunit : `${subunit}s`;
}

/*
 * The part of the amount below the unit.
 *
 * Hundredths are money the market writes out by name — "پنجاه پول" — so they
 * are spelled with the hundredth's name in the bill's language. Anything finer
 * than a hundredth (the app stores three decimals) has no name, and a rounded
 * phrase would no longer match the figures printed beside it, so that stays a
 * ratio: 505/1000.
 */
function fractionWords(fractionText, lang) {
  const fraction = String(fractionText ?? '').replace(/0+$/, '');

  if (!fraction) return '';

  if (fraction.length <= 2) {
    const hundredths = Number(fractionText.slice(0, 2));

    return {
      joint: FRACTION_JOINT[lang],
      words: `${amountInWords(hundredths, lang)} ${subunitWords(hundredths, lang)}`,
    };
  }

  return { joint: FRACTION_JOINT[lang], words: fractionInWords(fractionText, lang) };
}

/*
 * The amount, spelled out.
 *
 *   amountInWords(400, 'en')                          -> 'Four Hundred'
 *   amountInWords(1320, 'fa')                         -> 'یک هزار و سیصد و بیست'
 *   amountInWords(1320, 'ps')                         -> 'یو زر او درې سوه او شل'
 *   amountInWords(0, 'en')                            -> 'Zero'
 *   amountInWords(400.5, 'en')                        -> 'Four Hundred and 5/10'
 *   amountInWords(-25, 'fa')                          -> 'منفی بیست و پنج'
 *   amountInWords('', 'en')                           -> ''      (nothing to spell)
 *   amountInWords('nonsense', 'en')                   -> ''
 *
 * A bill states its money by name and not only in figures, so the caller passes
 * the currency label the bill prints:
 *
 *   amountInWords(400, 'fa', { currency: 'افغانی' })
 *     -> 'چهارصد افغانی'
 *   amountInWords(400.5, 'fa', { currency: 'افغانی' })
 *     -> 'چهارصد افغانی و پنجاه پول'
 *   amountInWords(400.5, 'ps', { currency: 'افغانۍ' })
 *     -> 'څلور سوه افغانۍ او پنځوس پیسی'
 *   amountInWords(400.5, 'en', { currency: 'USD' })
 *     -> 'Four Hundred USD and Fifty Cents'
 *   amountInWords(400.005, 'fa', { currency: 'افغانی' })
 *     -> 'چهارصد افغانی و ۵/۱۰۰۰'   (finer than a hundredth: a ratio)
 *
 * The currency label arrives already translated — the caller has t() — so this
 * helper needs no currency dictionary of its own and can never name a currency
 * the bill is not in. An amount finer than a hundredth keeps the ratio form,
 * because rounding it would print words that disagree with the figures beside
 * them.
 */
export function amountInWords(value, lang = 'fa', labels = {}) {
  if (value === null || value === undefined || value === '') return '';

  const number = Number(String(value).replace(/[,\s]/g, ''));

  if (!Number.isFinite(number)) return '';

  const code = langCode(lang);
  const currency = label(labels?.currency);
  const absolute = Math.abs(number);
  const text = absolute.toFixed(MAX_DECIMALS);
  const [integerText, fractionText] = text.split('.');

  /* Beyond the scales above the digits are clearer than a wrong name. */
  if (integerText.length > SCALES[code].length * 3) return String(number);

  const integerWords = Number(integerText) === 0 && !fractionText.replace(/0+$/, '')
    ? ZERO[code]
    : integerInWords(integerText.replace(/^0+(?=\d)/, ''), code);

  /* The unit's own name follows the number, as a bill writes it. */
  const unit = `${integerWords || (fractionText ? ZERO[code] : '')}${currency ? ` ${currency}` : ''}`.trim();
  const fraction = fractionWords(fractionText, code);
  const spelled = fraction.words
    ? `${unit || ZERO[code]}${fraction.joint}${fraction.words}`
    : unit;

  if (number < 0) return `${MINUS[code]} ${spelled}`;

  return spelled;
}

export default amountInWords;
