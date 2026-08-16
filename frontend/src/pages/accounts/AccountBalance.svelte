<script>
  import { onMount } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import WhatsappModal from '../WhatsappModal.svelte';
  import { patientTypeApi } from '../../api/patientTypeApi.js';
  export let id;
  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let accounts = [];
  let account = null;
  let accountType = null;
  let patientType = null;
  let imageUrl = null;
  let journals = [];
  let currencies = [];
  let computedBalance = {};
  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
  let accountTypes = [];
  function loadAccounts() {
    return accountApi.getAll({ status: 1 }).then((res) => {
      accounts = res?.data || [];
    });
  }
  function loadCurrencies() {
    return currencyApi.getAll({ status: 1 }).then((res) => {
      currencies = res?.data || [];
    });
  }
  onMount(async () => {
    loadAccounts();
    loadCurrencies();
    accountTypes = (await accountTypeApi.getAll({ status: 1 }))?.data || [];
  });
  let startDate = '';
  let endDate = '';
  let q = '';
  let page = 1;
  let pageSize = 10;
  const pageSizes = [10, 25, 50, 100];
  $: if (id) loadAccount(id);
  let filtered = [];
  let processed = [];
  let paginated = [];
  let totalPages = 1;
  import AccountModal from './AccountModal.svelte';
