<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { toast } from '../../ToastUI/toast.js';
  import { accountApi } from '../../api/accountApi.js';
  import { accountImageApi } from '../../api/accountImageApi.js';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import AccountGroupModal from './AccountGroupModal.svelte';
  import FilterSelect from '../../components/common/FilterSelect.svelte';

  import WhatsappModal from '../WhatsappModal.svelte';
import { currencyApi } from '../../api/currencyApi.js';
import { accountGroupApi } from '../../api/accountGroupApi.js';

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let accountTypes = [];
  let accountTypeOptions = [];
  $: {
    _lang;
    accountTypeOptions = accountTypes.map((type) => ({
      value: type.id,
      label: getTypeLabel(type),
    }));
  }

  let WhatsappModalRef = null;

  let main_group = null;
  async function loadMainGroup() {
    try {
      const response = await accountGroupApi.getById(1);
      main_group = response?.data || null;
    } catch (err) {
      if (err?.status === 404) {
        // Main group missing - create it through the backend API
        try {
          const created = await accountGroupApi.create({
            name: 'عمومی',
            code: 'عمومی',
            description: 'Main Group',
            status: 1,
          });
          main_group = created?.data || null;
        } catch (createErr) {
          console.error('Failed to create main account group:', createErr);
        }
      } else {
        console.error('Failed to load main account group:', err);
      }
    }
  }

  let catModalRef = null;

  let currencies = [];
  export let defaultCurrency = 'AFN';

  let account_groups = [];

  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

  const dispatch = createEventDispatcher();

  // Form fields
  export let account = null; // if editing, pass the account object

  function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  export let showAccountModal = false;

  let account_type_id = '';
  let account_group_id = 1;
  let code = generateRandomString(16);
  let name = '';
  let main_acc = false;
  let name_fa = '';
  $: name_fa = name;
  $: name_ps = name;

  let percentage = 0;
  let balance = 0;
  let account_status = 'active';
  let currency = defaultCurrency;
  let description = '';
  let mainCurrencies = [];
  let phone = '';
  let phone2 = '';
  let email = '';
  let address = '';
  let status = 1;

  let additionalInitialBalances = [];

  function changedCurrency() {
    additionalInitialBalances.forEach((b, i1) => {
      b.remainingCurrencies = currencies.filter((c) => {
        let found = false;
        additionalInitialBalances.forEach((ab, i) => {
          if (!found && i1 !== i) {
            found = ab.currency == c.code;
          }
        });
        return c.code != currency && !found;
      });
    });

    additionalInitialBalances = [...additionalInitialBalances];

    mainCurrencies = currencies.filter((c) => {
      let found = false;
      additionalInitialBalances.forEach((b) => {
        if (!found) {
          found = b.currency == c.code;
        }
      });
      return c.code == currency || !found;
    });
  }

  function addAdditionalInitialBalance() {
    if (additionalInitialBalances.length < currencies.length - 1) {
      let remainingCurrencies = currencies.filter((c) => {
        let found = false;
        additionalInitialBalances.forEach((b) => {
          if (!found) {
            found = b.currency == c.code;
          }
        });
        return c.code != currency && !found;
      });

      additionalInitialBalances.push({
        balance: 0,
        type: 'Debit',
        currency: remainingCurrencies[0]?.code || 'AFN',
        remainingCurrencies,
      });

      additionalInitialBalances = [...additionalInitialBalances];

      changedCurrency();
      setTimeout(() => {
        if (window.mdb) {
          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
          document.querySelectorAll('.dropdown-toggle').forEach((el) => {
            new window.mdb.Dropdown(el);
          });
        }
      }, 100);
    }
  }

  let initialBalanceType = 'Debit'; // or "credit"

  let imageBase64 = null;
  let modalImageUrl = null;

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    mainCurrencies = currencies;
    defaultCurrency = currencies.find((c) => c.isDefault)?.code || 'AFN';
  }

  let accounts = [];
  $: totalPercentage = accounts.reduce(
    (sum, a) =>
      a.account_type_id == 7 ? (account && account?.id == a.id ? sum + 0 : sum + (+a.percentage || 0)) : sum,
    0,
  );

  async function loadAll() {
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    await loadMainGroup();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }

    account_groups = (await accountGroupApi.getAll({ status: 1 }))?.data || [];
    loadCurrencies();
    if (!account?.id && accountTypes.length) {
      account_type_id = getDefaultAccountTypeId();
    }
    if (account) await loadAccount(account);
  }
  onMount(async () => {
    await loadAll();
  });

  $: if (account) {
    async () => {
      await loadAccount(account);
    };
  }
  async function loadAccount(acc) {
    additionalInitialBalances = [];
    if (acc) {
      account_type_id = acc.account_type_id;
      account_group_id = acc.account_group_id;
      code = acc.code;
      main_acc = acc.main_acc;
      name = acc.name;
      name_fa = acc.name;
      account_status = acc.account_status || 'active';
      name_ps = acc.name;
      balance = acc.balance;
      currency = acc.currency || defaultCurrency;
      description = acc.description;
      phone = acc.phone || '';
      phone2 = acc.phone2 || '';
      percentage = acc.percentage || 0;
      email = acc.email || '';
      address = acc.address || '';
      status = acc.status;
      modalImageUrl = acc.imageUrl;
      imageBase64 = null;
      account = acc;
    } else {
      account_type_id = getDefaultAccountTypeId();
      account_group_id = 1;
      code = generateRandomString(16);
      main_acc = false;
      name = '';
      name_fa = '';
      name_ps = name_fa;
      account_status = 'active';
      balance = 0;
      percentage = 0;
      currency = defaultCurrency;
      description = '';
      phone = '';
      phone2 = '';
      email = '';
      address = '';
      status = 1;
      modalImageUrl = null;
      imageBase64 = null;
      account = null;
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    imageBase64 = await convertToWebP(file, 400, 400);
    modalImageUrl = imageBase64;
  }

  function convertToWebP(file, maxWidth = 800, fixedSize = null) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => (img.src = e.target.result);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        if (fixedSize) {
          const canvasSize = fixedSize;

          // keep aspect ratio
          const scale = Math.min(canvasSize / width, canvasSize / height);
          const drawWidth = width * scale;
          const drawHeight = height * scale;

          const x = (canvasSize - drawWidth) / 2;
          const y = (canvasSize - drawHeight) / 2;

          canvas.width = canvasSize;
          canvas.height = canvasSize;

          // white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // draw contained image
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
        } else {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          ctx.drawImage(img, 0, 0, width, height);
        }

        resolve(canvas.toDataURL('image/webp', 0.8));
      };

      reader.readAsDataURL(file);
    });
  }

  function getSelectedAccountType(typeId = account_type_id) {
    return (
      accountTypes.find(
        (item) => String(item.id) === String(typeId),
      ) || null
    );
  }

  function getAccountTypeSearchText(typeId = account_type_id) {
    const selectedType = getSelectedAccountType(typeId);

    return [
      selectedType?.code,
      selectedType?.name,
      selectedType?.name_fa,
      selectedType?.name_ps,
      getTypeLabel(selectedType),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
  }

  function isSupplierAccountType(typeId = account_type_id) {
    const typeText = getAccountTypeSearchText(typeId);

    return (
      Number(typeId) === 3 ||
      typeText.includes('supplier') ||
      typeText.includes('vendor') ||
      typeText.includes('تأمین') ||
      typeText.includes('تامین') ||
      typeText.includes('عرضه') ||
      typeText.includes('فروشنده')
    );
  }

  function isCustomerAccountType(typeId = account_type_id) {
    const typeText = getAccountTypeSearchText(typeId);

    return (
      Number(typeId) === 4 ||
      typeText.includes('customer') ||
      typeText.includes('client') ||
      typeText.includes('مشتری')
    );
  }

  function getCreatedAccountWhatsappTemplate(typeId = account_type_id) {
    /*
     * Customer/general accounts use the existing Settings key:
     * account_whatsapp_welcome_template
     */
    if (isSupplierAccountType(typeId)) {
      return 'supplier_account_whatsapp_welcome_template';
    }

    return 'account_whatsapp_welcome_template';
  }

  function canOpenAccountWhatsapp(phoneNumber = '') {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    return digits.length >= 10;
  }

  async function saveAccount() {
    const codeTrimmed = (code || '').trim();
    const nameTrimmed = (name || '').trim();

    if (!account_type_id) {
      toast.error(t('Error'), t('Please select an account type.'));
      return;
    }

    if (enable_account_groups && !account_group_id) {
      toast.error(t('Error'), t('Please select an account group'));
      return;
    }

    if (!codeTrimmed || !nameTrimmed) {
      toast.error(t('Error'), t('Name is required'));
      return;
    }

    try {
      const existing = accounts.find(
        (a) => a.code === codeTrimmed && a.id !== account?.id,
      );
      if (existing) {
        toast.error(t('Error'), t('Code already exists! Please choose a different code.'));
        return;
      }

      const payload = {
        account_type_id,
        account_group_id,
        code: codeTrimmed,
        name: nameTrimmed,
        main_acc: main_acc ? main_acc.toString().trim() : '',
        name_fa,
        name_ps,
        account_status,
        currency,
        description,
        percentage,
        phone,
        phone2,
        email,
        address,
        status: parseInt(status) || 1,
      };

      let savedAccount;
      if (account?.id) {
        const response = await accountApi.update(account.id, payload);
        savedAccount = response?.data;
      } else {
        const response = await accountApi.create({
          ...payload,
          balance: parseFloat(balance) || 0,
          initial_balance_type: initialBalanceType,
          additional_initial_balances: additionalInitialBalances.map((additional) => ({
            balance: parseFloat(additional.balance) || 0,
            type: additional.type,
            currency: additional.currency,
          })),
        });
        savedAccount = response?.data;
      }

      const accountId = savedAccount?.id || account?.id;
      if (!accountId) throw new Error('Failed to save account');

      /*
       * Open a different WhatsApp welcome message according to
       * the selected account type.
       */
      if (!account?.id && canOpenAccountWhatsapp(payload.phone)) {
        const selectedAccountType =
          getSelectedAccountType(account_type_id);

        const whatsappAccountData = {
          ...payload,
          id: accountId,
          account_type_label:
            getTypeLabel(selectedAccountType) || '',
          account_type_code:
            selectedAccountType?.code || '',
        };

        await WhatsappModalRef?.openModal(
          getCreatedAccountWhatsappTemplate(account_type_id),
          accountId,
          whatsappAccountData,
        );
      }

      if (imageBase64) {
        const existingImages =
          (await accountImageApi.getAll({
            status: 1,
            account_id: accountId,
          }))?.data || [];

        for (const img of existingImages) {
          await accountImageApi.remove(img.id);
        }

        await accountImageApi.create({
          account_id: accountId,
          image: imageBase64,
          status: 1,
        });
      }
      dispatch('saved', {
        account: {
          id: accountId,
          name,
          name_fa,
          name_ps,
          account_type_id,
          account_group_id,
          account_status,
        },
      });
      showAccountModal = false;
      accounts = (await accountApi.getAll({ status: 1 }))?.data || [];

      toast.success(t('Success'), t('Account created successfully.'));
    } catch (err) {
      console.error('Failed to save account:', err);
      const message = String(err?.message || '').includes('NO_TRACK')
        ? t('NO_TRACK account not found! Please create an account with code "NOTRACK" for handling initial balances.')
        : t('An error occurred while saving the account. Please try again.');
      toast.error(t('Error'), message);
    }
  }
  // Expose openModal to parent via component instance
  export async function openModal(account = null) {
    await loadAccount(account);
    if (!account && accountTypes.length && !account_type_id) {
      account_type_id = getDefaultAccountTypeId();
    }
    showAccountModal = true;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 10);
  }

  export function closeModal() {
    showAccountModal = false;
  }

  function getTypeLabel(type) {
    if (t('Lang') === 'en') return type.name || '';
    if (t('Lang') === 'fa') return type.name_fa || type.name || '';
    if (t('Lang') === 'ps') return type.name_ps || type.name || '';
    return type.name || '';
  }

  function getDefaultAccountTypeId() {
    if (!accountTypes?.length) return '';
    if (accountTypes.length === 1) return accountTypes[0].id;

    const customer = accountTypes.find((type) => {
      const label = getTypeLabel(type).toLowerCase();
      return (
        type.id === 4 ||
        type.code?.toUpperCase() === 'CUSTOMER' ||
        type.name?.toLowerCase() === 'customer' ||
        label === t('Customer').toLowerCase()
      );
    });

    return customer?.id ?? accountTypes[0]?.id ?? '';
  }

  function getTypeIcon(typeId) {
    const id = Number(typeId);
    const iconById = {
      1: 'bi-bank',
      2: 'bi-wallet2',
      3: 'bi-truck',
      4: 'bi-person',
      5: 'bi-building',
      6: 'bi-cash-stack',
      7: 'bi-pie-chart',
      8: 'bi-people',
      9: 'bi-hospital',
      10: 'bi-shop',
    };
    return iconById[id] || 'bi-person-badge';
  }

 
