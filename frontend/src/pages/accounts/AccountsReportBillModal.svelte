<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import AppModal from '../../components/common/AppModal.svelte';
  import { showDate } from '../../calendar.js';
  import { t } from '../../i18n/i18n.js';
import { settingsApi } from '../../api/settingsApi.js';

  export let accounts = [];
  export let fromDate = '';
  export let toDate = '';

  let settings = [];

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  onMount(async () => {
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  });

  function getSetting(key) {
    return settings.find((setting) => setting.key === key)?.value || '';
  }

  function getAccountDisplayName(account) {
    if (t('Lang') === 'fa' && account.name_fa) {
      return account.name_fa;
    }

    if (t('Lang') === 'ps' && account.name_ps) {
      return account.name_ps;
    }

    return account.name || account.name_fa || account.name_ps || '-';
  }

  function getAccountPhone(account) {
    return account.phone || account.phone2 || '-';
  }

  function getPrintableBalances(account) {
    if (!account.computedBalances) {
      return [
        {
          currency: account.currency || '',
          balance:
            Number(account.balance || account.credit || 0) -
            Number(account.debit || 0),
        },
      ];
    }

    return Object.entries(account.computedBalances)
      .filter(([, balance]) => balance.active)
      .map(([currency, balance]) => ({
        currency,
        balance:
          Number(balance.credit || 0) -
          Number(balance.debit || 0),
      }));
  }

  function getCurrencyLabel(currency) {
    if (currency === 'AFN') return 'افغانی';
    if (currency === 'USD') return 'دالر';

    return t(currency);
  }

  /*
   * Negative values use a trailing minus:
   *
   * 123,830.00-
   */
  function formatMoneyParts(currency, value) {
    const numericValue = Number(value || 0);

    const absoluteValue = Math.abs(numericValue).toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
      },
    );

    return {
      value:
        numericValue < 0
          ? `${absoluteValue}-`
          : absoluteValue,

      currency: currency
        ? getCurrencyLabel(currency)
        : '',
    };
  }

  $: rows = accounts
    .filter((account) => account.include)
    .flatMap((account) => {
      const balances = getPrintableBalances(account);

      const printableBalances = balances.length
        ? balances
        : [{ currency: '', balance: 0 }];

      return printableBalances.map((balance) => {
        const formattedBalance = formatMoneyParts(
          balance.currency,
          balance.balance,
        );

        return {
          name: getAccountDisplayName(account),
          phone: getAccountPhone(account),

          /*
           * Keep the original numeric balance and currency code.
           * These values are used to calculate the bill total.
           */
          balanceNumeric: Number(balance.balance || 0),
          balanceCurrencyCode: balance.currency || '',

          balanceValue: formattedBalance.value,
          balanceCurrency: formattedBalance.currency,
        };
      });
    });

  /*
   * Calculate a separate total for every currency.
   *
   * Example:
   * AFN accounts are summed together.
   * USD accounts are summed together.
   */
  $: balanceTotals = Object.entries(
    rows.reduce((totals, row) => {
      const currency = row.balanceCurrencyCode || '';

      totals[currency] =
        Number(totals[currency] || 0) +
        Number(row.balanceNumeric || 0);

      return totals;
    }, {}),
  ).map(([currency, balance]) => {
    const formattedBalance = formatMoneyParts(
      currency,
      balance,
    );

    return {
      currencyCode: currency,
      balanceNumeric: balance,
      balanceValue: formattedBalance.value,
      balanceCurrency: formattedBalance.currency,
    };
  });

  function printReceipt() {
    const content =
      document.getElementById(
        'accounts-report-bill-content',
      )?.innerHTML || '';

    const styles = `
      <style>
        @page {
          size: 74mm auto;
          margin: 0;
        }

        html,
        body {
          margin: 0;
          padding: 0;
        }

        * {
          box-sizing: border-box;
          color: #000 !important;
        }

        body {
          font-family: Vazirmatn, sans-serif;
        }

        .receipt {
          width: 74mm;
          max-width: 74mm;
          margin: 0 auto;
          padding: 8px 4px;
          overflow: hidden;
          background: #fff;
        }

        .center {
          text-align: center;
        }

        .brand {
          font-size: 16px;
          font-weight: 700;
        }

        table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          border-bottom: 2px solid #000 !important;
        }

        th {
          border-top: 2px solid #000 !important;
          border-bottom: 2px solid #000 !important;
          font-size: 9pt !important;
          font-weight: 700;
        }

        td {
          padding: 4px 2px !important;
          border-bottom: 1px solid #000 !important;
          font-size: 8pt !important;
          vertical-align: middle;
        }

        th:nth-child(1),
        td:nth-child(1) {
          width: 8%;
          text-align: center;
        }

        th:nth-child(2),
        td:nth-child(2) {
          width: 28%;
        }

        th:nth-child(3),
        td:nth-child(3) {
          width: 24%;
          direction: ltr;
          text-align: center;
          white-space: nowrap;
          word-break: keep-all;
          overflow-wrap: normal;
        }

        th:nth-child(4),
        td:nth-child(4) {
          width: 40%;
          text-align: center;
        }

        .phone-cell {
          direction: ltr !important;
          unicode-bidi: isolate !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
          font-size: 7pt !important;
        }

        .money-cell {
          direction: rtl !important;
          unicode-bidi: isolate !important;
          text-align: center !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
          overflow: visible !important;
          font-size: 6.7pt !important;
        }

        /*
         * DOM order:
         * colon | number | currency
         *
         * Visual RTL order:
         * currency | number | colon
         *
         * Result:
         * افغانی 123,830.00- :
         */
        .balance-line {
          display: inline-flex !important;
          direction: rtl !important;
          unicode-bidi: isolate !important;
          align-items: baseline;
          justify-content: center;
          gap: 2px;
          width: max-content;
          max-width: none !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
        }

        .balance-label {
          direction: rtl !important;
          unicode-bidi: isolate !important;
          flex: 0 0 auto;
          white-space: nowrap !important;
        }

        .balance-number {
          direction: ltr !important;
          unicode-bidi: isolate !important;
          flex: 0 0 auto;
          font-variant-numeric: tabular-nums;
          white-space: nowrap !important;
          word-break: keep-all !important;
        }

        .balance-currency {
          direction: rtl !important;
          unicode-bidi: isolate !important;
          flex: 0 0 auto;
          white-space: nowrap !important;
          word-break: keep-all !important;
        }

        .total-row td {
          border-top: 2px solid #000 !important;
          border-bottom: 1px solid #000 !important;
          background: #f2f2f2 !important;
          font-weight: 800 !important;
        }

        .total-row:last-child td {
          border-bottom: 2px solid #000 !important;
        }

        .total-label {
          direction: rtl !important;
          text-align: end !important;
          padding-inline-end: 6px !important;
          font-size: 8.5pt !important;
          white-space: nowrap !important;
        }

        .total-money-cell {
          direction: rtl !important;
          unicode-bidi: isolate !important;
          text-align: center !important;
          font-size: 7pt !important;
          white-space: nowrap !important;
          overflow: visible !important;
        }
      </style>
    `;

    const printWindow = window.open('', '_blank');

    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html dir="${t('dir')}">
        <head>
          <meta charset="utf-8">
          ${styles}

          <link
            rel="stylesheet"
            href="/fonts/vazirmatn.css"
          >

          <link
            rel="stylesheet"
            href="/css/mdb.rtl.min.css"
          >
        </head>

        <body>
          ${content}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }
</script>

<AppModal
  title={`${t('Bill')} — ${t('Accounts Report')}`}
  icon="bi-printer"
  variant="primary"
  size="sm"
  on:close={close}
>
  <div
    id="accounts-report-bill-content"
    class="receipt-preview-wrap"
  >
    <div class="receipt">
      <div class="center">
        {#if getSetting('company_logo')}
          <img
            src={getSetting('company_logo')}
            alt="Company Logo"
            class="company-logo"
          />
        {/if}

        <div class="brand mt-2">
          {t('Accounts Report')}
        </div>
      </div>

      {#if fromDate || toDate}
        <div class="small fw-bold">
          {showDate(fromDate) || '-'}
          -
          {showDate(toDate) || '-'}
        </div>
      {/if}

      <table
        border="0"
        cellpadding="3"
        cellspacing="0"
        class="w-100 mt-2"
      >
        <tbody>
          <tr>
            <th>{t('#')}</th>
            <th>{t('Name')}</th>
            <th>{t('Phone')}</th>
            <th>{t('Balance')}</th>
          </tr>

          {#each rows as row, index}
            <tr>
              <td>{index + 1}</td>

              <td class="fw-bold">
                {row.name}
              </td>

              <td class="phone-cell fw-bold">
                {row.phone}
              </td>

              <td class="money-cell fw-bold">
                <span
                  class="balance-line"
                  dir="rtl"
                >
                  <span
                    class="balance-label"
                    dir="rtl"
                  >
                    
                  </span>

                  <bdi
                    class="balance-number"
                    dir="ltr"
                  >
                    {row.balanceValue}
                  </bdi>

                  {#if row.balanceCurrency}
                    <span
                      class="balance-currency"
                      dir="rtl"
                    >
                      {row.balanceCurrency}
                    </span>
                  {/if}
                </span>
              </td>
            </tr>
          {/each}

          {#each balanceTotals as total, totalIndex}
            <tr class="total-row">
              <td
                colspan="3"
                class="total-label"
              >
                {#if totalIndex === 0}
                  {t('Total')}
                {/if}
              </td>

              <td class="total-money-cell">
                <span
                  class="balance-line"
                  dir="rtl"
                >
                  <bdi
                    class="balance-number"
                    dir="ltr"
                  >
                    {total.balanceValue}
                  </bdi>

                  {#if total.balanceCurrency}
                    <span
                      class="balance-currency"
                      dir="rtl"
                    >
                      {total.balanceCurrency}
                    </span>
                  {/if}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="center small">
        {t('Powered by ZenoERP • Thank you!')}
      </div>

      <div class="center small">
        www.zenoerp.com
      </div>
    </div>
  </div>

  <svelte:fragment slot="footer">
    <div class="receipt-actions-grid">
      <button
        type="button"
        class="app-modal-btn app-modal-btn--secondary"
        on:click={close}
      >
        <i class="bi bi-x-lg"></i>
        {t('Close')}
      </button>

      <button
        type="button"
        class="app-modal-btn app-modal-btn--primary"
        on:click={printReceipt}
      >
        <i class="bi bi-printer"></i>
        {t('Print')}
      </button>
    </div>
  </svelte:fragment>
</AppModal>

<style>
  :global(.app-modal--primary.app-modal--sm) {
    width: min(100%, 360px);
  }

  :global(
    .app-modal--primary.app-modal--sm
      .app-modal__body
  ) {
    padding: 14px 12px;
  }

  .receipt-preview-wrap {
    display: flex;
    width: 100%;
    align-items: flex-start;
    justify-content: center;
    padding: 0 4px;
  }

  .receipt {
    width: 74mm;
    max-width: 74mm;
    margin: 0 auto;
    padding: 8px 4px;
    overflow: hidden;
    overflow-wrap: break-word;
    word-break: break-word;
    background: #fff;
  }

  .receipt * {
    max-width: 100%;
  }

  .company-logo {
    max-width: 100px;
    max-height: 50px;
    object-fit: contain;
  }

  .center {
    text-align: center;
  }

  .brand {
    font-size: 16px;
    font-weight: 700;
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    border-bottom: 2px solid #000 !important;
  }

  th {
    border-top: 2px solid #000 !important;
    border-bottom: 2px solid #000 !important;
    font-size: 9pt !important;
    font-weight: 700;
  }

  td {
    padding: 4px 2px !important;
    border-bottom: 1px solid #000 !important;
    font-size: 8pt !important;
    vertical-align: middle;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 8%;
    text-align: center;
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 28%;
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 24%;
    direction: ltr;
    text-align: center;
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 40%;
    text-align: center;
  }

  .phone-cell {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    white-space: nowrap !important;
    word-break: keep-all !important;
    overflow-wrap: normal !important;
    font-size: 7pt !important;
  }

  .money-cell {
    direction: rtl !important;
    unicode-bidi: isolate !important;
    text-align: center !important;
    white-space: nowrap !important;
    word-break: keep-all !important;
    overflow-wrap: normal !important;
    overflow: visible !important;
    font-size: 6.7pt !important;
  }

  /*
   * Visual result:
   *
   * افغانی 123,830.00- :
   */
  .balance-line {
    display: inline-flex !important;
    direction: rtl !important;
    unicode-bidi: isolate !important;
    align-items: baseline;
    justify-content: center;
    gap: 2px;
    width: max-content;
    max-width: none !important;
    white-space: nowrap !important;
    word-break: keep-all !important;
    overflow-wrap: normal !important;
  }

  .balance-label {
    direction: rtl !important;
    unicode-bidi: isolate !important;
    flex: 0 0 auto;
    white-space: nowrap !important;
  }

  .balance-number {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    white-space: nowrap !important;
    word-break: keep-all !important;
  }

  .balance-currency {
    direction: rtl !important;
    unicode-bidi: isolate !important;
    flex: 0 0 auto;
    white-space: nowrap !important;
    word-break: keep-all !important;
  }

  .total-row td {
    border-top: 2px solid #000 !important;
    border-bottom: 1px solid #000 !important;
    background: #f2f2f2 !important;
    font-weight: 800 !important;
  }

  .total-row:last-child td {
    border-bottom: 2px solid #000 !important;
  }

  .total-label {
    direction: rtl !important;
    text-align: end !important;
    padding-inline-end: 6px !important;
    font-size: 8.5pt !important;
    white-space: nowrap !important;
  }

  .total-money-cell {
    direction: rtl !important;
    unicode-bidi: isolate !important;
    text-align: center !important;
    font-size: 7pt !important;
    white-space: nowrap !important;
    overflow: visible !important;
  }

  .receipt-actions-grid {
    display: grid;
    width: 100%;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .receipt-actions-grid
    :global(.app-modal-btn) {
    width: 100%;
    justify-content: center;
  }

  @media (max-width: 420px) {
    :global(
      .app-modal--primary.app-modal--sm
    ) {
      width: min(100%, 340px);
    }

    .receipt-preview-wrap {
      padding: 0;
    }
  }
</style>