import { currencyApi } from '../../api/currencyApi.js';
import { journalApi } from '../../api/journalApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { accountImageApi } from '../../api/accountImageApi.js';
  let modalRef;
  let WhatsappModalRef = null;
  let showWhatsappActions = false;
  $: filtered = journals.filter((j) => {
    const jd = j.date ? new Date(j.date) : null;
    if (startDate && jd && jd < new Date(startDate)) return false;
    if (endDate && jd && jd > new Date(endDate + 'T23:59:59')) return false;
    if (q) {
      const s = q.toLowerCase();
      const hay = (j.description || '') + ' ' + (j.reference_type || '') + ' ' + (j.reference_id || '');
      if (!hay.toLowerCase().includes(s)) return false;
    }
    return true;
  });
  $: {
    const starting = {};
    if (account?.currency && account?.balance != null) {
      starting[account.currency] = 0;
    }
    const asc = [...filtered].slice().reverse();
    let lastBal = { ...starting };
    const processedAsc = asc.map((j) => {
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      const cur = j.currency || account?.currency || 'DEFAULT';
      const balObj = { ...lastBal };
      balObj[cur] = (balObj[cur] || 0) + (credit - debit);
      lastBal = balObj;
      return { ...j, debit, credit, running: balObj };
    });
    processed = processedAsc.slice();
    const totals = {};
    for (const j of filtered) {
      const cur = j.currency || account?.currency || 'DEFAULT';
      const debit = Number(j.debit || 0);
      const credit = Number(j.credit || 0);
      if (!totals[cur]) {
        totals[cur] = { debit: 0, credit: 0, balance: 0 };
      }
      totals[cur].debit += debit;
      totals[cur].credit += credit;
      totals[cur].balance += credit - debit;
    }
    computedBalance = totals;
    totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
    if (page > totalPages) page = totalPages;
    paginated = processed.slice((page - 1) * pageSize, page * pageSize);
  }
  async function loadAccount(id) {
    const response = await accountApi.getById(id);
    account = response?.data || null;
    if (!account) return;
    accountType = account.account_type_id
      ? (await accountTypeApi.getById(account.account_type_id))?.data || null
      : null;
    patientType = account.patient_type_id
      ? (await patientTypeApi.getById(account.patient_type_id))?.data || null
      : null;
    const img = (await accountImageApi.getAll({ status: 1, account_id: account.id }))?.data?.[0];
    imageUrl = resolveMediaUrl(img?.image, null);
    await loadJournals(account.id);
    startDate = '';
    endDate = '';
    q = '';
    page = 1;
  }
  async function loadJournals(id) {
    if (!id) return;

    const journalResponse = await journalApi.getAll({
      status: 1,
      account_id: Number(id),
    });

    const allJournals = journalResponse?.data || [];
    const processedLocal = [];

    for (const j of allJournals) {
      let debit = 0;
      let credit = 0;

      if (Number(j.first_entry_account) === Number(id)) {
        debit += Number(j.first_entry_debit) || 0;
        credit += Number(j.first_entry_credit) || 0;
      }

      if (Number(j.second_entry_account) === Number(id)) {
        debit += Number(j.second_entry_debit) || 0;
        credit += Number(j.second_entry_credit) || 0;
      }

      if (debit !== 0 || credit !== 0) {
        processedLocal.push({
          ...j,
          debit,
          credit,
          currency: j.currency,
        });
      }
    }

    processedLocal.sort((a, b) => new Date(a.date) - new Date(b.date));
    journals = processedLocal;

    computedBalance = {};

    for (const j of journals) {
      const cur = j.currency;

      if (!computedBalance[cur]) {
        computedBalance[cur] = {
          debit: 0,
          credit: 0,
          balance: 0,
        };
      }

      computedBalance[cur].debit += j.debit;
      computedBalance[cur].credit += j.credit;
      computedBalance[cur].balance += j.credit - j.debit;
    }
  }

  function getCurrencyInfoArray(obj) {
    let arr = [];
    for (const k in obj) {
      arr.push({
        code: k,
        debit: obj[k].debit,
        credit: obj[k].credit,
        balance: obj[k].balance,
        color: k === account?.currency ? 'primary' : 'success',
      });
    }
    return arr;
  }
  function goBack() {
    push('/dashboard/accounts/list');
  }
  function showInitials(name) {
    if (!name) return '';
    const parts = name.trim().split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger',  'secondary',  'primary',  'success',  'info', 'warning', 'dark',  'info', 'success'];
    return colors[type];
  }
  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary', 'secondary', 'danger',  'success',  'info', 'warning', 'dark',  'secondary'];
    return colors[type];
  }
  function openWhatsappTemplate(templateKey) {
    showWhatsappActions = false;
    WhatsappModalRef?.openModal(templateKey, account?.id, account || {}, computedBalance || {});
  }
  $: displayName = account
    ? t('Lang') === 'fa'
      ? account.name_fa || account.name
      : t('Lang') === 'ps'
        ? account.name_ps || account.name
        : account.name
    : t('Account');
  $: displayType = patientType
    ? t('Lang') === 'fa'
      ? patientType.name_fa || patientType.name
      : t('Lang') === 'ps'
        ? patientType.name_ps || patientType.name
        : patientType.name
    : accountType
      ? t('Lang') === 'fa'
        ? accountType.name_fa || accountType.name
        : t('Lang') === 'ps'
          ? accountType.name_ps || accountType.name
          : accountType.name
      : t('Account');
  $: balanceItems = getCurrencyInfoArray(computedBalance);
</script>