</script>

{#if showAccountModal}
  <div
    class="modal fade show d-block qa-modal account-modal"
    dir={t('dir')}
    id="accountModal"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="accountModalTitle">
    <div
      class="modal-backdrop fade show account-modal__backdrop"
      role="button"
      tabindex="-1"
      aria-label={t('Close')}
      on:click={closeModal}
      on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeModal()}></div>
    <div class="modal-dialog modal-dialog-centered account-modal__dialog">
      <div class="modal-content account-modal__panel">
        <button type="button" class="account-modal__close" on:click={closeModal} aria-label={t('Close')}>
          <i class="bi bi-x-lg"></i>
        </button>

        <header class="account-modal__header">
          <label class="account-modal__avatar-wrap" aria-label={t('Upload Photo')}>
            {#if modalImageUrl}
              <img src={modalImageUrl} alt="" class="account-modal__avatar account-modal__avatar--image" />
            {:else}
              <span class="account-modal__avatar account-modal__avatar--default" aria-hidden="true">
                <svg class="account-modal__avatar-cartoon" viewBox="0 0 104 104" focusable="false">
                  <circle cx="52" cy="52" r="52" fill="#e8f1ff" />
                  <path d="M17 104c1.8-21.5 15.4-34.2 35-34.2S85.2 82.5 87 104H17Z" fill="#f4b740" />
                  <path d="M42.5 62h19v17.5h-19z" fill="#efb68d" />
                  <circle cx="52" cy="43" r="24.5" fill="#f7c9a6" />
                  <path
                    d="M27.2 43.2c0-18.8 10-30.5 26.3-30.5 15.2 0 25.3 9.7 25.3 25.2 0 5.3-1.2 9.2-3.5 13.6l-3.5-2.2c.8-3.3.8-7.1.2-10.4-8.2-1.2-15.5-5.8-20.4-12.4-4.2 7.2-12.2 12.2-21.1 13.1-.3 3.7.1 7.2 1.2 10.5l-3.3 2.1c-.8-2.8-1.2-5.8-1.2-9Z"
                    fill="#26334d" />
                  <path
                    d="M31.2 29.8c2.7-10.5 10.7-17.1 22.5-17.1 12.8 0 21.9 8.1 24.4 19.4-6.8-7.2-14.7-10.8-24-10.8-9 0-16.4 2.8-22.9 8.5Z"
                    fill="#34425d" />
                  <circle cx="43.2" cy="45.5" r="2.4" fill="#26334d" />
                  <circle cx="60.8" cy="45.5" r="2.4" fill="#26334d" />
                  <path
                    d="M44.2 57c4.7 3.8 10.9 3.8 15.6 0"
                    fill="none"
                    stroke="#a8604b"
                    stroke-width="3"
                    stroke-linecap="round" />
                  <path d="M37.5 74.5 52 84l14.5-9.5L72 104H32l5.5-29.5Z" fill="#ffffff" />
                  <path d="m46.7 80.5 5.3 3.7 5.3-3.7-1.8 23.5h-7l-1.8-23.5Z" fill="#0f6efd" />
                  <path d="M32 104h-15c1.2-13.9 7.3-24.2 17.2-29.7L32 104Zm40 0h15c-1.2-13.9-7.3-24.2-17.2-29.7L72 104Z" fill="#f4b740" />
                </svg>
              </span>
            {/if}
            <span class="account-modal__avatar-badge" aria-hidden="true">
              <i class="bi bi-camera-fill"></i>
            </span>
            <input type="file" accept="image/*" on:change={handleImageUpload} hidden />
          </label>
          <div class="account-modal__header-copy">
            <h2 id="accountModalTitle" class="account-modal__title">
              {account?.id ? t('Edit Account') : t('New Account')}
            </h2>
    
          </div>
        </header>

        <form class="account-modal__form" on:submit|preventDefault={saveAccount}>
          <div class="account-modal__body">
            <div class="account-modal__identity-grid">
              <label class="account-modal__field account-modal__identity-name">
                <span class="account-modal__label">{t('Name')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-person account-modal__input-icon" aria-hidden="true"></i>
                  <input class="account-modal__input" type="text" bind:value={name} autocomplete="off" />
                </div>
              </label>

              <label class="account-modal__field account-modal__identity-type">
                <span class="account-modal__label">{t('Account Type')}</span>
                <div class="account-modal__type-select">
                  <FilterSelect
                    compact
                    label={t('Select Account Type')}
                    icon={getTypeIcon(account_type_id)}
                    value={account_type_id}
                    options={accountTypeOptions}
                    on:change={(event) => (account_type_id = event.detail)} />
                </div>
              </label>
            </div>

            {#if enable_account_groups}
              <div class="account-modal__field account-modal__field--full">
                <span class="account-modal__label">{t('Account Groups')}</span>
                <div class="account-modal__select-wrap">
                  <i class="bi bi-folder2 account-modal__select-icon" aria-hidden="true"></i>
                  <select class="account-modal__select" bind:value={account_group_id}>
                    {#each account_groups as group (group.id)}
                      <option value={group.id}>{group.name}</option>
                    {/each}
                  </select>
                  <i class="bi bi-chevron-down account-modal__select-chevron" aria-hidden="true"></i>
                </div>
                <button type="button" class="account-modal__link" on:click={() => catModalRef.openAccountGroupModal()}>
                  <i class="bi bi-plus-lg" aria-hidden="true"></i>
                  {t('Create Account Group')}
                </button>
              </div>
            {/if}

            {#if account_type_id == 7}
              <label class="account-modal__field account-modal__field--full">
                <span class="account-modal__label">{t('Percentage')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-percent account-modal__input-icon" aria-hidden="true"></i>
                  <input
                    class="account-modal__input"
                    type="text"
                    bind:value={percentage}
                    inputmode="decimal"
                    on:input={(e) => {
                      let value = e.target.value;
                      value = value.replace(/[^0-9.]/g, '');
                      const parts = value.split('.');
                      if (parts.length > 2) value = parts[0] + '.' + parts[1];
                      if (value === '' || value === '.') {
                        percentage = value;
                        return;
                      }
                      let num = parseFloat(value);
                      if (!isNaN(num)) {
                        if (num > 100 - (account?.id ? totalPercentage : totalPercentage))
                          value =
                            Number(100 - (account?.id ? totalPercentage : totalPercentage)).toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            }) + '';
                        if (num < 0) value = '0';
                      }
                      percentage = value;
                    }} />
                </div>
                <small class="account-modal__hint">
                  {t('Total')}:
                  <span dir="ltr"
                    >{(account?.id
                      ? Number(totalPercentage) + Number(percentage)
                      : Number(totalPercentage) + Number(percentage)
                    ).toLocaleString(undefined, { maximumFractionDigits: 3 })}%</span>
                </small>
              </label>
            {/if}

            <div class="account-modal__fields-grid">
              <label class="account-modal__field">
                <span class="account-modal__label">{t('Whatsapp Number')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-whatsapp account-modal__input-icon account-modal__input-icon--whatsapp" aria-hidden="true"></i>
                  <input class="account-modal__input" type="text" bind:value={phone} autocomplete="off" />
                </div>
              </label>

              <label class="account-modal__field">
                <span class="account-modal__label">{t('Phone 2')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-telephone account-modal__input-icon" aria-hidden="true"></i>
                  <input class="account-modal__input" type="text" bind:value={phone2} autocomplete="off" />
                </div>
              </label>

              <label class="account-modal__field">
                <span class="account-modal__label">{t('Email')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-envelope account-modal__input-icon" aria-hidden="true"></i>
                  <input class="account-modal__input" type="email" bind:value={email} autocomplete="off" />
                </div>
              </label>

              <label class="account-modal__field">
                <span class="account-modal__label">{t('Address')}</span>
                <div class="account-modal__input-wrap">
                  <i class="bi bi-geo-alt account-modal__input-icon" aria-hidden="true"></i>
                  <input class="account-modal__input" type="text" bind:value={address} autocomplete="off" />
                </div>
              </label>
            </div>

            <label class="account-modal__field account-modal__field--full">
              <span class="account-modal__label">{t('Description')}</span>
              <textarea class="account-modal__textarea" rows="3" bind:value={description}></textarea>
            </label>

            {#if !account?.id}
              <div class="account-modal__balance account-modal__field--full">
                <div class="account-modal__balance-head">
                  <span class="account-modal__balance-title">
                    <i class="bi bi-wallet2" aria-hidden="true"></i>
                    {t('Initial Balance')}
                  </span>
                </div>
                <div class="account-modal__balance-strip">
                  <button
                    type="button"
                    class="account-modal__balance-toggle account-modal__balance-toggle--{initialBalanceType === 'Debit' ? 'debit' : 'credit'}"
                    on:click={() => (initialBalanceType = initialBalanceType === 'Debit' ? 'Credit' : 'Debit')}>
                    <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
                    {t(initialBalanceType)}
                  </button>
                  <input class="account-modal__balance-amount" type="number" bind:value={balance} />
                  <div class="account-modal__select-wrap account-modal__select-wrap--compact">
                    <select
                      class="account-modal__select account-modal__select--compact"
                      bind:value={currency}
                      on:change={changedCurrency}>
                      {#each mainCurrencies as cur (cur.code)}
                        <option value={cur.code}>{t(cur.code)}</option>
                      {/each}
                    </select>
                    <i class="bi bi-chevron-down account-modal__select-chevron" aria-hidden="true"></i>
                  </div>
                  <button
                    type="button"
                    class="account-modal__balance-add"
                    disabled={additionalInitialBalances.length >= currencies.length - 1 ||
                      !balance ||
                      (additionalInitialBalances.length > 0 &&
                        !additionalInitialBalances[additionalInitialBalances.length - 1].balance)}
                    on:click={addAdditionalInitialBalance}
                    title={t('Add')}
                    aria-label={t('Add')}>
                    <i class="bi bi-plus-lg"></i>
                  </button>
                </div>
              </div>

              {#each additionalInitialBalances as additional, index (index)}
                <div class="account-modal__balance account-modal__field--full">
                  <div class="account-modal__balance-head">
                    <span class="account-modal__balance-title">
                      <i class="bi bi-wallet2" aria-hidden="true"></i>
                      {t('Initial Balance')} {index + 2}
                    </span>
                  </div>
                  <div class="account-modal__balance-strip account-modal__balance-strip--additional">
                    <button
                      type="button"
                      class="account-modal__balance-toggle account-modal__balance-toggle--{additional.type === 'Debit' ? 'debit' : 'credit'}"
                      on:click={() => (additional.type = additional.type === 'Debit' ? 'Credit' : 'Debit')}>
                      <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
                      {t(additional.type)}
                    </button>
                    <input class="account-modal__balance-amount" type="number" bind:value={additional.balance} />
                    <div class="account-modal__select-wrap account-modal__select-wrap--compact">
                      <select
                        class="account-modal__select account-modal__select--compact"
                        bind:value={additional.currency}
                        on:change={() => {
                          changedCurrency();
                        }}>
                        {#each additional.remainingCurrencies as cur (cur.code)}
                          <option value={cur.code}>{t(cur.code)}</option>
                        {/each}
                      </select>
                      <i class="bi bi-chevron-down account-modal__select-chevron" aria-hidden="true"></i>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <footer class="account-modal__footer">
            <button type="submit" class="account-modal__submit">
              <i class="bi bi-check2-circle" aria-hidden="true"></i>
              <span>{account?.id ? t('Update') : t('Save')}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  </div>
{/if}

<AccountGroupModal
  bind:this={catModalRef}
  on:saved={async (e) => {
    account_groups = (await accountGroupApi.getAll({ status: 1 }))?.data || [];
    account_group_id = e.detail.id;
  }} />

<WhatsappModal bind:this={WhatsappModalRef} />

<style>
  .account-modal.qa-modal :global(.modal-dialog.account-modal__dialog) {
    width: min(94vw, 40rem);
    max-width: min(94vw, 40rem);
  }

  .account-modal {
    --account-modal-primary: var(--bs-primary, #0f6efd);
    --account-modal-border: #d8e1ee;
    --account-modal-muted: #7183a3;

    z-index: 1055;
    overflow: hidden;
  }

  .account-modal__backdrop {
    z-index: 1050;
    background: rgba(15, 23, 42, 0.52);
  }

  .account-modal__dialog {
    z-index: 1056;
    display: flex;
    width: min(94vw, 40rem);
    max-width: min(94vw, 40rem);
    height: auto;
    max-height: calc(100dvh - 2rem);
    margin: 1rem auto;
  }

  .account-modal__panel {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    max-height: calc(100dvh - 2rem);
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);
    animation: account-modal-enter 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes account-modal-enter {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .account-modal__close {
    position: absolute;
    top: 0.75rem;
    inset-inline-end: 0.85rem;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      transform 0.12s ease;
  }

  .account-modal__close:hover {
    border-color: #ffffff;
    background: #ffffff;
    color: var(--account-modal-primary);
  }

  .account-modal__close:active {
    transform: scale(0.96);
  }

  .account-modal__close:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }

  .account-modal__header {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.9rem;
    min-height: 5.5rem;
    padding: 0.5rem 1.15rem;
    padding-inline-end: 3.5rem;
    overflow: hidden;
    border-bottom: 0;
    background: var(--account-modal-primary);
    text-align: start;
  }

  .account-modal__header-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .account-modal__title {
    position: relative;
    margin: 0;
    color: #ffffff;
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .account-modal__form {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #ffffff;
  }

  .account-modal__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.7rem;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem 1.1rem;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: #b9c6d8 transparent;
  }

  .account-modal__body::-webkit-scrollbar {
    width: 0.42rem;
  }

  .account-modal__body::-webkit-scrollbar-track {
    background: transparent;
  }

  .account-modal__body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #b9c6d8;
  }

  .account-modal__body::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  .account-modal__footer {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    padding: 0.65rem 1.1rem 0.8rem;
    border-top: 1px solid #eef2f7;
    background: #ffffff;
    box-shadow: 0 -4px 14px rgba(15, 23, 42, 0.035);
  }

  .account-modal__avatar-wrap {
    position: relative;
    display: inline-grid;
    flex-shrink: 0;
    place-items: center;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.16s ease;
  }

  .account-modal__avatar-wrap:hover {
    transform: scale(1.02);
  }

  .account-modal__avatar-wrap:active {
    transform: scale(0.98);
  }

  .account-modal__avatar {
    display: inline-grid;
    width: 4.4rem;
    height: 4.4rem;
    place-items: center;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: #e8f1ff;
    box-shadow: 0 4px 12px rgba(8, 48, 118, 0.2);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .account-modal__avatar--image {
    display: block;
    object-fit: cover;
    background: #ffffff;
  }

  .account-modal__avatar--default {
    overflow: hidden;
    padding: 0;
  }

  .account-modal__avatar-cartoon {
    display: block;
    width: 100%;
    height: 100%;
  }

  .account-modal__avatar-wrap:hover .account-modal__avatar {
    border-color: #ffffff;
    box-shadow: 0 5px 14px rgba(8, 48, 118, 0.24);
  }

  .account-modal__avatar-badge {
    position: absolute;
    inset-inline-start: -0.05rem;
    bottom: 0;
    display: inline-grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 2px solid #ffffff;
    border-radius: 999px;
    background: #ffffff;
    color: var(--account-modal-primary);
    font-size: 0.78rem;
    box-shadow: 0 2px 6px rgba(8, 48, 118, 0.22);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .account-modal__avatar-wrap:hover .account-modal__avatar-badge {
    transform: scale(1.08);
    box-shadow: 0 3px 8px rgba(8, 48, 118, 0.26);
  }

  .account-modal__identity-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(11rem, 1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .account-modal__fields-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .account-modal__field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    margin: 0;
  }

  .account-modal__field--full {
    width: 100%;
  }

  .account-modal__label {
    color: #344054;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.3;
    text-align: start;
  }

  .account-modal__input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .account-modal__input-icon {
    position: absolute;
    inset-inline-start: 0.8rem;
    color: var(--account-modal-muted);
    font-size: 1rem;
    pointer-events: none;
    transition: color 0.15s ease;
  }

  .account-modal__input-wrap:focus-within .account-modal__input-icon {
    color: var(--account-modal-primary);
  }

  .account-modal__input-icon--whatsapp {
    color: #438466;
  }

  .account-modal__input,
  .account-modal__textarea,
  .account-modal__select {
    width: 100%;
    min-width: 0;
    min-height: 2.45rem;
    padding-block: 0.35rem;
    padding-inline: 0.75rem;
    border: 1px solid var(--account-modal-border);
    border-radius: 0.5rem;
    outline: none;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.86rem;
    text-align: start;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }

  .account-modal__input {
    padding-inline-start: 2.5rem;
  }

  .account-modal__input::placeholder,
  .account-modal__textarea::placeholder {
    color: #98a5b8;
  }

  .account-modal__input:hover,
  .account-modal__textarea:hover,
  .account-modal__select:hover {
    border-color: #b8c6da;
  }

  .account-modal__input:focus,
  .account-modal__textarea:focus,
  .account-modal__select:focus {
    border-color: var(--account-modal-primary);
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.1);
  }

  .account-modal__textarea {
    min-height: 3.6rem;
    max-height: 7rem;
    resize: vertical;
    line-height: 1.5;
  }

  .account-modal__select-wrap {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .account-modal__type-select {
    width: 100%;
    min-width: 0;
  }

  .account-modal__type-select :global(.filter-select) {
    width: 100%;
  }

  .account-modal__type-select :global(.filter-select__trigger) {
    min-height: 2.45rem;
    padding-block: 0.35rem;
    padding-inline: 0.75rem;
    border-color: var(--account-modal-border);
    background: #ffffff;
    color: #0f172a;
    font-size: 0.86rem;
    font-weight: 500;
  }

  .account-modal__type-select :global(.filter-select__trigger:hover) {
    border-color: #b8c6da;
    background: #ffffff;
    color: #0f172a;
  }

  .account-modal__type-select :global(.filter-select__trigger:focus-visible) {
    border-color: var(--account-modal-primary);
    box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.1);
  }

  .account-modal__select-wrap .account-modal__select {
    padding-inline-start: 2.15rem;
    padding-inline-end: 2rem;
    appearance: none;
    cursor: pointer;
  }

  .account-modal__select-wrap--compact .account-modal__select {
    min-height: 2.45rem;
    padding-inline-start: 0.65rem;
  }

  .account-modal__select-icon {
    position: absolute;
    inset-inline-start: 0.65rem;
    color: var(--account-modal-muted);
    font-size: 0.95rem;
    pointer-events: none;
  }

  .account-modal__select-chevron {
    position: absolute;
    inset-inline-end: 0.65rem;
    color: var(--account-modal-muted);
    font-size: 0.62rem;
    pointer-events: none;
  }

  .account-modal__link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.3rem;
    margin-top: 0.15rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--account-modal-primary);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .account-modal__link:hover {
    color: #1d4ed8;
  }

  .account-modal__hint {
    color: #64748b;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .account-modal__balance {
    display: grid;
    gap: 0.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.65rem;
    background: #f7f9fc;
    box-shadow: none;
  }

  .account-modal__balance-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .account-modal__balance-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #334155;
    font-size: 0.92rem;
    font-weight: 600;
  }

  .account-modal__balance-title i {
    color: var(--account-modal-primary);
  }

  .account-modal__balance-strip {
    display: grid;
    grid-template-columns: auto minmax(9rem, 1fr) 6.25rem 2.45rem;
    gap: 0.5rem;
    align-items: center;
  }

  .account-modal__balance-strip--additional {
    grid-template-columns: auto minmax(9rem, 1fr) 6.5rem;
  }

  .account-modal__balance-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-height: 2.45rem;
    padding-inline: 0.75rem;
    border: 1px solid #d8e1ee;
    border-radius: 0.5rem;
    background: #ffffff;
    font-size: 0.86rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.1s ease;
  }

  .account-modal__balance-toggle:active {
    transform: scale(0.97);
  }

  .account-modal__balance-toggle--debit {
    border-color: #edcccc;
    background: #fff8f7;
    color: #b42318;
  }

  .account-modal__balance-toggle--debit:hover {
    border-color: #dda7a7;
    background: #fff2f0;
  }

  .account-modal__balance-toggle--credit {
    border-color: #c5d9f6;
    background: #f3f7fe;
    color: #0b5ed7;
  }

  .account-modal__balance-toggle--credit:hover {
    border-color: #9fbee9;
    background: #ebf2fd;
  }

  .account-modal__balance-toggle i {
    font-size: 0.85rem;
    opacity: 0.75;
  }

  .account-modal__balance-amount {
    width: 100%;
    min-width: 0;
    min-height: 2.45rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--account-modal-border);
    border-radius: 0.5rem;
    outline: none;
    background: #ffffff;
    font-size: 0.86rem;
    text-align: start;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .account-modal__balance-amount:hover {
    border-color: #bfdbfe;
  }

  .account-modal__balance-amount:focus {
    border-color: var(--account-modal-primary);
    box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.1);
  }

  .account-modal__balance-add {
    display: inline-grid;
    width: 2.45rem;
    height: 2.45rem;
    padding: 0;
    place-items: center;
    border: 1px solid #bfdbfe;
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--account-modal-primary);
    font-size: 0.85rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.1s ease;
  }

  .account-modal__balance-add:hover:not(:disabled) {
    border-color: #93c5fd;
    background: #dbeafe;
  }

  .account-modal__balance-add:active:not(:disabled) {
    transform: scale(0.94);
  }

  .account-modal__balance-add:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .account-modal__submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: auto;
    min-width: 7.5rem;
    min-height: 2.5rem;
    margin-inline-start: auto;
    padding-inline: 1.25rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--account-modal-primary);
    color: #ffffff;
    font-size: 0.96rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: none;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.1s ease;
  }

  .account-modal__submit:hover:not(:disabled) {
    background: #0b5ed7;
    box-shadow: 0 2px 6px rgba(15, 110, 253, 0.18);
  }

  .account-modal__submit:active:not(:disabled) {
    transform: translateY(1px);
    box-shadow: 0 2px 6px rgba(15, 110, 253, 0.2);
  }

  .account-modal__submit:disabled,
  .account-modal__submit[aria-busy='true'] {
    opacity: 0.65;
    cursor: not-allowed;
    box-shadow: none;
  }

  .account-modal__submit:focus-visible,
  .account-modal__balance-add:focus-visible,
  .account-modal__balance-toggle:focus-visible {
    outline: 2px solid var(--account-modal-primary);
    outline-offset: 2px;
  }

  .account-modal__submit i {
    font-size: 1.15rem;
  }

  @media (max-height: 760px) {
    .account-modal__dialog {
      max-height: calc(100dvh - 1rem);
      margin-block: 0.5rem;
    }

    .account-modal__panel {
      max-height: calc(100dvh - 1rem);
    }

    .account-modal__header {
      min-height: 4.75rem;
    }

    .account-modal__avatar {
      width: 3.75rem;
      height: 3.75rem;
    }

    .account-modal__body {
      padding-block: 0.65rem;
    }
  }

  @media (max-width: 640px) {
    .account-modal.qa-modal :global(.modal-dialog.account-modal__dialog),
    .account-modal__dialog {
      width: min(96vw, 40rem);
      max-width: min(96vw, 40rem);
      max-height: calc(100dvh - 1rem);
      margin: 0.5rem auto;
    }

    .account-modal__panel {
      max-height: calc(100dvh - 1rem);
    }

    .account-modal__header {
      min-height: 5.75rem;
      padding-inline-start: 1rem;
    }

    .account-modal__body {
      gap: 0.7rem;
      padding: 0.75rem 0.9rem;
      overflow-x: hidden;
      overflow-y: auto;
    }

    .account-modal__footer {
      padding: 0.65rem 0.9rem 0.75rem;
    }

    .account-modal__identity-grid,
    .account-modal__fields-grid {
      grid-template-columns: 1fr;
      gap: 0.7rem;
    }

    .account-modal__balance-strip,
    .account-modal__balance-strip--additional {
      grid-template-columns: 1fr 1fr;
    }

    .account-modal__balance-add {
      width: 100%;
    }
  }

  @media (max-width: 400px) {
    .account-modal__dialog {
      width: calc(100vw - 0.75rem);
      max-width: calc(100vw - 0.75rem);
      margin: 0.375rem auto;
    }

    .account-modal__panel {
      max-height: calc(100dvh - 0.75rem);
    }

    .account-modal__header {
      gap: 0.7rem;
      min-height: 5.4rem;
      padding-inline-start: 0.8rem;
      padding-inline-end: 3.2rem;
    }

    .account-modal__avatar {
      width: 4rem;
      height: 4rem;
    }

    .account-modal__title {
      font-size: 1.08rem;
    }

    .account-modal__body {
      padding-inline: 0.8rem;
    }

    .account-modal__footer {
      padding-inline: 0.8rem;
    }

    .account-modal__balance {
      padding: 0.65rem;
    }

    .account-modal__balance-strip,
    .account-modal__balance-strip--additional {
      grid-template-columns: 1fr;
    }

    .account-modal__balance-add {
      width: 100%;
    }

    .account-modal__submit {
      width: 100%;
      margin-inline-start: 0;
    }
  }

  :global(html.dark) .account-modal {
    --account-modal-border: var(--erp-border, #2b3a4f);
    --account-modal-muted: var(--erp-muted, #94a3b8);
    color-scheme: dark;
  }

  :global(html.dark) .account-modal__backdrop {
    background: rgba(2, 6, 23, 0.78);
  }

  :global(html.dark) .account-modal__panel {
    border-color: var(--account-modal-border);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
  }

  :global(html.dark) .account-modal__form,
  :global(html.dark) .account-modal__body,
  :global(html.dark) .account-modal__footer {
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .account-modal__footer {
    border-top-color: var(--account-modal-border);
    box-shadow: 0 -5px 16px rgba(0, 0, 0, 0.18);
  }

  :global(html.dark) .account-modal__body {
    scrollbar-color: #526176 transparent;
  }

  :global(html.dark) .account-modal__body::-webkit-scrollbar-thumb {
    background: #526176;
  }

  :global(html.dark) .account-modal__body::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }

  :global(html.dark) .account-modal__label,
  :global(html.dark) .account-modal__balance-title {
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark) .account-modal__hint {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .account-modal__input,
  :global(html.dark) .account-modal__textarea,
  :global(html.dark) .account-modal__select,
  :global(html.dark) .account-modal__balance-amount {
    border-color: var(--account-modal-border);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .account-modal__input::placeholder,
  :global(html.dark) .account-modal__textarea::placeholder {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .account-modal__input:hover,
  :global(html.dark) .account-modal__textarea:hover,
  :global(html.dark) .account-modal__select:hover,
  :global(html.dark) .account-modal__balance-amount:hover {
    border-color: #4b6280;
  }

  :global(html.dark) .account-modal__input:focus,
  :global(html.dark) .account-modal__textarea:focus,
  :global(html.dark) .account-modal__select:focus,
  :global(html.dark) .account-modal__balance-amount:focus {
    border-color: #60a5fa;
    background: #0f172a;
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.14);
  }

  :global(html.dark) .account-modal__input-icon,
  :global(html.dark) .account-modal__select-icon,
  :global(html.dark) .account-modal__select-chevron {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .account-modal__type-select :global(.filter-select__trigger) {
    border-color: var(--account-modal-border);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .account-modal__type-select :global(.filter-select__trigger:hover) {
    border-color: #4b6280;
    background: #1e293b;
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .account-modal__type-select :global(.filter-select__trigger:focus-visible) {
    border-color: #60a5fa;
    background: #0f172a;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.14);
  }

  :global(html.dark) .account-modal__input-wrap:focus-within .account-modal__input-icon {
    color: #93c5fd;
  }

  :global(html.dark) .account-modal__input-icon--whatsapp {
    color: #6ee7b7;
  }

  :global(html.dark) .account-modal__balance {
    border-color: var(--account-modal-border);
    background: var(--erp-surface-soft, #172033);
  }

  :global(html.dark) .account-modal__balance-toggle {
    border-color: var(--account-modal-border);
    background: #1e293b;
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark) .account-modal__balance-toggle--debit {
    border-color: rgba(248, 113, 113, 0.4);
    background: rgba(248, 113, 113, 0.13);
    color: #fca5a5;
  }

  :global(html.dark) .account-modal__balance-toggle--debit:hover {
    border-color: rgba(252, 165, 165, 0.62);
    background: rgba(248, 113, 113, 0.2);
  }

  :global(html.dark) .account-modal__balance-toggle--credit {
    border-color: rgba(96, 165, 250, 0.42);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .account-modal__balance-toggle--credit:hover {
    border-color: rgba(147, 197, 253, 0.64);
    background: rgba(96, 165, 250, 0.22);
  }

  :global(html.dark) .account-modal__balance-add {
    border-color: rgba(96, 165, 250, 0.4);
    background: var(--erp-surface-soft, #172033);
    color: #93c5fd;
  }

  :global(html.dark) .account-modal__balance-add:hover:not(:disabled) {
    border-color: rgba(147, 197, 253, 0.65);
    background: rgba(96, 165, 250, 0.18);
  }

  :global(html.dark) .account-modal__avatar {
    border-color: rgba(255, 255, 255, 0.42);
    background: var(--erp-surface-soft, #172033);
    box-shadow: 0 6px 18px rgba(2, 6, 23, 0.34);
  }

  :global(html.dark) .account-modal__avatar-badge {
    border-color: var(--erp-surface-soft, #172033);
    background: var(--erp-surface-soft, #172033);
    color: #93c5fd;
  }

  :global(html.dark) .account-modal__close:hover {
    border-color: rgba(255, 255, 255, 0.68);
    background: rgba(15, 23, 42, 0.34);
    color: #ffffff;
  }
</style>
