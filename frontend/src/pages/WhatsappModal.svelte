<svelte:options runes={false} />

<script>
  import { balanceStatus } from '../utils/balanceStatus.js';
  import { createEventDispatcher, onMount } from 'svelte';

  import { t, lang, translate_org_type, settings_all, shortID } from '../i18n/i18n';

  import { showDate } from '../calendar.js';

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const DEFAULT_CUSTOMER_ACCOUNT_CREATED_TEMPLATE = `مشتری گرامی {{اسم مشتری}}،

✅ حساب شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📊 از این پس تمامی معاملات و گزارش‌های شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از اعتماد شما سپاسگزاریم.`;

  const DEFAULT_SUPPLIER_ACCOUNT_CREATED_TEMPLATE = `تأمین‌کننده گرامی {{اسم مشتری}}،

✅ حساب تأمین‌کننده شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📦 از این پس تمامی خریدها، پرداخت‌ها، بدهی‌ها و گزارش‌های حساب شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از همکاری شما سپاسگزاریم.`;

  $: account_created_template =
    $settings_all.find((s) => s.key === 'account_created_template')?.value ||
    DEFAULT_CUSTOMER_ACCOUNT_CREATED_TEMPLATE;

  $: customer_account_created_template =
    $settings_all.find((s) => s.key === 'customer_account_created_template')?.value ||
    $settings_all.find((s) => s.key === 'account_customer_created_template')?.value ||
    DEFAULT_CUSTOMER_ACCOUNT_CREATED_TEMPLATE;

  $: supplier_account_created_template =
    $settings_all.find((s) => s.key === 'supplier_account_created_template')?.value ||
    $settings_all.find((s) => s.key === 'account_supplier_created_template')?.value ||
    DEFAULT_SUPPLIER_ACCOUNT_CREATED_TEMPLATE;

  /*
   * Customer account creation uses the setting that already exists
   * in your Settings page: account_whatsapp_welcome_template.
   *
   * Supplier accounts can use a separate setting. When it has not
   * been created yet, the built-in supplier template is used.
   */
  $: supplier_account_whatsapp_welcome_template =
    $settings_all.find(
      (s) => s.key === 'supplier_account_whatsapp_welcome_template',
    )?.value ||
    $settings_all.find(
      (s) => s.key === 'supplier_account_created_template',
    )?.value ||
    DEFAULT_SUPPLIER_ACCOUNT_CREATED_TEMPLATE;

  $: patient_created_template = $settings_all.find((s) => s.key === 'patient_created_template')?.value || '';
  $: journal_created_template = $settings_all.find((s) => s.key === 'journal_created_template')?.value || '';
  $: appointment_created_template = $settings_all.find((s) => s.key === 'appointment_created_template')?.value || '';

  const DEFAULT_SALE_CREATED_TEMPLATE = `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

بل فروش
🔢 شماره بل: {{شماره بل}}

محترم {{اسم حساب}}،

🛒 محصولات:
{{محصولات}}

💰 مجموع بل: {{مجموع بل}}
🎁 تخفیف: {{تخفیف}}
💸 مصارف: {{مصارف}}
✅ مبلغ قابل پرداخت: {{رسید بل}}

🟥 بیلانس قبلی: {{بیلانس قبلی}}
⚖️ بیلانس فعلی: {{بیلانس}}

💬 توضیحات: {{توضیحات}}

🙏 از خرید و اعتماد شما سپاسگزاریم.`;

  const DEFAULT_EXCHANGE_CREATED_TEMPLATE = `🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

💱 نرخ تبادله ارز
🔢 شماره تبادله: {{شماره تبادله}}

از ارز: {{ارز اول}}
به ارز: {{ارز دوم}}
📈 نرخ: {{نرخ}}

👤 حساب: {{اسم حساب}}
👥 حساب همتا: {{حساب همتا}}
💰 مقدار اول: {{مقدار اول}}
💰 مقدار دوم: {{مقدار دوم}}

📝 توضیحات: {{توضیحات}}`;

  $: sale_created_template =
    $settings_all.find((s) => s.key === 'sale_created_template')?.value ||
    DEFAULT_SALE_CREATED_TEMPLATE;

  $: exchange_created_template =
    $settings_all.find((s) => s.key === 'exchange_created_template')?.value ||
    DEFAULT_EXCHANGE_CREATED_TEMPLATE;

  $: exchange_created_template =
    $settings_all.find((s) => s.key === 'exchange_created_template')?.value ||
    DEFAULT_EXCHANGE_CREATED_TEMPLATE;

  $: account_whatsapp_welcome_template =
    $settings_all.find(
      (s) => s.key === 'account_whatsapp_welcome_template',
    )?.value ||
    account_created_template ||
    DEFAULT_CUSTOMER_ACCOUNT_CREATED_TEMPLATE;

  $: account_whatsapp_balance_template = $settings_all.find((s) => s.key === 'account_whatsapp_balance_template')?.value || '';
  $: account_whatsapp_note_template = $settings_all.find((s) => s.key === 'account_whatsapp_note_template')?.value || '';

  $: company_name = $settings_all.find((s) => s.key === 'company_name')?.value || '';
  $: company_phone = $settings_all.find((s) => s.key === 'company_phone')?.value || '';
  $: company_phone2 = $settings_all.find((s) => s.key === 'company_phone2')?.value || '';
  $: company_address = $settings_all.find((s) => s.key === 'company_address')?.value || '';
  $: company_email = $settings_all.find((s) => s.key === 'company_email')?.value || '';

  export let showWhatsappModal = false;

  export let message = '';
  export let phone = '';

  let readOnlyMessage = true;

  const footer = "\n\n`تهیه شده توسط زینو ای آر پی`";

  let monthNames = [
    'جنوری',
    'فبروری',
    'مارچ',
    'اپریل',
    'می',
    'جون',
    'جولای',
    'اگست',
    'سپتمبر',
    'اکتوبر',
    'نومبر',
    'دسمبر',
  ];

  function normalizeWhatsappPhone(value = '') {
    return value.startsWith('07') ? '+93' + value.slice(1) : value;
  }

  /*
   * Force every message line to follow the selected application language.
   * This keeps English account/customer names on the right in RTL mode and
   * on the left in LTR mode, both in the preview and after sending to WhatsApp.
   */
  function applyMessageDirection(value = '') {
    const directionMark = t('dir') === 'rtl' ? '\u200F' : '\u200E';

    return String(value ?? '')
      .split('\n')
      .map((line) => {
        if (!line) return line;

        const cleanLine = line.replace(/^[\u200E\u200F]+/, '');
        return `${directionMark}${cleanLine}`;
      })
      .join('\n');
  }

  function getWhatsappText() {
    return encodeURIComponent(
      applyMessageDirection(message + footer),
    );
  }

  function getWhatsappAppUrl() {
    const appPhone = String(phone || '').replace(/\D/g, '');
    return `whatsapp://send?phone=${appPhone}&text=${getWhatsappText()}`;
  }

  function getWhatsappInstallUrl() {
    return 'https://www.whatsapp.com/download';
  }

  function sendToWhatsapp(event) {
    event.preventDefault();

    const appUrl = getWhatsappAppUrl();
    const installUrl = getWhatsappInstallUrl();

    /*
     * Reserve a new tab immediately during the user's click.
     * This avoids popup blockers and guarantees that the ERP tab
     * will never be replaced by the WhatsApp download page.
     */
    const whatsappTab = window.open('about:blank', '_blank');

    if (!whatsappTab) {
      window.alert(
        'Please allow pop-ups for this website, then try again.',
      );
      return;
    }

    try {
      whatsappTab.opener = null;
      whatsappTab.document.title = 'Opening WhatsApp';
      whatsappTab.document.body.innerHTML = `
        <div style="
          min-height:100vh;
          display:grid;
          place-items:center;
          margin:0;
          padding:24px;
          box-sizing:border-box;
          background:#f8fafc;
          color:#334155;
          font-family:Arial,sans-serif;
          text-align:center;
        ">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:8px;">
              Opening WhatsApp…
            </div>
            <div style="font-size:14px;color:#64748b;">
              If WhatsApp is not installed, the download page will open.
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.warn('Could not prepare WhatsApp tab:', error);
    }

    /*
     * Try to open the desktop WhatsApp application from the new tab.
     * The ERP page is never navigated.
     */
    try {
      whatsappTab.location.href = appUrl;
    } catch (error) {
      console.warn('Could not open WhatsApp protocol:', error);
    }

    /*
     * Browsers do not provide a reliable API for checking whether a
     * custom-protocol application exists. If the new tab remains open,
     * reuse only that tab for the official WhatsApp download page.
     */
    window.setTimeout(() => {
      try {
        if (whatsappTab && !whatsappTab.closed) {
          whatsappTab.location.replace(installUrl);
        }
      } catch (error) {
        try {
          if (whatsappTab && !whatsappTab.closed) {
            whatsappTab.location.href = installUrl;
          }
        } catch (fallbackError) {
          console.warn(
            'Could not open the WhatsApp download page:',
            fallbackError,
          );
        }
      }
    }, 1800);
  }

  function formatBalanceLines(balance = {}) {
    return Object.entries(balance)
      .sort(([currencyA], [currencyB]) => {
        const order = { AFN: 0, USD: 1 };
        return (order[currencyA] ?? 99) - (order[currencyB] ?? 99);
      })
      .map(([currency, value]) => {
        const amount = typeof value === 'object' ? Number(value.balance || 0) : Number(value || 0);
        const label = amount >= 0 ? 'طلبکار' : 'باقیدار';
        return `\u200E${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(currency)} ${label}`;
      })
      .join('\n');
  }

  function buildAccountMessage(template = '', acc_id = '', accdata = {}, firstEntryBalance = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const balanceText = `\n${formatBalanceLines(firstEntryBalance)}`;
    return template
      .split('{{نام شرکت}}')
      .join(company_name)
      .split('{{تاریخ}}')
      .join(today)
      .split('{{شماره حساب}}')
      .join(shortID(acc_id || accdata.id))
      .split('{{اسم مشتری}}')
      .join(accdata.name || '')
      .split('{{اسم تأمین‌کننده}}')
      .join(accdata.name || '')
      .split('{{اسم تامین‌کننده}}')
      .join(accdata.name || '')
      .split('{{اسم عرضه‌کننده}}')
      .join(accdata.name || '')
      .split('{{اسم حساب}}')
      .join(accdata.name || '')
      .split('{{نوع حساب}}')
      .join(accdata.account_type_label || '')
      .split('{{بیلانس}}')
      .join(balanceText)
      .split('{{نوت}}')
      .join(accdata.description || '')
      .split('{{توضیحات}}')
      .join(accdata.description || '')
      .split('{{ایمیل شرکت}}')
      .join(company_email)
      .split('{{شماره شرکت}}')
      .join(company_phone)
      .split('{{شماره۲ شرکت}}')
      .join(company_phone2)
      .split('{{آدرس شرکت}}')
      .join(company_address);
  }

  function getWhatsappAccountName(account = {}) {
    if (!account) return '';

    if (t('Lang') === 'fa') {
      return account.name_fa || account.name || account.name_ps || '';
    }

    if (t('Lang') === 'ps') {
      return account.name_ps || account.name_fa || account.name || '';
    }

    return account.name || account.name_fa || account.name_ps || '';
  }

  function formatWhatsappMoney(value, currency) {
    const amount = Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 3,
    });

    return currency ? `${amount} ${t(currency)}` : amount;
  }

  function formatWhatsappBalance(balance = {}) {
    return Object.entries(balance || {})
      .map(([currency, value]) => {
        const amount =
          typeof value === 'object'
            ? Number(value?.balance || 0)
            : Number(value || 0);

        return `${amount.toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })} ${t(currency)}`;
      })
      .join(' | ');
  }

  function formatSaleBalance(value, currency) {
    const status = balanceStatus(value);
    return formatSaleMoney(value, currency) + (status ? ` (${t(status)})` : '');
  }

  function formatSaleMoney(value, currency) {
    const amount = Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 3,
    });

    return currency ? `${amount} ${t(currency)}` : amount;
  }

  function getSaleExpenseAmount(saleData = {}) {
    const directValues = [
      saleData.expense_amount,
      saleData.expenses_amount,
      saleData.total_expenses,
      saleData.additional_expenses,
      saleData.shipping_cost,
      saleData.delivery_cost,
      saleData.service_charge,
    ];

    for (const value of directValues) {
      const amount = Number(value);
      if (Number.isFinite(amount)) return amount;
    }

    if (Array.isArray(saleData.expenses)) {
      return saleData.expenses.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.amount ??
              item?.expense_amount ??
              item?.value ??
              0,
          ),
        0,
      );
    }

    const fallback = Number(saleData.expenses || 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  export function openModal(
    temp = 'account_created_template',
    acc_id = '',
    accdata = {},
    firstEntryBalance = {},
    secondAcc = {},
    referenceText = '',
    saleData = null,
  ) {
    message = '';
    phone = '';
    readOnlyMessage = true;

    if (temp == 'patient_created_template') {
      message = patient_created_template
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{کد مریض}}')
        .join(accdata.code)
        .split('{{اسم مریض}}')
        .join(accdata.name)
        .split('{{ایمیل شرکت}}')
        .join(company_email)
        .split('{{شماره شرکت}}')
        .join(company_phone)
        .split('{{شماره۲ شرکت}}')
        .join(company_phone2)
        .split('{{آدرس شرکت}}')
        .join(company_address);

      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    } else if (
      temp == 'account_whatsapp_welcome_template' ||
      temp == 'supplier_account_whatsapp_welcome_template' ||
      temp == 'account_whatsapp_balance_template' ||
      temp == 'account_whatsapp_note_template'
    ) {
      const templates = {
        account_whatsapp_welcome_template,
        supplier_account_whatsapp_welcome_template,
        account_whatsapp_balance_template,
        account_whatsapp_note_template,
      };

      /*
       * Use the Settings value first. The fallback prevents the
       * textarea from becoming empty when a setting is missing.
       */
      const selectedTemplate =
        templates[temp] ||
        account_whatsapp_welcome_template ||
        DEFAULT_CUSTOMER_ACCOUNT_CREATED_TEMPLATE;

      message = buildAccountMessage(
        selectedTemplate,
        acc_id,
        accdata,
        firstEntryBalance,
      );

      phone = accdata?.phone
        ? normalizeWhatsappPhone(accdata.phone)
        : '';
    } else if (
      temp == 'account_created_template' ||
      temp == 'customer_account_created_template' ||
      temp == 'supplier_account_created_template'
    ) {
      const accountTemplates = {
        account_created_template:
          account_whatsapp_welcome_template ||
          account_created_template,
        customer_account_created_template:
          account_whatsapp_welcome_template ||
          customer_account_created_template,
        supplier_account_created_template:
          supplier_account_whatsapp_welcome_template ||
          supplier_account_created_template,
      };

      message = buildAccountMessage(
        accountTemplates[temp] || account_created_template,
        acc_id,
        accdata,
        firstEntryBalance,
      );

      phone = accdata?.phone
        ? normalizeWhatsappPhone(accdata.phone)
        : '';
    } else if (temp == 'journal_created_template') {
      const dateValue = String(acc_id?.date || '');
      const dateParts = dateValue
        ? showDate(dateValue, 'forPDF')
        : ['', '', ''];

      const formattedDate = dateValue
        ? `${dateParts[0]} ${dateParts[1]} ${dateParts[2]} مطابق ${
            dateValue.slice(8, 10)
          } ${
            monthNames[parseInt(dateValue.slice(5, 7), 10) - 1] || ''
          } ${dateValue.slice(0, 4)}`
        : '';

      const debitAmount = Number(acc_id?.first_entry_debit || 0);
      const creditAmount = Number(acc_id?.first_entry_credit || 0);
      const journalAmount =
        debitAmount !== 0 ? debitAmount : creditAmount;

      const amountOnly = formatWhatsappMoney(
        journalAmount,
        acc_id?.currency,
      );

      const amountWithType = `${
        debitAmount !== 0 ? t('Debit') : t('Credit')
      }: ${amountOnly}`;

      /*
       * JournalReceiptModal passes the linked sale as the seventh
       * argument and also copies invoice_number into acc_id.
       * Both methods are supported so older calls keep working.
       */
      const invoiceNumber =
        saleData?.invoice_number ||
        acc_id?.invoice_number ||
        acc_id?.bill_number ||
        '-';

      /*
       * Always show the peer account. Previously it was hidden when
       * main_acc was "true", which caused {{حساب همتا}} to be empty.
       */
      const peerAccountName =
        getWhatsappAccountName(secondAcc) || '-';

      const firstAccountName =
        getWhatsappAccountName(accdata) || '-';

      const balanceText =
        formatWhatsappBalance(firstEntryBalance);

      message = String(journal_created_template || '')
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(formattedDate)
        .split('{{مرجع}}')
        .join(referenceText || '')
        .split('{{اسم حساب}}')
        .join(firstAccountName)
        .split('{{اسم مشتری}}')
        .join(firstAccountName)
        .split('{{شماره حساب}}')
        .join(shortID(accdata?.id || 0))

        /*
         * Peer-account placeholders.
         * The template already contains "حساب همتا:", so insert
         * only the account name to prevent duplicate labels.
         */
        .split('{{حساب همتا}}')
        .join(peerAccountName)
        .split('{{نام حساب همتا}}')
        .join(peerAccountName)

        /*
         * Amount placeholders.
         * {{مقدار پول}} includes Debit/Credit.
         * {{مقدار}} and {{مبلغ}} contain value + currency only.
         */
        .split('{{مقدار پول}}')
        .join(amountWithType)
        .split('{{مقدار}}')
        .join(amountOnly)
        .split('{{مبلغ}}')
        .join(amountOnly)

        /*
         * Sale invoice/bill placeholders.
         */
        .split('{{شماره بل}}')
        .join(invoiceNumber)
        .split('{{شماره فاکتور}}')
        .join(invoiceNumber)
        .split('{{بل}}')
        .join(invoiceNumber)

        .split('{{بیلانس}}')
        .join(balanceText)
        .split('{{توضیحات}}')
        .join(
          acc_id?.description
            ? `توضیحات: ${acc_id.description}`
            : '',
        )
        .split('{{ایمیل شرکت}}')
        .join(company_email)
        .split('{{شماره شرکت}}')
        .join(company_phone)
        .split('{{شماره۲ شرکت}}')
        .join(company_phone2)
        .split('{{آدرس شرکت}}')
        .join(company_address);

      phone = accdata?.phone
        ? normalizeWhatsappPhone(accdata.phone)
        : '';
    } else if (temp == 'appointment_created_template') {
      message = appointment_created_template
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(
          showDate(acc_id.date, 'forPDF')[0] +
            ' ' +
            showDate(acc_id.date, 'forPDF')[1] +
            ' ' +
            showDate(acc_id.date, 'forPDF')[2] +
            ' مطابق ' +
            acc_id.date.slice(8, 10) +
            ' ' +
            monthNames[parseInt(acc_id.date.slice(5, 7)) - 1] +
            ' ' +
            acc_id.date.slice(0, 4),
        )
        .split('{{دیپارتمنت}}')
        .join(referenceText)
        .split('{{اسم مریض}}')
        .join(accdata.name)
        .split('{{داکتر}}')
        .join(secondAcc.first_name + ' ' + secondAcc.last_name)
        .split('{{کد مریض}}')
        .join(accdata.code)
        .split('{{مقدار پول}}')
        .join(
          t('Appointment Fee') +
            ': ' +
            Number(acc_id.fee || 0).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            }) +
            ' ' +
            t(acc_id.currency),
        )
        .split('{{شماره نوبت}}')
        .join(acc_id.serial_no)
        .split('{{توضیحات}}')
        .join(acc_id.description ? 'توضیحات: ' + acc_id.description : '');

      if (accdata.phone) {
        phone = accdata.phone.startsWith('07') ? '+93' + accdata.phone.slice(1) : accdata.phone;
      }
    } else if (temp == 'sale_created_template') {
      const saleValue = acc_id || {};
      const saleItems = Array.isArray(saleValue.items)
        ? saleValue.items
        : [];

      const productsText = saleItems
        .map((item, index) => {
          const quantity = Number(
            item?.quantity || 0,
          ).toLocaleString(undefined, {
            maximumFractionDigits: 3,
          });

          const unitPrice = formatSaleMoney(
            item?.unit_price ??
              item?.calculated_price ??
              0,
            item?.currency || saleValue.currency,
          );

          const subtotal = formatSaleMoney(
            item?.subtotal ??
              Number(item?.quantity || 0) *
                Number(
                  item?.unit_price ??
                    item?.calculated_price ??
                    0,
                ),
            item?.currency || saleValue.currency,
          );

          const unit =
            item?.unit_name ||
            item?.product_unit_name ||
            '';

          return `\u200F${index + 1}. ${
            item?.product_name || '-'
          } — ${quantity}${unit ? ` ${unit}` : ''} — ${unitPrice} — ${subtotal}`;
        })
        .join('\n');

      const invoiceDate = String(
        saleValue.invoice_date ||
          saleValue.date ||
          '',
      );

      const dateParts = invoiceDate
        ? showDate(invoiceDate, 'forPDF')
        : ['', '', ''];

      const formattedDate = invoiceDate
        ? `${dateParts[0]} ${dateParts[1]} ${dateParts[2]} مطابق ${
            invoiceDate.slice(8, 10)
          } ${
            monthNames[
              parseInt(invoiceDate.slice(5, 7), 10) - 1
            ] || ''
          } ${invoiceDate.slice(0, 4)}`
        : '';

      const currency = saleValue.currency || 'AFN';

      const billSubtotal = Number(
        saleValue.bill_subtotal ??
          saleItems.reduce(
            (sum, item) =>
              sum + Number(item?.subtotal || 0),
            0,
          ),
      );

      const discountAmount = Number(
        saleValue.discount_amount ??
          saleValue.discount ??
          0,
      );

      const expenseAmount = getSaleExpenseAmount(
        saleValue,
      );

      const payableAmount = Number(
        saleValue.payable_amount ??
          saleValue.total_amount ??
          billSubtotal -
            discountAmount +
            expenseAmount,
      );

      const paidAmount = Number(
        saleValue.paid ??
          saleValue.received_amount ??
          0,
      );

      const previousBalanceText = Object.entries(
        firstEntryBalance || {},
      )
        .map(([balanceCurrency, value]) => {
          const currentBalance =
            typeof value === 'object'
              ? Number(value?.balance || 0)
              : Number(value || 0);

          const due = Number(
            saleValue.due ??
              payableAmount - paidAmount,
          );

          const previousBalance =
            balanceCurrency === currency
              ? currentBalance + due
              : currentBalance;

          return formatSaleBalance(
            previousBalance,
            balanceCurrency,
          );
        })
        .join(' | ');

      const currentBalanceText = Object.entries(
        firstEntryBalance || {},
      )
        .map(([balanceCurrency, value]) => {
          const amount =
            typeof value === 'object'
              ? Number(value?.balance || 0)
              : Number(value || 0);

          return formatSaleBalance(
            amount,
            balanceCurrency,
          );
        })
        .join(' | ');

      message = String(
        sale_created_template ||
          DEFAULT_SALE_CREATED_TEMPLATE,
      )
        .split('{{نام شرکت}}')
        .join(company_name)
        .split('{{تاریخ}}')
        .join(formattedDate)
        .split('{{اسم حساب}}')
        .join(getWhatsappAccountName(accdata) || '-')
        .split('{{اسم مشتری}}')
        .join(getWhatsappAccountName(accdata) || '-')
        .split('{{شماره حساب}}')
        .join(shortID(accdata?.id || 0))
        .split('{{شماره بل}}')
        .join(saleValue.invoice_number || '-')
        .split('{{شماره فاکتور}}')
        .join(saleValue.invoice_number || '-')
        .split('{{محصولات}}')
        .join(productsText || '-')
        .split('{{مجموع بل}}')
        .join(
          formatSaleMoney(
            billSubtotal,
            currency,
          ),
        )
        .split('{{تخفیف}}')
        .join(
          formatSaleMoney(
            discountAmount,
            currency,
          ),
        )
        .split('{{مصارف}}')
        .join(
          formatSaleMoney(
            expenseAmount,
            currency,
          ),
        )
        .split('{{هزینه}}')
        .join(
          formatSaleMoney(
            expenseAmount,
            currency,
          ),
        )
        /*
         * In your selected format, {{رسید بل}} is used for
         * "مبلغ قابل پرداخت". Therefore it uses payableAmount.
         */
        .split('{{رسید بل}}')
        .join(
          formatSaleMoney(
            payableAmount,
            currency,
          ),
        )
        .split('{{مبلغ قابل پرداخت}}')
        .join(
          formatSaleMoney(
            payableAmount,
            currency,
          ),
        )
        .split('{{مبلغ پرداخت شده}}')
        .join(
          formatSaleMoney(
            paidAmount,
            currency,
          ),
        )
        .split('{{باقی مانده}}')
        .join(
          formatSaleMoney(
            payableAmount - paidAmount,
            currency,
          ),
        )
        .split('{{بیلانس قبلی}}')
        .join(previousBalanceText || '-')
        .split('{{بیلانس}}')
        .join(currentBalanceText || '-')
        .split('{{توضیحات}}')
        .join(saleValue.description || '')
        .split('{{ایمیل شرکت}}')
        .join(company_email)
        .split('{{شماره شرکت}}')
        .join(company_phone)
        .split('{{شماره۲ شرکت}}')
        .join(company_phone2)
        .split('{{آدرس شرکت}}')
        .join(company_address);

      phone = accdata?.phone
        ? normalizeWhatsappPhone(accdata.phone)
        : '';
    } else if (temp == 'exchange_created_template') {
      const exchangeValue = acc_id || {};
      const exchangeDate = String(exchangeValue.date || '');
      const dateParts = exchangeDate
        ? showDate(exchangeDate.slice(0, 10), 'forPDF')
        : ['', '', ''];
      const formattedDate = exchangeDate
        ? `${dateParts[0]} ${dateParts[1]} ${dateParts[2]} مطابق ${exchangeDate.slice(8, 10)} ${monthNames[parseInt(exchangeDate.slice(5, 7), 10) - 1] || ''} ${exchangeDate.slice(0, 4)}`
        : '';
      const firstAccountName = getWhatsappAccountName(accdata) || '-';
      const peerAccountName = getWhatsappAccountName(secondAcc) || '-';
      const firstAmount = Number(exchangeValue.first_entry_debit || exchangeValue.first_entry_credit || 0)
        .toLocaleString(undefined, { maximumFractionDigits: 3 });
      const secondAmount = Number(exchangeValue.second_entry_debit || exchangeValue.second_entry_credit || 0)
        .toLocaleString(undefined, { maximumFractionDigits: 3 });

      message = String(exchange_created_template || DEFAULT_EXCHANGE_CREATED_TEMPLATE)
        .split('{{نام شرکت}}').join(company_name)
        .split('{{تاریخ}}').join(formattedDate)
        .split('{{شماره تبادله}}').join(shortID(exchangeValue.id || '-'))
        .split('{{ارز اول}}').join(t(exchangeValue.first_currency) || exchangeValue.first_currency || '-')
        .split('{{ارز دوم}}').join(t(exchangeValue.second_currency) || exchangeValue.second_currency || '-')
        .split('{{نرخ}}').join(Number(exchangeValue.rate || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }))
        .split('{{اسم حساب}}').join(firstAccountName)
        .split('{{حساب همتا}}').join(peerAccountName)
        .split('{{مقدار اول}}').join(`${firstAmount} ${t(exchangeValue.first_currency) || exchangeValue.first_currency || ''}`)
        .split('{{مقدار دوم}}').join(`${secondAmount} ${t(exchangeValue.second_currency) || exchangeValue.second_currency || ''}`)
        .split('{{توضیحات}}').join(exchangeValue.description || '')
        .split('{{ایمیل شرکت}}').join(company_email)
        .split('{{شماره شرکت}}').join(company_phone)
        .split('{{شماره۲ شرکت}}').join(company_phone2)
        .split('{{آدرس شرکت}}').join(company_address);

      phone = accdata?.phone
        ? normalizeWhatsappPhone(accdata.phone)
        : '';
    }

    readOnlyMessage = true;
    showWhatsappModal = true;

    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }

  export function closeModal() {
    showWhatsappModal = false;
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) closeModal();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && showWhatsappModal) closeModal();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if showWhatsappModal}
  <div
    class="wa-overlay"
    dir={t('dir')}
    role="presentation"
    on:click={handleOverlayClick}>
    <div
      class="wa-panel"
      dir={t('dir')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title">
      <header class="wa-header">
        <div class="wa-header-main">
          <span class="wa-icon" aria-hidden="true">
            <i class="bi bi-whatsapp"></i>
          </span>
          <h2 id="wa-modal-title" class="wa-title">{t('Send Whatsapp Message')}</h2>
        </div>
        <button type="button" class="wa-close" aria-label={t('Close')} on:click={closeModal}>
          <i class="bi bi-x-lg"></i>
        </button>
      </header>

      <div class="wa-body">
        <div class="wa-field">
          <label class="wa-label" for="wa-phone">{t('Whatsapp Number')}</label>
          <div class="wa-phone-row">
            <input
              id="wa-phone"
              type="text"
              class="wa-input"
              readonly={readOnlyMessage}
              bind:value={phone}
              dir="ltr" />
            <button
              type="button"
              class="wa-edit"
              class:active={!readOnlyMessage}
              aria-label={t('Edit')}
              on:click={() => {
                readOnlyMessage = !readOnlyMessage;
              }}>
              <i class="bi bi-pencil"></i>
            </button>
          </div>
        </div>

        <div class="wa-field">
          <label class="wa-label" for="wa-message">{t('Message')}</label>
          <textarea
            id="wa-message"
            class="wa-textarea"
            rows="8"
            dir={t('dir')}
            readonly={readOnlyMessage}
            bind:value={message}></textarea>
        </div>
      </div>

      <footer class="wa-footer">
        <button type="button" class="wa-btn wa-btn--secondary" on:click={closeModal}>
          {t('Close')}
        </button>
        {#if phone && phone.length >= 10}
          <button
            type="button"
            class="wa-btn wa-btn--primary"
            on:click={sendToWhatsapp}>
            <i class="bi bi-whatsapp" aria-hidden="true"></i>
            {t('Send to Whatsapp')}
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .wa-overlay {
    position: fixed;
    inset: 0;
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .wa-panel {
    width: min(95vw, 28rem);
    max-height: min(90vh, 40rem);
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 1rem;
    background: #ffffff;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.16);
    overflow: hidden;
    min-width: 0;
    direction: inherit;
    text-align: start;
  }

  .wa-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  .wa-header-main {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    text-align: start;
  }

  .wa-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(37, 211, 102, 0.14);
    color: #128c7e;
    font-size: 1.1rem;
  }

  .wa-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
    text-align: start;
  }

  .wa-close {
    width: 2rem;
    height: 2rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .wa-close:hover {
    background: #f8fafc;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .wa-body {
    padding: 1rem;
    overflow: auto;
    min-height: 0;
    direction: inherit;
    text-align: start;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .wa-body::-webkit-scrollbar {
    display: none;
  }

  .wa-field {
    display: grid;
    gap: 0.35rem;
    direction: inherit;
    text-align: start;
  }

  .wa-field + .wa-field {
    margin-top: 0.85rem;
  }

  .wa-label {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-align: start;
  }

  .wa-phone-row {
    display: flex;
    align-items: stretch;
    gap: 0.45rem;
  }

  .wa-input,
  .wa-textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid #dbe7f3;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
    padding: 0.55rem 0.7rem;
    text-align: start;
    direction: inherit;
    unicode-bidi: isolate;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .wa-input:focus,
  .wa-textarea:focus {
    outline: none;
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .wa-input:read-only,
  .wa-textarea:read-only {
    background: #f8fafc;
    color: #334155;
  }

  .wa-input[dir='ltr'] {
    direction: ltr;
    text-align: left;
    unicode-bidi: isolate;
  }

  .wa-textarea {
    min-height: 10rem;
    resize: vertical;
    direction: inherit;
    text-align: start;
    unicode-bidi: isolate;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .wa-textarea::-webkit-scrollbar {
    display: none;
  }

  .wa-edit {
    width: 2.5rem;
    flex-shrink: 0;
    border: 1px solid #dbe7f3;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .wa-edit:hover,
  .wa-edit.active {
    background: #f0fdf4;
    border-color: #86efac;
    color: #128c7e;
  }

  .wa-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    direction: inherit;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    flex-shrink: 0;
  }

  .wa-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.85rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid transparent;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .wa-btn--secondary {
    background: #ffffff;
    border-color: #e2e8f0;
    color: #475569;
  }

  .wa-btn--secondary:hover {
    background: #f1f5f9;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .wa-btn--primary {
    background: #25d366;
    border-color: #25d366;
    color: #ffffff;
  }

  .wa-btn--primary:hover {
    background: #128c7e;
    border-color: #128c7e;
    color: #ffffff;
  }

  .wa-btn--outline {
    background: #ffffff;
    border-color: #86efac;
    color: #128c7e;
  }

  .wa-btn--outline:hover {
    background: #f0fdf4;
    border-color: #25d366;
    color: #075e54;
  }

  @media (max-width: 480px) {
    .wa-footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .wa-btn {
      width: 100%;
    }
  }
</style>