<div class="profile-page">
  <section class="profile-hero">
    <div class="hero-glow"></div>

    <!-- Header actions -->
    <div class="hero-actions">
      <button
        class="back-button"
        type="button"
        on:click={goBack}
        aria-label={t('Back')}
      >
        <i class="bi bi-arrow-left"></i>
      </button>

      {#if permissions?.some((p) => p.code === 'Accounts' && p.edit)}
        <button
          on:click={() => modalRef.openModal(account)}
          class="edit-button"
          type="button"
        >
          <i class="bi bi-pencil-square"></i>
          <span>{t('Edit profile')}</span>
        </button>
      {/if}

      <div class="whatsapp-action-wrap">
        <button
          class="whatsapp-action-button"
          type="button"
          aria-expanded={showWhatsappActions}
          on:click={() => (showWhatsappActions = !showWhatsappActions)}
        >
          <i class="bi bi-whatsapp"></i>
          <span>{t('Whatsapp')}</span>
        </button>

        {#if showWhatsappActions}
          <div class="whatsapp-action-menu">
            <button type="button" on:click={() => openWhatsappTemplate('account_whatsapp_welcome_template')}>
              <i class="bi bi-chat-heart"></i>
              <span>{t('Welcome message')}</span>
            </button>
            <button type="button" on:click={() => openWhatsappTemplate('account_whatsapp_balance_template')}>
              <i class="bi bi-wallet2"></i>
              <span>{t('Balance message')}</span>
            </button>
            <button type="button" on:click={() => openWhatsappTemplate('account_whatsapp_note_template')}>
              <i class="bi bi-journal-text"></i>
              <span>{t('Note')}</span>
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Profile and contact area -->
    <div class="profile-identity">
      <!-- Profile image and name -->
      <div class="profile-main">
        <div class="avatar-wrap">
          {#if imageUrl}
            <img
              src={imageUrl}
              alt={displayName}
              class="profile-avatar"
            />
          {:else}
            <div class="profile-avatar avatar-fallback">
              {showInitials(displayName)}
            </div>
          {/if}

          <span
            class="status-dot"
            title={t('Active')}
          ></span>
        </div>

        <div class="identity-copy">
          <div class="name-row">
            <h1>{displayName}</h1>
            <span class="type-pill">{displayType}</span>
          </div>

          {#if account?.description}
            <p class="profile-description">
              {account.description}
            </p>
          {/if}
        </div>
      </div>

      <!-- Tiny contact cards under the profile -->
      <div class="profile-contact-list">
        <div class="profile-contact-card">
          <span class="profile-contact-icon profile-contact-icon--whatsapp">
            <i class="bi bi-whatsapp"></i>
          </span>

          <div class="profile-contact-content">
            <small>{t('Whatsapp Number')}</small>
            <strong dir="ltr" title={account?.phone || ''}>
              {account?.phone || '—'}
            </strong>
          </div>
        </div>

        <div class="profile-contact-card">
          <span class="profile-contact-icon">
            <i class="bi bi-phone"></i>
          </span>

          <div class="profile-contact-content">
            <small>{t('Phone 2')}</small>
            <strong dir="ltr" title={account?.phone2 || ''}>
              {account?.phone2 || '—'}
            </strong>
          </div>
        </div>

        <div class="profile-contact-card">
          <span class="profile-contact-icon">
            <i class="bi bi-envelope"></i>
          </span>

          <div class="profile-contact-content">
            <small>{t('Email')}</small>
            <strong dir="ltr" title={account?.email || ''}>
              {account?.email || '—'}
            </strong>
          </div>
        </div>

        <div class="profile-contact-card">
          <span class="profile-contact-icon">
            <i class="bi bi-geo-alt"></i>
          </span>

          <div class="profile-contact-content">
            <small>{t('Address')}</small>
            <strong title={account?.address || ''}>
              {account?.address || '—'}
            </strong>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Financial information -->
  <div class="profile-grid">
    <section class="finance-section">
      <div class="section-heading finance-heading">
        <div>
          <span class="section-kicker">
            {t('Overview')}
          </span>

          <h2>{t('Financial summary')}</h2>
        </div>

        <span class="currency-count">
          {balanceItems.length} {t('Currencies')}
        </span>
      </div>

      {#if balanceItems.length}
        <div class="balance-grid">
          {#each balanceItems as cur}
            <article
              class="balance-card"
              class:negative={cur.balance < 0}
            >
              <div class="balance-top">
                <span class="currency-badge">
                  {t(cur.code)}
                </span>

                <i class="bi bi-wallet2"></i>
              </div>

              <small>{t('Current balance')}</small>

              <div class="balance-value" dir="ltr">
                {cur.balance.toLocaleString()}
                <em>{t(cur.code)}</em>
              </div>

              <div class="money-details">
                <div>
                  <span>
                    <i class="bi bi-arrow-down-left"></i>
                    {t('Credit')}
                  </span>

                  <strong dir="ltr">
                    {cur.credit.toLocaleString()}
                  </strong>
                </div>

                <div>
                  <span>
                    <i class="bi bi-arrow-up-right"></i>
                    {t('Debit')}
                  </span>

                  <strong dir="ltr">
                    {cur.debit.toLocaleString()}
                  </strong>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="empty-balance">
          <i class="bi bi-bar-chart"></i>

          <div>
            <strong>{t('No financial activity')}</strong>
            <span>{t('Transactions will appear here')}</span>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>

<AccountModal
  bind:this={modalRef}
  {accountTypes}
  on:saved={() => {
    loadAccount(id);
  }}
/>

<WhatsappModal bind:this={WhatsappModalRef} />

<style>
  .profile-page {
    --profile-primary: var(
      --bs-primary,
      var(--mdb-primary, #0f6efd)
    );

    --profile-primary-rgb: var(
      --bs-primary-rgb,
      var(--mdb-primary-rgb, 15, 110, 253)
    );

    padding: 0 1px 14px;
    color: var(--mdb-body-color, #172033);
  }

  /* ========================================
     Profile hero
  ======================================== */

  .profile-hero {
    position: relative;
    isolation: isolate;
    overflow: hidden;

    min-height: 0;
    padding: 20px 30px;
    border-radius: 14px;

    background:
      linear-gradient(
        118deg,
        #3979ed,
        #1760df 48%,
        #1b4ebd
      );

    color: #ffffff;

    box-shadow:
      0 18px 42px
      rgba(var(--profile-primary-rgb), 0.18);
  }

  .hero-glow {
    position: absolute;
    z-index: -1;
    top: -360px;
    left: -190px;

    width: 520px;
    height: 520px;
    border-radius: 50%;

    background: rgba(255, 255, 255, 0.12);
    pointer-events: none;
  }

  .hero-glow::after {
    position: absolute;
    right: -180px;
    bottom: -245px;

    width: 280px;
    height: 280px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 50%;

    content: "";
  }

  /* ========================================
     Header buttons
  ======================================== */

  .hero-actions {
    position: absolute;
    z-index: 5;
    top: 14px;
    left: 24px;

    display: flex;
    align-items: center;
    gap: 8px;

    direction: ltr;
  }

  .back-button {
    display: grid;
    place-items: center;

    width: 34px;
    height: 34px;
    padding: 0;

    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;

    cursor: pointer;

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .back-button:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .edit-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;

    min-height: 34px;
    padding: 7px 12px;

    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.13);
    color: #ffffff;

    font-size: 11px;
    font-weight: 750;

    cursor: pointer;
    box-shadow: none;

    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .edit-button:hover {
    background: rgba(255, 255, 255, 0.21);
    transform: translateY(-1px);
  }

  .edit-button i {
    margin: 0;
    font-size: 13px;
  }

  .whatsapp-action-wrap {
    position: relative;
  }

  .whatsapp-action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 7px 12px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 9px;
    background: rgba(37, 211, 102, 0.2);
    color: #ffffff;
    font-size: 11px;
    font-weight: 750;
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition:
      background 160ms ease,
      transform 160ms ease;
  }

  .whatsapp-action-button:hover {
    background: rgba(37, 211, 102, 0.3);
    transform: translateY(-1px);
  }

  .whatsapp-action-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 20;
    display: grid;
    gap: 4px;
    width: max-content;
    min-width: 190px;
    padding: 6px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 10px;
    background: #ffffff;
    color: #172033;
    box-shadow: 0 18px 35px rgba(15, 23, 42, 0.18);
  }

  .whatsapp-action-menu button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    font-weight: 700;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
  }

  .whatsapp-action-menu button:hover {
    background: #edf7f1;
    color: #128c7e;
  }

  /* ========================================
     Identity and contact layout
  ======================================== */

  .profile-identity {
    position: relative;
    z-index: 1;

    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 14px;

    width: 100%;
    min-width: 0;

    padding-inline: 0;
    margin: 0;
    text-align: start;
  }

  .profile-main {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 17px;

    width: 100%;
    min-width: 0;

    margin: 0;
    text-align: start;
  }

  /* ========================================
     Avatar
  ======================================== */

  .avatar-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .profile-avatar {
    display: block;

    width: 88px;
    height: 88px;

    border: 2px solid rgba(255, 255, 255, 0.72);
    border-radius: 19px;

    object-fit: cover;

    box-shadow:
      0 14px 28px
      rgba(var(--profile-primary-rgb), 0.26);
  }

  .avatar-fallback {
    display: grid;
    place-items: center;

    background: #ffffff;
    color: var(--profile-primary);

    font-size: 34px;
    font-weight: 800;
  }

  .status-dot {
    position: absolute;
    right: -2px;
    bottom: 7px;

    width: 17px;
    height: 17px;

    border: 3px solid
      color-mix(
        in srgb,
        var(--profile-primary) 76%,
        #0b2466
      );

    border-radius: 50%;
    background: #4ade80;

    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.16);
  }

  /* ========================================
     Identity text
  ======================================== */

  .identity-copy {
    min-width: 0;
    text-align: start;
  }

  .name-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 9px;

    width: 100%;
    text-align: start;
  }

  .name-row h1 {
    margin: 2px 0;

    color: #ffffff;
    text-align: start;

    font-size: 26px;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  .type-pill {
    display: inline-flex;
    align-items: center;

    padding: 5px 10px;

    border: 1px solid rgba(255, 255, 255, 0.26);
    border-radius: 999px;

    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;

    font-size: 10px;
    font-weight: 750;
    white-space: nowrap;
  }

  .profile-description {
    display: -webkit-box;
    overflow: hidden;

    max-width: 400px;
    margin: 6px 0 0;
    text-align: start;

    color: rgba(255, 255, 255, 0.76);

    font-size: 11px;
    line-height: 1.55;

    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  /* ========================================
     Tiny contact cards
  ======================================== */

  .profile-contact-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: 7px;

    width: 100%;
    min-width: 0;

    padding: 0;
    margin: 0;
    text-align: start;
  }

  .profile-contact-card {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;

    flex: 0 1 190px;
    min-width: 145px;
    max-width: 230px;
    min-height: 43px;
    padding: 6px 9px;

    border: 1px solid rgba(255, 255, 255, 0.17);
    border-radius: 9px;

    background: rgba(255, 255, 255, 0.09);
    color: #ffffff;
    text-align: start;

    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05);

    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);

    transition:
      background 160ms ease,
      border-color 160ms ease,
      transform 160ms ease;
  }

  .profile-contact-card:hover {
    border-color: rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .profile-contact-icon {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;

    width: 28px;
    height: 28px;

    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 7px;

    background: rgba(255, 255, 255, 0.13);
    color: #ffffff;

    font-size: 12px;
  }

  .profile-contact-icon--whatsapp {
    color: #dcfce7;
  }

  .profile-contact-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;

    min-width: 0;
    text-align: start;
  }

  .profile-contact-content small {
    display: block;
    width: 100%;

    color: rgba(255, 255, 255, 0.62);
    text-align: start;

    font-size: 8px;
    font-weight: 700;
    line-height: 1.2;
  }

  .profile-contact-content strong {
    display: block;
    overflow: hidden;

    width: 100%;
    text-align: start;
    max-width: 100%;

    color: #ffffff;

    font-size: 10px;
    font-weight: 750;
    line-height: 1.3;

    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ========================================
     Financial section
  ======================================== */

  .profile-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;

    margin-top: 10px;
  }

  .finance-section {
    width: 100%;
    padding: 14px 16px;

    border: 1px solid #e3e9f3;
    border-radius: 12px;

    background: var(--mdb-body-bg, #ffffff);

    box-shadow: none;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    margin-bottom: 9px;
  }

  .section-heading h2 {
    margin: 1px 0 0;

    font-size: 14px;
    font-weight: 750;
  }

  .section-kicker {
    color: #2461db;

    font-size: 10px;
    font-weight: 700;

    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .finance-heading {
    align-items: center;
  }

  .currency-count {
    padding: 5px 8px;

    border: 1px solid #e2e8f1;
    border-radius: 8px;

    background: #f6f8fb;
    color: #596880;

    font-size: 10px;
    font-weight: 700;
  }

  /* ========================================
     Balance cards
  ======================================== */

  .balance-grid {
    display: grid;
    grid-template-columns:
      repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
  }

  .balance-card {
    padding: 10px 12px;

    border: 1px solid #dce6fa;
    border-radius: 10px;

    background:
      linear-gradient(
        145deg,
        #fbfdff,
        #f5f8ff
      );
  }

  .balance-card.negative {
    border-color: #f4deda;

    background:
      linear-gradient(
        145deg,
        #fffdfd,
        #fff7f6
      );
  }

  .balance-top {
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-bottom: 5px;
  }

  .currency-badge {
    padding: 3px 7px;

    border-radius: 999px;

    background: #e7efff;
    color: #2457bd;

    font-size: 9px;
    font-weight: 800;
  }

  .negative .currency-badge {
    background: #ffe9e7;
    color: #d9473b;
  }

  .balance-top i {
    padding: 5px;

    border-radius: 50%;

    background: #edf3ff;
    color: #3b6bd3;
  }

  .negative .balance-top i {
    background: #ffebe9;
    color: #e24a3e;
  }

  .balance-card > small {
    display: block;

    color: #7a879e;

    font-size: 9px;
  }

  .balance-value {
    margin: 0 0 6px;

    color: #2052ae;

    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .negative .balance-value {
    color: #dc443b;
  }

  .balance-value em {
    font-size: 8px;
    font-style: normal;
    letter-spacing: 0.03em;
  }

  .money-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;

    padding-top: 7px;
    border-top: 1px solid rgba(117, 137, 180, 0.14);

    direction: rtl;
  }

  .money-details div {
    display: grid;
    grid-template-rows: 14px 18px;
    align-items: start;

    min-width: 0;
    padding-inline: 9px;
  }

  .money-details div + div {
    border-inline-start:
      1px solid rgba(117, 137, 180, 0.14);
  }

  .money-details span {
    display: block;

    height: 14px;

    color: #8290a8;

    font-size: 8px;
    line-height: 12px;

    white-space: nowrap;
  }

  .money-details strong {
    display: block;

    height: 18px;
    margin: 0;

    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 18px;

    white-space: nowrap;
  }

  .money-details div:first-child i {
    color: #16a36a;
  }

  .money-details div:last-child i {
    color: #e36555;
  }

  /* ========================================
     Empty financial state
  ======================================== */

  .empty-balance {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;

    min-height: 76px;

    border: 1px dashed #d8e0ef;
    border-radius: 9px;

    color: #77859c;
  }

  .empty-balance > i {
    font-size: 20px;
  }

  .empty-balance div {
    display: flex;
    flex-direction: column;
  }

  .empty-balance span {
    font-size: 10px;
  }

  /* Keep the profile and contacts aligned to the logical start
     in both LTR and RTL layouts. */
  :global(html[dir='ltr']) .profile-identity,
  :global(html[dir='ltr']) .profile-main,
  :global(html[dir='ltr']) .name-row,
  :global(html[dir='ltr']) .profile-contact-list,
  :global(html[dir='ltr']) .profile-contact-card {
    justify-content: flex-start;
  }

  :global(html[dir='rtl']) .profile-identity,
  :global(html[dir='rtl']) .profile-main,
  :global(html[dir='rtl']) .name-row,
  :global(html[dir='rtl']) .profile-contact-list,
  :global(html[dir='rtl']) .profile-contact-card,
  :global(html[dir='rtl']) .identity-copy,
  :global(html[dir='rtl']) .profile-contact-content {
    text-align: start;
  }

  /* ========================================
     Responsive design
  ======================================== */

  @media (max-width: 1200px) {
    .profile-identity {
      padding-inline: 0;
    }

    .profile-avatar {
      width: 80px;
      height: 80px;
    }

    .name-row h1 {
      font-size: 23px;
    }
  }

  @media (max-width: 1000px) {
    .profile-hero {
      padding-top: 62px;
    }

    .profile-identity {
      padding-inline-start: 0;
    }

    .profile-main,
    .profile-contact-list {
      width: 100%;
    }

    .profile-contact-card {
      flex: 1 1 180px;
      max-width: none;
    }
  }

  @media (max-width: 700px) {
    .profile-hero {
      padding:
        62px
        14px
        15px;
    }

    .hero-actions {
      top: 14px;
      left: 14px;
    }

    .profile-main {
      gap: 13px;
    }

    .profile-avatar {
      width: 70px;
      height: 70px;

      border-radius: 15px;
    }

    .avatar-fallback {
      font-size: 27px;
    }

    .name-row {
      gap: 7px;
    }

    .name-row h1 {
      font-size: 20px;
    }

    .profile-description {
      font-size: 10px;
    }

    .profile-contact-list {
      gap: 6px;
    }

    .profile-contact-card {
      flex: 1 1 calc(50% - 6px);
      min-width: 0;
    }

    .finance-section {
      padding: 14px;
    }
  }

  @media (max-width: 520px) {
    .profile-hero {
      border-radius: 12px;
    }

    .profile-main {
      align-items: flex-start;
    }

    .profile-avatar {
      width: 64px;
      height: 64px;
    }

    .name-row h1 {
      font-size: 18px;
    }

    .type-pill {
      padding: 4px 8px;
      font-size: 9px;
    }

    .profile-contact-card {
      flex-basis: 100%;
      max-width: none;
    }
  }

  /* ========================================
     Dark mode
     Uses the variables defined in app.css
  ======================================== */

  :global(html.dark) .profile-page {
    color: var(--erp-text, #e5edf7);
  }

  :global(html.dark) .profile-hero {
    border: 1px solid rgba(96, 165, 250, 0.2);
    background:
      linear-gradient(
        118deg,
        #172b57,
        #123b7a 48%,
        #102a5c
      );
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
  }

  :global(html.dark) .hero-glow {
    background: rgba(96, 165, 250, 0.1);
  }

  :global(html.dark) .hero-glow::after {
    border-color: rgba(147, 197, 253, 0.14);
  }

  :global(html.dark) .back-button,
  :global(html.dark) .edit-button {
    border-color: rgba(191, 219, 254, 0.2);
    background: rgba(15, 23, 42, 0.3);
    color: #f8fafc;
    box-shadow: 0 7px 18px rgba(0, 0, 0, 0.14);
  }

  :global(html.dark) .back-button:hover,
  :global(html.dark) .edit-button:hover {
    border-color: rgba(147, 197, 253, 0.38);
    background: rgba(96, 165, 250, 0.18);
    color: #ffffff;
  }

  :global(html.dark) .profile-avatar {
    border-color: rgba(219, 234, 254, 0.62);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.3);
  }

  :global(html.dark) .avatar-fallback {
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-primary, #60a5fa);
  }

  :global(html.dark) .status-dot {
    border-color: #123b7a;
    background: #4ade80;
  }

  :global(html.dark) .name-row h1 {
    color: #f8fafc;
  }

  :global(html.dark) .type-pill {
    border-color: rgba(191, 219, 254, 0.22);
    background: rgba(15, 23, 42, 0.26);
    color: #dbeafe;
  }

  :global(html.dark) .profile-description {
    color: rgba(226, 232, 240, 0.76);
  }

  :global(html.dark) .profile-contact-card {
    border-color: rgba(147, 197, 253, 0.17);
    background: rgba(15, 23, 42, 0.32);
    color: var(--erp-text, #e5edf7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.035),
      0 7px 16px rgba(0, 0, 0, 0.1);
  }

  :global(html.dark) .profile-contact-card:hover {
    border-color: rgba(147, 197, 253, 0.34);
    background: rgba(96, 165, 250, 0.14);
  }

  :global(html.dark) .profile-contact-icon {
    border-color: rgba(147, 197, 253, 0.13);
    background: rgba(96, 165, 250, 0.15);
    color: #dbeafe;
  }

  :global(html.dark) .profile-contact-icon--whatsapp {
    color: #86efac;
  }

  :global(html.dark) .profile-contact-content small {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .profile-contact-content strong {
    color: #f8fafc;
  }

  :global(html.dark) .finance-section {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf7);
    box-shadow: var(--erp-shadow-sm, 0 8px 22px rgba(0, 0, 0, 0.26));
  }

  :global(html.dark) .section-heading h2 {
    color: var(--erp-text, #e5edf7);
  }

  :global(html.dark) .section-kicker {
    color: var(--erp-primary, #60a5fa);
  }

  :global(html.dark) .currency-count {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark) .balance-card {
    border-color: var(--erp-border, #2b3a4f);
    background:
      linear-gradient(
        145deg,
        var(--erp-surface-soft, #172033),
        var(--erp-surface, #111827)
      );
    color: var(--erp-text, #e5edf7);
  }

  :global(html.dark) .balance-card:hover {
    border-color: var(--erp-border-strong, #40516a);
  }

  :global(html.dark) .balance-card.negative {
    border-color: rgba(248, 113, 113, 0.28);
    background:
      linear-gradient(
        145deg,
        rgba(127, 29, 29, 0.2),
        var(--erp-surface, #111827)
      );
  }

  :global(html.dark) .currency-badge {
    background: var(--erp-primary-soft, rgba(96, 165, 250, 0.16));
    color: #bfdbfe;
  }

  :global(html.dark) .negative .currency-badge {
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }

  :global(html.dark) .balance-top i {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .negative .balance-top i {
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }

  :global(html.dark) .balance-card > small,
  :global(html.dark) .money-details span {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .balance-value {
    color: #93c5fd;
  }

  :global(html.dark) .negative .balance-value {
    color: #f87171;
  }

  :global(html.dark) .money-details {
    border-top-color: var(--erp-border, #2b3a4f);
  }

  :global(html.dark) .money-details div + div {
    border-inline-start-color: var(--erp-border, #2b3a4f);
  }

  :global(html.dark) .money-details strong {
    color: var(--erp-text, #e5edf7);
  }

  :global(html.dark) .money-details div:first-child i {
    color: #34d399;
  }

  :global(html.dark) .money-details div:last-child i {
    color: #f87171;
  }

  :global(html.dark) .empty-balance {
    border-color: var(--erp-border-strong, #40516a);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .empty-balance strong {
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .profile-page {
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .finance-section,
  :global([data-mdb-theme='dark']) .balance-card,
  :global([data-mdb-theme='dark']) .empty-balance {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .profile-contact-card,
  :global([data-mdb-theme='dark']) .currency-count,
  :global([data-mdb-theme='dark']) .whatsapp-action-menu {
    border-color: rgba(147, 197, 253, 0.2);
    background: #172033;
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .whatsapp-action-menu button {
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .whatsapp-action-menu button:hover {
    background: #202b3d;
  }

  :global([data-mdb-theme='dark']) .section-heading h2,
  :global([data-mdb-theme='dark']) .profile-contact-content strong,
  :global([data-mdb-theme='dark']) .money-details strong,
  :global([data-mdb-theme='dark']) .empty-balance strong {
    color: var(--erp-text, #e5edf7);
  }

  :global([data-mdb-theme='dark']) .profile-contact-content small,
  :global([data-mdb-theme='dark']) .balance-card > small,
  :global([data-mdb-theme='dark']) .money-details span,
  :global([data-mdb-theme='dark']) .empty-balance {
    color: var(--erp-muted, #94a3b8);
  }

</style>
