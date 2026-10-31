<script>
  import { onceAsync } from '../../lib/onceAsync.js';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { toast } from '../../ToastUI/toast.js';
  import { accountApi } from '../../api/accountApi.js';
  import { accountImageApi } from '../../api/accountImageApi.js';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { isSystemAccount } from '../../lib/systemAccounts.js';
  import AccountGroupModal from './AccountGroupModal.svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';

  import WhatsappModal from '../WhatsappModal.svelte';
import { currencyApi } from '../../api/currencyApi.js';
import { accountGroupApi } from '../../api/accountGroupApi.js';

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let accountTypes = [];

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

  function removeAdditionalInitialBalance(index) {
    additionalInitialBalances.splice(index, 1);
    additionalInitialBalances = [...additionalInitialBalances];
    changedCurrency();
  }

  /* ---------- opening balance currency picker (reference popup list) ---------- */
  /* -1 = closed, 0 = the main row, 1..n = the additional rows. */
  let openCurrencyRow = -1;

  function currencySymbol(code) {
    return currencies.find((cur) => cur.code === code)?.symbol || code;
  }

  function currencyName(cur) {
    return cur?.name || t(cur?.code);
  }

  function toggleCurrencyMenu(rowIndex) {
    openCurrencyRow = openCurrencyRow === rowIndex ? -1 : rowIndex;
  }

  function closeCurrencyMenu() {
    openCurrencyRow = -1;
  }

  function pickCurrency(rowIndex, code) {
    if (rowIndex === 0) {
      currency = code;
      changedCurrency();
    } else {
      const row = additionalInitialBalances[rowIndex - 1];
      if (row) {
        row.currency = code;
        additionalInitialBalances = [...additionalInitialBalances];
        changedCurrency();
      }
    }
    closeCurrencyMenu();
  }

  let initialBalanceType = 'Debit'; // or "credit"

  /*
   * The accounting date of the initial-balance journals. Empty keeps the
   * previous behaviour (the server's current day), so nothing changes for
   * anyone who leaves it blank.
   */
  let initialBalanceDate = '';

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
    await Promise.all([
      accountApi.getAll({ status: 1 }).then((response) => { accounts = response?.data || []; }),
      loadMainGroup(), loadCurrencies(),
    ]);
    account_groups = (await accountGroupApi.getAll({ status: 1 }))?.data || [];
    if (!account?.id && accountTypes.length) {
      account_type_id = getDefaultAccountTypeId();
    }
    if (account) await loadAccount(account);
  }
  const initializeOnce = onceAsync(loadAll);
  export function initialize() { return initializeOnce(); }
  onMount(() => { void initialize().catch((error) => console.error('Account form initialization failed', error)); });

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
      /*
       * A visitor has no meaningful default rate, so the field starts empty
       * and the form asks for one instead of saving a silent 0.
       */
      percentage = isVisitorAccountType(account_type_id) ? '' : 0;
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

  /*
   * A visitor is the account that receives an agreed share of the benefit of
   * the sales it brings. Like the backend, this is decided by the type's
   * `code` and not by its name, so translating or renaming the type in
   * Settings never changes which accounts may receive a share.
   *
   * `types` is a parameter so callers can pass the list they mean, which is
   * what lets the reactive statement below depend on it (see the note there).
   */
  function isVisitorAccountType(typeId = account_type_id, types = accountTypes) {
    const selectedType = (types || []).find(
      (item) => String(item.id) === String(typeId),
    );

    return (
      String(selectedType?.code || '')
        .trim()
        .toUpperCase() === 'VISITOR'
    );
  }

  /*
   * The percentage field is shared: shareholders split the company between
   * them (hence the 100% total), while a visitor's rate is just its share of
   * each sale's benefit and has no such total.
   *
   * Both the chosen id and the type list are named here on purpose. Svelte
   * collects reactive dependencies from what the statement reads, so a bare
   * isVisitorAccountType() call would be tracked to nothing: the field would
   * never appear when a visitor type is picked, nor once the types load.
   */
  $: isVisitorType = isVisitorAccountType(account_type_id, accountTypes);
  $: isShareholderType = Number(account_type_id) === 7;

  /* Header preview: the reference sheet shows the typed name, its type and the code. */
  $: headerTypeLabel = getTypeLabel(getSelectedAccountType(account_type_id)) || t('Account Type');
  $: headerInitial = (name || '').trim().charAt(0) || '?';

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
    if (isSystemAccount(account)) {
      toast.error(t('Error'), t('System accounts cannot be edited.'));
      return;
    }

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

    /*
     * The backend refuses a visitor without a usable rate, so it is caught
     * here first rather than as a failed request.
     */
    if (isVisitorType) {
      const rate = Number(percentage);

      if (percentage === '' || !Number.isFinite(rate) || rate <= 0) {
        toast.error(t('Error'), t('Please enter the visitor percentage'));
        return;
      }

      if (rate > 100) {
        toast.error(t('Error'), t('The visitor percentage cannot be more than 100'));
        return;
      }
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
          effective_date: initialBalanceDate || undefined,
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
    if (isSystemAccount(account)) {
      toast.error(t('Error'), t('System accounts cannot be edited.'));
      return;
    }

    await initialize();
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
    /*
     * Called before the type list has loaded (and by the reactive checks in
     * this component), so a missing type must read as "no label" rather than
     * throw.
     */
    if (!type) return '';

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

  /* Filled Material Symbols per account type (reference category artwork). */
  function getTypeSymbol(typeId) {
    const id = Number(typeId);
    const symbolById = {
      1: 'account_balance',
      2: 'account_balance_wallet',
      3: 'local_shipping',
      4: 'person',
      5: 'apartment',
      6: 'payments',
      7: 'pie_chart',
      8: 'groups',
      9: 'local_hospital',
      10: 'storefront',
    };
    return symbolById[id] || 'badge';
  }

  /* ---------- account type dropdown (reference popup picker) ---------- */
  let typeMenuOpen = false;
  let typeTriggerEl;
  let typeMenuEl;
  let typeMenuStyle = '';
  let typeMenuDir = 'rtl';
  let typeActiveIndex = -1;
  let typeQuery = '';
  let filteredTypes = [];

  $: if (!showAccountModal && typeMenuOpen) typeMenuOpen = false;

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function applyTypeFilter() {
    const needle = typeQuery.trim().toLowerCase();
    filteredTypes = !needle
      ? accountTypes
      : accountTypes.filter((option) =>
          [getTypeLabel(option), option.description, option.code].some((value) =>
            String(value || '')
              .toLowerCase()
              .includes(needle),
          ),
        );
  }

  function positionTypeMenu() {
    if (!typeTriggerEl) return;

    const rect = typeTriggerEl.getBoundingClientRect();
    const maxHeight = Math.min(260, window.innerHeight * 0.5);
    const estimatedHeight = filteredTypes.length * 29 + 40;
    const openUp = window.innerHeight - rect.bottom < Math.min(maxHeight, estimatedHeight);

    typeMenuDir = getComputedStyle(typeTriggerEl).direction;
    typeMenuStyle = openUp
      ? `left:${rect.left}px;width:${rect.width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;`
      : `left:${rect.left}px;width:${rect.width}px;top:${rect.bottom + 5}px;max-height:${maxHeight}px;`;
  }

  function toggleTypeMenu() {
    if (typeMenuOpen) {
      closeTypeMenu();
      return;
    }

    if (!typeTriggerEl) return;

    typeQuery = '';
    applyTypeFilter();
    typeActiveIndex = filteredTypes.findIndex(
      (type) => String(type.id) === String(account_type_id),
    );
    positionTypeMenu();
    typeMenuOpen = true;
    tick().then(() => typeMenuEl?.querySelector('input')?.focus());
  }

  function closeTypeMenu() {
    typeMenuOpen = false;
    typeQuery = '';
    typeActiveIndex = -1;
  }

  function selectType(typeId) {
    account_type_id = typeId;
    closeTypeMenu();
    typeTriggerEl?.focus();
  }

  function onTypeQueryInput() {
    applyTypeFilter();
    typeActiveIndex = filteredTypes.length ? 0 : -1;
  }

  function moveTypeSelection(step) {
    if (!filteredTypes.length) return;
    const next = typeActiveIndex + step;
    typeActiveIndex = next < 0 ? filteredTypes.length - 1 : next >= filteredTypes.length ? 0 : next;
    typeMenuEl?.querySelectorAll('.account-modal__picker-option')[typeActiveIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }

  function handleTypeKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!typeMenuOpen) {
        toggleTypeMenu();
        return;
      }
      moveTypeSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      /* A space belongs to the search box, not to the picker. */
      if (event.key === ' ' && event.target?.tagName === 'INPUT') return;
      event.preventDefault();
      if (!typeMenuOpen) {
        toggleTypeMenu();
      } else if (filteredTypes[typeActiveIndex]) {
        selectType(filteredTypes[typeActiveIndex].id);
      }
      return;
    }

    if (event.key === 'Escape' && typeMenuOpen) {
      event.preventDefault();
      closeTypeMenu();
      typeTriggerEl?.focus();
    }
  }

  function handleTypeOutsideClick(event) {
    if (!typeMenuOpen) return;
    if (!typeTriggerEl?.contains(event.target) && !typeMenuEl?.contains(event.target)) {
      closeTypeMenu();
    }
  }

  function handleTypeScroll(event) {
    if (!typeMenuOpen) return;
    if (typeMenuEl && (event.target === typeMenuEl || typeMenuEl.contains(event.target))) return;
    positionTypeMenu();
  }

  /* ---------- account group dropdown (reference group picker) ---------- */
  let groupMenuOpen = false;
  let groupTriggerEl;
  let groupMenuEl;
  let groupMenuStyle = '';
  let groupMenuDir = 'rtl';
  let groupQuery = '';
  let groupActiveIndex = -1;

  $: selectedGroup =
    account_groups.find((group) => String(group.id) === String(account_group_id)) || null;
  $: groupSearch = groupQuery.trim();
  $: filteredGroups = account_groups.filter((group) => {
    if (!groupSearch) return true;
    const needle = groupSearch.toLowerCase();
    return [group.name, group.name_fa, group.name_ps].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(needle),
    );
  });
  $: canCreateGroup =
    groupSearch.length > 0 &&
    !account_groups.some(
      (group) => String(group.name || '').trim().toLowerCase() === groupSearch.toLowerCase(),
    );
  $: if (!showAccountModal && groupMenuOpen) groupMenuOpen = false;

  function positionGroupMenu() {
    if (!groupTriggerEl) return;

    const rect = groupTriggerEl.getBoundingClientRect();
    const maxHeight = Math.min(260, window.innerHeight * 0.5);
    const openUp = window.innerHeight - rect.bottom < 240;

    groupMenuDir = getComputedStyle(groupTriggerEl).direction;
    groupMenuStyle = openUp
      ? `left:${rect.left}px;width:${rect.width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;`
      : `left:${rect.left}px;width:${rect.width}px;top:${rect.bottom + 5}px;max-height:${maxHeight}px;`;
  }

  function toggleGroupMenu() {
    if (groupMenuOpen) {
      closeGroupMenu();
      return;
    }

    if (!groupTriggerEl) return;

    groupQuery = '';
    groupActiveIndex = account_groups.findIndex(
      (group) => String(group.id) === String(account_group_id),
    );
    positionGroupMenu();
    groupMenuOpen = true;
    tick().then(() => groupMenuEl?.querySelector('input')?.focus());
  }

  function closeGroupMenu() {
    groupMenuOpen = false;
    groupQuery = '';
    groupActiveIndex = -1;
  }

  function selectGroup(groupId) {
    account_group_id = groupId;
    closeGroupMenu();
    groupTriggerEl?.focus();
  }

  function createGroupFromQuery() {
    const typed = groupQuery.trim();
    closeGroupMenu();
    catModalRef?.openAccountGroupModal(typed);
  }

  function moveGroupSelection(step) {
    if (!filteredGroups.length) return;
    const next = groupActiveIndex + step;
    groupActiveIndex = next < 0 ? filteredGroups.length - 1 : next >= filteredGroups.length ? 0 : next;
    groupMenuEl?.querySelectorAll('.account-modal__picker-option')[groupActiveIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }

  function handleGroupKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!groupMenuOpen) {
        toggleGroupMenu();
        return;
      }
      moveGroupSelection(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!groupMenuOpen) {
        toggleGroupMenu();
        return;
      }
      const active = filteredGroups[groupActiveIndex];
      if (active) selectGroup(active.id);
      else if (canCreateGroup) createGroupFromQuery();
      return;
    }

    if (event.key === 'Escape' && groupMenuOpen) {
      event.preventDefault();
      closeGroupMenu();
      groupTriggerEl?.focus();
    }
  }

  function onGroupQueryInput() {
    groupActiveIndex = filteredGroups.length ? 0 : -1;
  }

  function handleGroupOutsideClick(event) {
    if (!groupMenuOpen) return;
    if (!groupTriggerEl?.contains(event.target) && !groupMenuEl?.contains(event.target)) {
      closeGroupMenu();
    }
  }

  function handleGroupScroll(event) {
    if (!groupMenuOpen) return;
    if (groupMenuEl && (event.target === groupMenuEl || groupMenuEl.contains(event.target))) return;
    positionGroupMenu();
  }

  onMount(() => {
    window.addEventListener('click', handleTypeOutsideClick);
    window.addEventListener('click', handleGroupOutsideClick);
    window.addEventListener('resize', closeTypeMenu);
    window.addEventListener('resize', closeGroupMenu);
    window.addEventListener('scroll', handleTypeScroll, true);
    window.addEventListener('scroll', handleGroupScroll, true);
    return () => {
      window.removeEventListener('click', handleTypeOutsideClick);
      window.removeEventListener('click', handleGroupOutsideClick);
      window.removeEventListener('resize', closeTypeMenu);
      window.removeEventListener('resize', closeGroupMenu);
      window.removeEventListener('scroll', handleTypeScroll, true);
      window.removeEventListener('scroll', handleGroupScroll, true);
    };
  });

 
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
      <form class="account-modal__panel" on:submit|preventDefault={saveAccount}>
        <header class="account-modal__header">
          <label class="account-modal__avatar" aria-label={t('Upload Photo')} title={t('Upload Photo')}>
            {#if modalImageUrl}
              <img src={modalImageUrl} alt="" class="account-modal__avatar-img" />
            {:else}
              <span class="account-modal__avatar-letter" aria-hidden="true">{headerInitial}</span>
            {/if}
            <span class="account-modal__avatar-badge" aria-hidden="true">
              <span class="ms f">photo_camera</span>
            </span>
            <input type="file" accept="image/*" on:change={handleImageUpload} hidden />
          </label>

          <div class="account-modal__header-copy">
            <span id="accountModalTitle" class="account-modal__eyebrow">
              {account?.id ? t('Edit') : t('Create')}
            </span>
            <span
              class="account-modal__preview-name"
              class:account-modal__preview-name--empty={!name.trim()}>
              {name.trim() || t('New Account')}
            </span>
            <span class="account-modal__chips">
              <span class="account-modal__chip">
                <span class="ms f">{getTypeSymbol(account_type_id)}</span>
                {headerTypeLabel}
              </span>
              {#if code}
                <span class="account-modal__code" dir="ltr" title={code}>{code}</span>
              {/if}
            </span>
          </div>

          <button type="button" class="account-modal__close" on:click={closeModal} aria-label={t('Close')}>
            <span class="ms">close</span>
          </button>
        </header>

        <div class="account-modal__body">
          <div class="account-modal__section">
            <span class="ms">badge</span>
            <span>{t('Details')}</span>
            <span class="account-modal__rule" aria-hidden="true"></span>
          </div>

          <label class="account-modal__field account-modal__field--full">
            <span class="account-modal__label">
              {t('Name')}<span class="account-modal__required" aria-hidden="true">*</span>
            </span>
            <span class="account-modal__box">
              <span class="ms account-modal__icon">person</span>
              <input class="account-modal__input" type="text" bind:value={name} autocomplete="off" />
            </span>
          </label>

          <div
            class="account-modal__field"
            class:account-modal__field--full={!enable_account_groups}>
            <span id="accountModalTypeLabel" class="account-modal__label">{t('Account Type')}</span>
            <div class="account-modal__picker-control">
              <button
                bind:this={typeTriggerEl}
                type="button"
                class="account-modal__picker-trigger"
                class:is-open={typeMenuOpen}
                aria-haspopup="listbox"
                aria-expanded={typeMenuOpen}
                aria-labelledby="accountModalTypeLabel"
                on:click={toggleTypeMenu}
                on:keydown={handleTypeKeydown}>
                <span
                  class="ms f account-modal__picker-icon account-modal__picker-icon--brand"
                  aria-hidden="true">{getTypeSymbol(account_type_id)}</span>
                <span class="account-modal__picker-value">{headerTypeLabel}</span>
                <span class="ms account-modal__picker-caret" aria-hidden="true">expand_more</span>
              </button>

              {#if typeMenuOpen}
                <div
                  bind:this={typeMenuEl}
                  use:portal
                  class="account-modal__picker-menu"
                  role="dialog"
                  tabindex="-1"
                  aria-labelledby="accountModalTypeLabel"
                  dir={typeMenuDir}
                  style={typeMenuStyle}
                  on:keydown={handleTypeKeydown}>
                  <label class="account-modal__picker-search">
                    <span class="ms" aria-hidden="true">search</span>
                    <input
                      type="search"
                      bind:value={typeQuery}
                      placeholder={`${t('Search')}…`}
                      aria-label={t('Search')}
                      autocomplete="off"
                      on:input={onTypeQueryInput} />
                  </label>

                  <div
                    class="account-modal__picker-list"
                    role="listbox"
                    aria-labelledby="accountModalTypeLabel">
                    {#each filteredTypes as option, index (option.id)}
                      <button
                        type="button"
                        role="option"
                        aria-selected={String(option.id) === String(account_type_id)}
                        class="account-modal__picker-option"
                        class:is-selected={String(option.id) === String(account_type_id)}
                        class:is-active={index === typeActiveIndex}
                        on:mouseenter={() => (typeActiveIndex = index)}
                        on:click={() => selectType(option.id)}>
                        <span
                          class="ms f account-modal__picker-option-icon"
                          aria-hidden="true">{getTypeSymbol(option.id)}</span>
                        <span class="account-modal__picker-option-label">{getTypeLabel(option)}</span>
                      </button>
                    {/each}
                    {#if !filteredTypes.length}
                      <span class="account-modal__picker-empty">{t('No result')}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>

          {#if enable_account_groups}
            <div class="account-modal__field">
              <span id="accountModalGroupLabel" class="account-modal__label">{t('Account Groups')}</span>
              <div class="account-modal__picker-control">
                <button
                  bind:this={groupTriggerEl}
                  type="button"
                  class="account-modal__picker-trigger"
                  class:is-open={groupMenuOpen}
                  aria-haspopup="listbox"
                  aria-expanded={groupMenuOpen}
                  aria-labelledby="accountModalGroupLabel"
                  on:click={toggleGroupMenu}
                  on:keydown={handleGroupKeydown}>
                  <span class="ms account-modal__picker-icon" aria-hidden="true">folder</span>
                  <span class="account-modal__picker-value">{selectedGroup?.name || t('Select account group')}</span>
                  <span class="ms account-modal__picker-caret" aria-hidden="true">expand_more</span>
                </button>

                {#if groupMenuOpen}
                  <div
                    bind:this={groupMenuEl}
                    use:portal
                    class="account-modal__picker-menu"
                    role="dialog"
                    tabindex="-1"
                    aria-labelledby="accountModalGroupLabel"
                    dir={groupMenuDir}
                    style={groupMenuStyle}
                    on:keydown={handleGroupKeydown}>
                    <label class="account-modal__picker-search">
                      <span class="ms" aria-hidden="true">search</span>
                      <input
                        type="search"
                        bind:value={groupQuery}
                        placeholder={`${t('Search')}…`}
                        aria-label={t('Search')}
                        autocomplete="off"
                        on:input={onGroupQueryInput} />
                    </label>

                    <div
                      class="account-modal__picker-list"
                      role="listbox"
                      aria-labelledby="accountModalGroupLabel">
                      {#each filteredGroups as group, index (group.id)}
                        <button
                          type="button"
                          role="option"
                          aria-selected={String(group.id) === String(account_group_id)}
                          class="account-modal__picker-option"
                          class:is-selected={String(group.id) === String(account_group_id)}
                          class:is-active={index === groupActiveIndex}
                          on:mouseenter={() => (groupActiveIndex = index)}
                          on:click={() => selectGroup(group.id)}>
                          {group.name}
                        </button>
                      {/each}
                      {#if !filteredGroups.length && !canCreateGroup}
                        <span class="account-modal__picker-empty">{t('No result')}</span>
                      {/if}
                    </div>

                    {#if canCreateGroup}
                      <button class="account-modal__picker-create" type="button" on:click={createGroupFromQuery}>
                        <span class="ms" aria-hidden="true">add_circle</span>
                        <span>{t('Create')} «{groupSearch}»</span>
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if isShareholderType || isVisitorType}
            <label class="account-modal__field account-modal__field--full">
              <span class="account-modal__label">{t('Percentage')}</span>
              <span class="account-modal__box">
                <span class="ms account-modal__icon" aria-hidden="true">percent</span>
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
                      /* Only shareholders share a 100% total between them. */
                      if (
                        isShareholderType &&
                        num > 100 - (account?.id ? totalPercentage : totalPercentage)
                      )
                        value =
                          Number(100 - (account?.id ? totalPercentage : totalPercentage)).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          }) + '';
                      if (num > 100) value = '100';
                      if (num < 0) value = '0';
                    }
                    percentage = value;
                  }} />
              </span>
              {#if isShareholderType}
                <small class="account-modal__hint">
                  {t('Total')}:
                  <span dir="ltr"
                    >{(account?.id
                      ? Number(totalPercentage) + Number(percentage)
                      : Number(totalPercentage) + Number(percentage)
                    ).toLocaleString(undefined, { maximumFractionDigits: 3 })}%</span>
                </small>
              {:else}
                <small class="account-modal__hint">
                  {t('Share of the benefit of each sale this visitor brings')}
                </small>
              {/if}
            </label>
          {/if}

          <div class="account-modal__section">
            <span class="ms">contact_phone</span>
            <span>{t('Contact')}</span>
            <span class="account-modal__rule" aria-hidden="true"></span>
          </div>

          <label class="account-modal__field">
            <span class="account-modal__label">{t('Phone 2')}</span>
            <span class="account-modal__box">
              <span class="ms account-modal__icon" aria-hidden="true">call</span>
              <input
                class="account-modal__input account-modal__input--ltr"
                type="tel"
                inputmode="tel"
                placeholder="07XX XXX XXX"
                bind:value={phone2}
                autocomplete="off" />
            </span>
          </label>

          <label class="account-modal__field">
            <span class="account-modal__label">{t('Whatsapp Number')}</span>
            <span class="account-modal__box">
              <span
                class="ms account-modal__icon account-modal__icon--whatsapp"
                aria-hidden="true">chat</span>
              <input
                class="account-modal__input account-modal__input--ltr"
                type="tel"
                inputmode="tel"
                placeholder="07XX XXX XXX"
                bind:value={phone}
                autocomplete="off" />
            </span>
          </label>

          <label class="account-modal__field">
            <span class="account-modal__label">{t('Address')}</span>
            <span class="account-modal__box">
              <span class="ms account-modal__icon" aria-hidden="true">location_on</span>
              <input class="account-modal__input" type="text" bind:value={address} autocomplete="off" />
            </span>
          </label>

          <label class="account-modal__field">
            <span class="account-modal__label">{t('Email')}</span>
            <span class="account-modal__box">
              <span class="ms account-modal__icon" aria-hidden="true">mail</span>
              <input
                class="account-modal__input account-modal__input--ltr"
                type="email"
                bind:value={email}
                autocomplete="off" />
            </span>
          </label>

          {#if !account?.id}
            <div class="account-modal__section">
              <span class="ms">account_balance_wallet</span>
              <span>{t('Finance')}</span>
              <span class="account-modal__rule" aria-hidden="true"></span>
            </div>

            <fieldset class="account-modal__balance">
              <legend class="account-modal__legend">{t('Initial Balance')}</legend>

              <div class="account-modal__balance-row">
                <div class="account-modal__segment" role="group" aria-label={t('Initial Balance')}>
                  <button
                    type="button"
                    class="account-modal__segment-btn"
                    class:is-active={initialBalanceType === 'Debit'}
                    on:click={() => (initialBalanceType = 'Debit')}>
                    {t('Debit')}
                  </button>
                  <button
                    type="button"
                    class="account-modal__segment-btn"
                    class:is-active={initialBalanceType === 'Credit'}
                    on:click={() => (initialBalanceType = 'Credit')}>
                    {t('Credit')}
                  </button>
                </div>

                <span class="account-modal__amount-box">
                  <input
                    class="account-modal__amount"
                    type="text"
                    inputmode="decimal"
                    bind:value={balance}
                    placeholder="0" />
                </span>

                <span class="account-modal__currency">
                  <button
                    type="button"
                    class="account-modal__currency-btn"
                    aria-haspopup="listbox"
                    aria-expanded={openCurrencyRow === 0}
                    aria-label={t('Currency')}
                    on:click={() => toggleCurrencyMenu(0)}>
                    <span dir="ltr">{currencySymbol(currency)}</span>
                    <span class="ms" aria-hidden="true">expand_more</span>
                  </button>
                  {#if openCurrencyRow === 0}
                    <button
                      type="button"
                      class="account-modal__currency-backdrop"
                      aria-label={t('Close')}
                      on:click={closeCurrencyMenu}></button>
                    <div class="account-modal__currency-menu" role="listbox" aria-label={t('Currency')}>
                      {#each mainCurrencies as cur (cur.code)}
                        <button
                          type="button"
                          role="option"
                          aria-selected={cur.code === currency}
                          class="account-modal__currency-option"
                          class:is-selected={cur.code === currency}
                          on:click={() => pickCurrency(0, cur.code)}>
                          <span class="account-modal__currency-sym" dir="ltr">{cur.symbol || cur.code}</span>
                          <span>{currencyName(cur)}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </span>
              </div>

              {#each additionalInitialBalances as additional, index (index)}
                <div class="account-modal__balance-row">
                  <div class="account-modal__segment" role="group" aria-label={t('Initial Balance')}>
                    <button
                      type="button"
                      class="account-modal__segment-btn"
                      class:is-active={additional.type === 'Debit'}
                      on:click={() => (additional.type = 'Debit')}>
                      {t('Debit')}
                    </button>
                    <button
                      type="button"
                      class="account-modal__segment-btn"
                      class:is-active={additional.type === 'Credit'}
                      on:click={() => (additional.type = 'Credit')}>
                      {t('Credit')}
                    </button>
                  </div>

                  <span class="account-modal__amount-box">
                    <input
                      class="account-modal__amount"
                      type="text"
                      inputmode="decimal"
                      bind:value={additional.balance}
                      placeholder="0" />
                  </span>

                  <span class="account-modal__currency">
                    <button
                      type="button"
                      class="account-modal__currency-btn"
                      aria-haspopup="listbox"
                      aria-expanded={openCurrencyRow === index + 1}
                      aria-label={t('Currency')}
                      on:click={() => toggleCurrencyMenu(index + 1)}>
                      <span dir="ltr">{currencySymbol(additional.currency)}</span>
                      <span class="ms" aria-hidden="true">expand_more</span>
                    </button>
                    {#if openCurrencyRow === index + 1}
                      <button
                        type="button"
                        class="account-modal__currency-backdrop"
                        aria-label={t('Close')}
                        on:click={closeCurrencyMenu}></button>
                      <div class="account-modal__currency-menu" role="listbox" aria-label={t('Currency')}>
                        {#each additional.remainingCurrencies as cur (cur.code)}
                          <button
                            type="button"
                            role="option"
                            aria-selected={cur.code === additional.currency}
                            class="account-modal__currency-option"
                            class:is-selected={cur.code === additional.currency}
                            on:click={() => pickCurrency(index + 1, cur.code)}>
                            <span class="account-modal__currency-sym" dir="ltr">{cur.symbol || cur.code}</span>
                            <span>{currencyName(cur)}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </span>

                  <button
                    type="button"
                    class="account-modal__row-del"
                    aria-label={t('Delete')}
                    on:click={() => removeAdditionalInitialBalance(index)}>
                    <span class="ms" aria-hidden="true">close</span>
                  </button>
                </div>
              {/each}

              <div class="account-modal__balance-foot">
                <button
                  type="button"
                  class="account-modal__add-currency"
                  title={t('Add')}
                  disabled={additionalInitialBalances.length >= currencies.length - 1 ||
                    !balance ||
                    (additionalInitialBalances.length > 0 &&
                      !additionalInitialBalances[additionalInitialBalances.length - 1].balance)}
                  on:click={addAdditionalInitialBalance}>
                  <span class="ms" aria-hidden="true">add</span>
                  {t('Currency')}
                </button>

                <div class="account-modal__date" role="group" aria-label={t('Date')}>
                  <span class="account-modal__date-label">{t('Date')}</span>
                  <span class="account-modal__date-box">
                    <AppDatePicker
                      value={initialBalanceDate}
                      on:change={(event) => (initialBalanceDate = event.detail)} />
                    <span class="ms account-modal__date-icon" aria-hidden="true">calendar_month</span>
                  </span>
                </div>
              </div>
            </fieldset>
          {/if}

          <label class="account-modal__field account-modal__field--full">
            <span class="account-modal__label">{t('Description')}</span>
            <textarea class="account-modal__textarea" rows="2" bind:value={description}></textarea>
          </label>
        </div>

        <footer class="account-modal__footer">
          <button type="button" class="account-modal__cancel" on:click={closeModal}>
            {t('Cancel')}
          </button>
          <button type="submit" class="account-modal__submit">
            <span class="ms" aria-hidden="true">check</span>
            <span>{account?.id ? t('Update') : t('Save')}</span>
          </button>
        </footer>
      </form>
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
  /*
   * Account dialog, redrawn from the reference sheet (`Accounts.html`):
   * soft gradient header, two-column form grid, hairline section labels and a
   * 34px control rhythm. The box copies the Add Journal popup
   * (QuickEntryModal --journal, Journal.dc.html) at its 358.667px height, with
   * the column widened from the popup's 520px to 560px.
   */
  .account-modal.qa-modal :global(.modal-dialog.account-modal__dialog) {
    width: 560px;
    max-width: calc(100vw - 24px);
  }

  .account-modal {
    --am-brand: var(--z-brand, #2f6fed);
    --am-brand-strong: #245ed0;
    --am-brand-soft: var(--z-brand-soft, #e3ecff);
    --am-border: var(--z-border, #e1e7f0);
    --am-border-soft: var(--z-border-soft, #eef2f7);
    --am-surface: var(--z-surface, #ffffff);
    --am-surface-2: var(--z-surface-2, #f8fafc);
    --am-surface-3: var(--z-surface-3, #f1f5f9);
    --am-ink: var(--z-ink, #0b1530);
    --am-text: var(--z-text, #475569);
    --am-muted: var(--z-muted, #64748b);
    --am-subtle: var(--z-subtle, #94a3b8);
    --am-danger: var(--z-danger, #b91c1c);
    --am-danger-soft: var(--z-danger-soft, #fee2e2);
    --am-ok: var(--z-ok, #15803d);
    --am-ok-soft: var(--z-ok-soft, #dcfce7);
    --am-num: var(--z-font-num, 'Inter', 'Vazirmatn', sans-serif);

    z-index: 1055;
    overflow: hidden;
  }

  .account-modal__backdrop {
    z-index: 1050;
    background: rgba(11, 21, 48, 0.45);
    backdrop-filter: blur(2px);
  }

  .account-modal__dialog {
    z-index: 1056;
    /* MDB leaves every modal dialog click-through and only its own
       `.modal-content` opts back in; this panel is a form, so it must opt in. */
    pointer-events: auto;
    display: flex;
    /* Add Journal popup box: 560px wide (the popup's 520px nudged up); the
       panel stays pinned to the 358.667px height measured on that popup. */
    width: 560px;
    max-width: calc(100vw - 24px);
    height: 358.667px;
    max-height: calc(100vh - 24px);
    margin: 12px auto;
  }

  .account-modal__panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    max-height: calc(100vh - 24px);
    overflow: hidden;
    border: 0;
    border-radius: 16px;
    background: var(--am-surface);
    box-shadow: 0 30px 80px -20px rgba(11, 21, 48, 0.6);
    animation: account-modal-enter 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes account-modal-enter {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* ---------- header ---------- */
  .account-modal__header {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--am-border-soft);
    background: linear-gradient(135deg, var(--am-brand-soft), var(--am-surface) 70%);
  }

  /* Anchored to the dialog id because Svelte compiles the scope hash into a
     zero-specificity `:where()`, which would lose the cascade to the page-wide
     `.content-wrapper main label` rule (font-size / colour / line-height / margin). */
  #accountModal .account-modal__header .account-modal__avatar {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: 0;
    padding: 0;
    line-height: 1;
    overflow: visible;
    border-radius: 14px;
    background: color-mix(in srgb, var(--am-brand) 14%, transparent);
    color: var(--am-brand);
    font-size: 19px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease;
  }

  .account-modal__avatar:hover {
    transform: scale(1.03);
  }

  .account-modal__avatar:focus-within {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--am-brand) 22%, transparent);
  }

  .account-modal__avatar-badge {
    position: absolute;
    inset-inline-end: -5px;
    bottom: -5px;
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 2px solid var(--am-surface);
    border-radius: 999px;
    background: var(--am-brand);
    color: #ffffff;
    font-size: 8px;
    box-shadow: 0 2px 5px rgba(11, 21, 48, 0.18);
  }

  .account-modal__avatar-badge .ms {
    font-size: 11px;
  }

  .account-modal__avatar-img {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 14px;
    object-fit: cover;
  }

  .account-modal__header .account-modal__avatar-letter {
    display: block;
    color: inherit;
    font-size: 19px;
    font-weight: 800;
    line-height: 1;
    text-transform: uppercase;
  }

  .account-modal__header-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .account-modal__eyebrow {
    color: var(--am-brand);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.3px;
    line-height: 1.2;
  }

  .account-modal__preview-name {
    overflow: hidden;
    color: var(--am-ink);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-modal__preview-name--empty {
    color: var(--am-subtle);
  }

  .account-modal__chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .account-modal__chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--am-brand) 12%, transparent);
    color: var(--am-brand);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .account-modal__chip .ms {
    font-size: 12px;
  }

  .account-modal__code {
    display: inline-flex;
    align-items: center;
    max-width: 160px;
    height: 20px;
    padding: 0 7px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--am-surface-3);
    color: var(--am-text);
    font-family: var(--am-num);
    font-size: 10.5px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-modal__close {
    display: inline-flex;
    flex-shrink: 0;
    align-self: center;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--am-muted);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .account-modal__close:hover {
    background: var(--am-surface-3);
    color: var(--am-ink);
  }

  .account-modal__close .ms {
    font-size: 19px;
  }

  .account-modal__close:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  /* ---------- body ---------- */
  .account-modal__body {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
    align-content: start;
    min-width: 0;
    min-height: 0;
    padding: 12px 16px 14px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* The bar is hidden outright: this panel kept drawing the up/down arrow
       buttons and the track line (standard `scrollbar-width: thin` hands the
       bar to the native painter on Chromium/WebView2). Wheel, touch, keyboard
       and drag still scroll the body. */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .account-modal__body::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .account-modal__section {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    color: var(--am-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .account-modal__section .ms {
    font-size: 15px;
  }

  .account-modal__rule {
    flex: 1;
    height: 1px;
    background: var(--am-border-soft);
  }

  .account-modal__field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    margin: 0;
  }

  .account-modal__field--full {
    grid-column: 1 / -1;
  }

  .account-modal__label {
    color: var(--am-text);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    text-align: start;
  }

  .account-modal__required {
    color: var(--am-danger);
  }

  .account-modal__box {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 34px;
    border: 1px solid var(--am-border);
    border-radius: 9px;
    background: var(--am-surface);
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .account-modal__box:hover {
    border-color: var(--z-border-strong, #dce6f8);
  }

  .account-modal__box:focus-within {
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__icon {
    flex-shrink: 0;
    margin-inline-start: 9px;
    color: var(--am-subtle);
    font-size: 16px;
    pointer-events: none;
  }

  .account-modal__icon--whatsapp {
    color: #16a34a;
  }

  .account-modal__input {
    flex: 1;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 10px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--am-ink);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    text-align: start;
  }

  .account-modal__input::placeholder {
    color: var(--am-subtle);
    font-weight: 500;
  }

  /* Phone / whatsapp / email mirror the reference contact inputs: Inter numerals,
     bold, LTR but flush to the inline end. */
  .account-modal__input--ltr {
    font-family: var(--am-num);
    font-weight: 700;
    direction: ltr;
    text-align: right;
  }

  /* ---------- dropdown picker shared by account type and account group ---------- */
  .account-modal__picker-control {
    position: relative;
    min-width: 0;
  }

  .account-modal__picker-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--am-border);
    border-radius: 8px;
    background: var(--am-surface);
    color: var(--am-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .account-modal__picker-trigger:hover {
    border-color: var(--z-border-strong, #dce6f8);
  }

  .account-modal__picker-trigger:focus-visible,
  .account-modal__picker-trigger.is-open {
    outline: 0;
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__picker-icon {
    flex: 0 0 auto;
    color: var(--am-muted);
    font-size: 16px;
  }

  .account-modal__picker-icon--brand {
    color: var(--am-brand);
  }

  .account-modal__picker-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-modal__picker-caret {
    flex: 0 0 auto;
    color: var(--am-muted);
    font-size: 17px;
  }

  .account-modal__picker-menu {
    position: fixed;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    padding: 4px;
    /* Portaled to <body>: the modal-scoped tokens no longer cascade here. */
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 10px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 16px 40px -14px rgba(11, 21, 48, 0.35);
  }

  .account-modal__picker-search {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--z-border-soft, #eef2f9);
    border-radius: 6px;
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-subtle, #94a3b8);
  }

  .account-modal__picker-search .ms {
    font-size: 15px;
  }

  .account-modal__picker-search input {
    flex: 1;
    width: 0;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font: inherit;
    font-size: 11.5px;
    font-weight: 500;
  }

  .account-modal__picker-search input::placeholder {
    color: var(--z-subtle, #94a3b8);
  }

  .account-modal__picker-list {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    gap: 1px;
    max-height: 180px;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .account-modal__picker-list::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .account-modal__picker-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font: inherit;
    font-size: 11.5px;
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

  .account-modal__picker-option:hover,
  .account-modal__picker-option.is-active {
    background: var(--z-surface-3, #f1f5f9);
  }

  .account-modal__picker-option.is-selected {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-weight: 700;
  }

  .account-modal__picker-option-icon {
    flex: 0 0 auto;
    color: var(--z-link, #2f6fed);
    font-size: 16px;
  }

  .account-modal__picker-option-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-modal__picker-empty {
    padding: 0 8px;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    font-weight: 500;
    line-height: 28px;
  }

  .account-modal__picker-create {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 8px;
    border: 0;
    border-top: 1px solid var(--z-border-soft, #eef2f9);
    background: transparent;
    color: var(--z-link, #2f6fed);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .account-modal__picker-create .ms {
    font-size: 16px;
  }

  .account-modal__picker-create span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-modal__hint {
    color: var(--am-muted);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.5;
  }

  /* ---------- initial balance ---------- */
  .account-modal__balance {
    display: flex;
    flex-direction: column;
    grid-column: 1 / -1;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .account-modal__legend {
    padding: 0 0 4px;
    color: var(--am-text);
    font-size: 11px;
    font-weight: 700;
  }

  .account-modal__balance-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .account-modal__segment {
    display: flex;
    flex-shrink: 0;
    gap: 1px;
    padding: 2px;
    border-radius: 7px;
    background: var(--am-surface-3);
  }

  .account-modal__segment-btn {
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--am-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .account-modal__segment-btn.is-active {
    background: var(--am-surface);
    color: var(--am-ink);
    font-weight: 800;
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.18);
  }

  .account-modal__segment-btn:first-child.is-active {
    color: var(--am-danger);
  }

  .account-modal__segment-btn:last-child.is-active {
    color: var(--am-ok);
  }

  .account-modal__segment-btn:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__amount-box {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    height: 30px;
    border: 1px solid var(--am-border);
    border-radius: 7px;
    background: var(--am-surface);
  }

  .account-modal__amount-box:focus-within {
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__amount {
    flex: 1;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 9px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--am-ink);
    font-family: var(--am-num);
    font-size: 12.5px;
    font-weight: 800;
    direction: ltr;
    text-align: right;
  }

  .account-modal__currency {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  }

  .account-modal__currency-btn {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    height: 30px;
    padding: 0 4px 0 6px;
    border: 1px solid var(--am-border);
    border-radius: 7px;
    background: var(--am-surface);
    color: var(--am-ink);
    font-family: var(--am-num);
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .account-modal__currency-btn:focus-visible {
    outline: 0;
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__currency-btn .ms {
    color: var(--am-muted);
    font-size: 15px;
  }

  .account-modal__currency-backdrop {
    position: fixed;
    inset: 0;
    z-index: 5;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  .account-modal__currency-menu {
    position: absolute;
    top: 34px;
    inset-inline-end: 0;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 150px;
    padding: 4px;
    border: 1px solid var(--am-border);
    border-radius: 10px;
    background: var(--am-surface);
    box-shadow: 0 16px 40px -14px rgba(11, 21, 48, 0.35);
  }

  .account-modal__currency-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--am-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .account-modal__currency-option:hover {
    background: var(--am-surface-3);
  }

  .account-modal__currency-option.is-selected {
    background: var(--am-brand-soft);
    color: var(--am-brand);
    font-weight: 800;
  }

  .account-modal__currency-sym {
    width: 22px;
    font-family: var(--am-num);
    font-weight: 800;
    text-align: center;
  }

  .account-modal__row-del {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--am-danger);
    font-size: 11px;
    cursor: pointer;
  }

  .account-modal__row-del:hover {
    background: var(--am-danger-soft);
  }

  .account-modal__row-del .ms {
    font-size: 16px;
  }

  .account-modal__balance-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .account-modal__add-currency {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--am-brand);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .account-modal__add-currency:hover:not(:disabled) {
    background: var(--am-brand-soft);
  }

  .account-modal__add-currency:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .account-modal__add-currency .ms {
    font-size: 15px;
  }

  .account-modal__date {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .account-modal__date-label {
    color: var(--am-muted);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .account-modal__date-box {
    display: flex;
    align-items: center;
    gap: 2px;
    width: 118px;
    height: 26px;
    padding-inline-end: 6px;
    border: 1px solid var(--am-border);
    border-radius: 6px;
    background: var(--am-surface);
  }

  .account-modal__date-box:focus-within {
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__date-icon {
    flex-shrink: 0;
    color: var(--am-subtle);
    font-size: 14px;
    pointer-events: none;
  }

  .account-modal__date-box :global(.app-date-field) {
    display: flex;
    flex: 1;
    align-items: center;
    width: auto;
    min-width: 0;
  }

  .account-modal__date-box :global(.pdp) {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .account-modal__date-box :global(.app-date-field input) {
    width: 100%;
    height: 24px;
    min-height: 24px;
    padding-inline: 7px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--am-ink) !important;
    font-family: var(--am-num);
    font-size: 11.5px;
    font-weight: 700;
    text-align: end !important;
    direction: ltr;
  }

  .account-modal__textarea {
    width: 100%;
    min-height: 52px;
    padding: 7px 10px;
    border: 1px solid var(--am-border);
    border-radius: 8px;
    outline: 0;
    background: var(--am-surface);
    color: var(--am-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.6;
    box-sizing: border-box;
    resize: vertical;
  }

  .account-modal__textarea:focus {
    border-color: var(--am-brand);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  /* ---------- footer ---------- */
  .account-modal__footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--am-border-soft);
    background: var(--am-surface-2);
  }

  .account-modal__cancel {
    height: 34px;
    margin-inline-end: auto;
    padding: 0 14px;
    border: 1px solid var(--am-border);
    border-radius: 9px;
    background: var(--am-surface);
    color: var(--am-text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .account-modal__cancel:hover {
    border-color: var(--z-border-strong, #dce6f8);
    color: var(--am-ink);
  }

  .account-modal__submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 34px;
    padding: 0 18px;
    border: 0;
    border-radius: 9px;
    background: var(--am-brand);
    color: #ffffff;
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 18px -8px rgba(47, 111, 237, 0.9);
    transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
  }

  .account-modal__submit:hover:not(:disabled) {
    background: var(--am-brand-strong);
  }

  .account-modal__submit:active:not(:disabled) {
    transform: translateY(1px);
  }

  .account-modal__submit:disabled,
  .account-modal__submit[aria-busy='true'] {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .account-modal__submit:focus-visible,
  .account-modal__cancel:focus-visible,
  .account-modal__add-currency:focus-visible,
  .account-modal__row-del:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .account-modal__submit .ms {
    font-size: 15px;
  }

  @media (max-height: 760px) {
    .account-modal__dialog,
    .account-modal__panel {
      max-height: calc(100dvh - 16px);
    }

    .account-modal__dialog {
      margin-block: 8px;
    }
  }

  @media (max-width: 640px) {
    /* Width stays 520px, capped by calc(100vw - 24px) like the Add Journal popup. */
    .account-modal__dialog {
      margin: 8px auto;
    }

    .account-modal__body {
      grid-template-columns: minmax(0, 1fr);
      padding: 10px 12px 12px;
    }

    .account-modal__header {
      padding: 12px 12px;
    }

    .account-modal__footer {
      padding: 10px 12px;
    }
  }

  @media (max-width: 560px) {
    .account-modal__balance-row {
      flex-wrap: wrap;
    }

    .account-modal__amount-box {
      flex-basis: 100%;
      order: 3;
    }

    .account-modal__row-del {
      margin-inline-start: auto;
    }
  }

  @media (max-width: 400px) {
    .account-modal__submit {
      padding-inline: 12px;
    }

    .account-modal__date-box :global(.pdp) {
      width: 112px;
    }
  }
</style>

