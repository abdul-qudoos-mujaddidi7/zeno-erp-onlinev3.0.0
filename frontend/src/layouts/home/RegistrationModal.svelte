<script>
  import { onMount, tick } from 'svelte';

  export let currentLang = 'fa';
  export let packageSelected = null;
  export let packageIcon = { icon: 'bi-gift', tone: 'blue' };

  // Organization types loaded by the parent page from /api/v2/system/info.
  export let orgTypes = [];

  // Bind this value from the parent:
  // bind:orgTypeSelected
  export let orgTypeSelected = null;
  export let registering = false;
  export let error = '';
  export let orgName = '';
  export let fullName = '';
  export let phone = '';
  export let username = '';
  export let password = '';
  export let confirmPassword = '';
  export let inventoryMethod = 'CLASSIC';
  export let onClose = () => {};
  export let onSubmit = async () => {};
  export let onLogin = () => {};

  let modalPanel;
  let firstInput;
  let organizationTypeInput;

  let showPassword = false;
  let showConfirmPassword = false;

  let orgTypeSearch = '';
  let showOrgTypeDropdown = false;
  let orgTypeMissing = false;
  let lastAutoSelectedPackageKey = '';

  const copy = {
    en: {
      title: 'Create your ERP account',
      subtitle: 'Create your business account and start using the ERP',
      package: 'Selected package',
      packageFallback: 'Demo package',
      company: 'Business / Company Name',
      organizationType: 'Organization Type',
      organizationTypePlaceholder: 'Select organization type',
      organizationTypeSearch: 'Search organization types...',
      organizationTypeHint: 'This controls the modules and features enabled for your organization.',
      organizationTypeRequired: 'Please select an organization type.',
      noOrganizationTypes: 'No organization types found',
      fullName: 'Full Name',
      phone: 'Phone Number',
      username: 'Email or Username',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      inventoryMethod: 'Inventory Method', 
      classic: 'Classic — simple stock & average cost',
      fifo: 'FIFO — First In, First Out',
      lifo: 'LIFO — Last In, First Out',
      inventoryHint: 'This applies to all inventory operations for your organization.',
      submit: 'Start Using',
      loginPrefix: 'Already have an account?',
      login: 'Login',
      close: 'Close registration modal',
    },
    fa: {
      title: 'ایجاد حساب ERP',
      subtitle: 'حساب کسب‌وکار خود را بسازید و استفاده از ERP را شروع کنید',
      package: 'پکیج انتخاب شده',
      packageFallback: 'پکیج دمو',
      company: 'نام کسب‌وکار / شرکت',
      organizationType: 'نوع سازمان',
      organizationTypePlaceholder: 'نوع سازمان را انتخاب کنید',
      organizationTypeSearch: 'جستجوی نوع سازمان...',
      organizationTypeHint: 'ماژول‌ها و امکانات سیستم بر اساس نوع سازمان تنظیم می‌شوند.',
      organizationTypeRequired: 'لطفاً نوع سازمان را انتخاب کنید.',
      noOrganizationTypes: 'نوع سازمانی پیدا نشد',
      fullName: 'نام کامل',
      phone: 'شماره تماس',
      username: 'ایمیل یا نام کاربری',
      password: 'رمز عبور',
      confirmPassword: 'تکرار رمز عبور',
      inventoryMethod: 'روش موجودی انبار',
      classic: 'کلاسیک — موجودی ساده و میانگین قیمت',
      fifo: 'FIFO — اولین ورود، اولین خروج',
      lifo: 'LIFO — آخرین ورود، اولین خروج',
      inventoryHint: 'این انتخاب برای تمام عملیات انبار سازمان شما اعمال می‌شود.',
      submit: 'شروع استفاده',
      loginPrefix: 'قبلاً حساب دارید؟',
      login: 'ورود',
      close: 'بستن فرم ثبت‌نام',
    },
    ps: {
      title: 'د ERP حساب جوړ کړئ',
      subtitle: 'خپل سوداګریز حساب جوړ کړئ او د ERP کارول پیل کړئ',
      package: 'ټاکل شوی پکیج',
      packageFallback: 'ډیمو پکیج',
      company: 'د کاروبار / شرکت نوم',
      organizationType: 'د سازمان ډول',
      organizationTypePlaceholder: 'د سازمان ډول وټاکئ',
      organizationTypeSearch: 'د سازمان ډول ولټوئ...',
      organizationTypeHint: 'د سیستم برخې او امکانات د سازمان د ډول له مخې تنظیمېږي.',
      organizationTypeRequired: 'مهرباني وکړئ د سازمان ډول وټاکئ.',
      noOrganizationTypes: 'د سازمان ډول ونه موندل شو',
      fullName: 'بشپړ نوم',
      phone: 'د تلیفون شمېره',
      username: 'ایمیل یا کارن نوم',
      password: 'پټ نوم',
      confirmPassword: 'پټ نوم بیا ولیکئ',
      inventoryMethod: 'د ذخیرې طریقه',
      classic: 'کلاسیک — ساده ذخیره او منځنی قیمت',
      fifo: 'FIFO — لومړی ننوت، لومړی وت',
      lifo: 'LIFO — وروستی ننوت، لومړی وت',
      inventoryHint: 'دا انتخاب ستاسو د سازمان د ټولو ذخیرې عملیاتو لپاره پلي کیږي.',
      submit: 'کارول پیل کړئ',
      loginPrefix: 'مخکې حساب لرئ؟',
      login: 'ننوتل',
      close: 'د ثبت‌نام کړکۍ بنده کړئ',
    },
  };

  $: text = copy[currentLang] || copy.fa;
  $: isRtl = currentLang !== 'en';
  $: inventoryOptions = [
    { value: 'CLASSIC', label: text.classic },
    { value: 'FIFO', label: text.fifo },
    { value: 'LIFO', label: text.lifo },
  ];
  $: inventoryMethodLabel =
    inventoryOptions.find((option) => option.value === inventoryMethod)?.label || text.classic;

  function isActiveValue(value) {
    if (value == null || value === '') return true;

    const normalized = String(value).trim().toLowerCase();

    return (
      value === true ||
      value === 1 ||
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'active'
    );
  }

  $: activeOrgTypes = (
    Array.isArray(orgTypes)
      ? orgTypes
      : []
  ).filter(
    (item) =>
      isActiveValue(item?.type_status) &&
      isActiveValue(item?.status),
  );

  function localizedOrgTypeName(item) {
    if (!item) return text.organizationTypePlaceholder;

    if (currentLang === 'en') {
      return item.name || item.name_fa || item.name_ps || item.code || '';
    }

    if (currentLang === 'ps') {
      return item.name_ps || item.name_fa || item.name || item.code || '';
    }

    return item.name_fa || item.name || item.name_ps || item.code || '';
  }

  function localizedOrgTypeSummary(item) {
    if (!item) return '';

    if (currentLang === 'en') {
      return item.summary || item.summary_fa || item.summary_ps || '';
    }

    if (currentLang === 'ps') {
      return item.summary_ps || item.summary_fa || item.summary || '';
    }

    return item.summary_fa || item.summary || item.summary_ps || '';
  }

  $: filteredOrgTypes = activeOrgTypes.filter((item) => {
    const term = orgTypeSearch.trim().toLowerCase();
    if (!term) return true;

    return [
      item.code,
      item.name,
      item.name_fa,
      item.name_ps,
      item.summary,
      item.summary_fa,
      item.summary_ps,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  /*
   * When the dropdown is closed, display the selected organization
   * type in the same field that is used for searching.
   */
  $: if (orgTypeSelected?.code && !showOrgTypeDropdown) {
    orgTypeSearch = localizedOrgTypeName(orgTypeSelected);
  }

  /*
   * Keep the old behavior: when a selected package is linked to an
   * organization type, preselect that type when the modal opens.
   * The user can still choose another active type from the dropdown.
   */
  $: {
    const packageKey = [
      packageSelected?.id || '',
      packageSelected?.org_type_id || '',
      packageSelected?.org_type_code || '',
      activeOrgTypes.length,
    ].join(':');

    if (
      packageSelected &&
      activeOrgTypes.length > 0 &&
      packageKey !== lastAutoSelectedPackageKey
    ) {
      lastAutoSelectedPackageKey = packageKey;

      const linkedType = activeOrgTypes.find(
        (item) =>
          (packageSelected.org_type_id != null &&
            Number(item.id) === Number(packageSelected.org_type_id)) ||
          (packageSelected.org_type_code &&
            String(item.code) === String(packageSelected.org_type_code)),
      );

      if (linkedType) {
        orgTypeSelected = linkedType;
        orgTypeSearch = localizedOrgTypeName(linkedType);
        orgTypeMissing = false;
      }
    }
  }

  function packageName(plan) {
    if (!plan) return text.packageFallback;
    return currentLang === 'en'
      ? plan.name
      : currentLang === 'fa'
        ? plan.name_fa
        : currentLang === 'ps' && plan.name_ps
          ? plan.name_ps
          : plan.name_fa;
  }

  function setInputState(id, isValid) {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.toggle('is-valid', isValid);
    input.classList.toggle('is-invalid', !isValid);
  }

  function selectInventoryMethod(method) {
    inventoryMethod = method;
    setInputState('inventory_method_input', ['CLASSIC', 'FIFO', 'LIFO'].includes(method));
  }

  function handleOrgTypeInput() {
    showOrgTypeDropdown = true;
    orgTypeMissing = false;

    /*
     * Editing the selected label means the user is searching again,
     * so clear the previous selection until a result is chosen.
     */
    if (
      orgTypeSelected &&
      orgTypeSearch.trim() !== localizedOrgTypeName(orgTypeSelected)
    ) {
      orgTypeSelected = null;
    }
  }

  function handleOrgTypeFocus(event) {
    showOrgTypeDropdown = true;
    orgTypeMissing = false;

    /*
     * Select the current label so typing immediately replaces it.
     */
    requestAnimationFrame(() => {
      event.currentTarget?.select?.();
    });
  }

  function handleOrgTypeBlur() {
    setTimeout(() => {
      showOrgTypeDropdown = false;

      /*
       * Accept an exact typed organization name or code.
       */
      if (!orgTypeSelected && orgTypeSearch.trim()) {
        const normalizedSearch = orgTypeSearch.trim().toLowerCase();

        const exactMatch = activeOrgTypes.find((item) => {
          return [
            item.code,
            localizedOrgTypeName(item),
            item.name,
            item.name_fa,
            item.name_ps,
          ].some(
            (value) =>
              String(value || '').trim().toLowerCase() === normalizedSearch,
          );
        });

        if (exactMatch) {
          orgTypeSelected = exactMatch;
          orgTypeSearch = localizedOrgTypeName(exactMatch);
          orgTypeMissing = false;
        }
      }

      if (orgTypeSelected?.code) {
        orgTypeSearch = localizedOrgTypeName(orgTypeSelected);
      }
    }, 180);
  }

  function handleOrgTypeKeydown(event) {
    if (event.key === 'Escape') {
      showOrgTypeDropdown = false;

      if (orgTypeSelected?.code) {
        orgTypeSearch = localizedOrgTypeName(orgTypeSelected);
      }

      event.currentTarget?.blur?.();
      return;
    }

    if (event.key === 'Enter' && showOrgTypeDropdown) {
      const firstMatch = filteredOrgTypes[0];

      if (firstMatch) {
        event.preventDefault();
        selectOrganizationType(firstMatch);
      }
    }
  }

  async function selectOrganizationType(item) {
    orgTypeSelected = item;
    orgTypeSearch = localizedOrgTypeName(item);
    showOrgTypeDropdown = false;
    orgTypeMissing = false;

    await tick();
    setInputState('organization_type_input', Boolean(orgTypeSelected?.code));
    firstInput?.focus();
  }

  function clearOrganizationType() {
    orgTypeSelected = null;
    orgTypeSearch = '';
    showOrgTypeDropdown = true;
    orgTypeMissing = false;

    tick().then(() => {
      organizationTypeInput?.focus();
    });
  }

  async function handleSubmit() {
    if (!orgTypeSelected?.code) {
      orgTypeMissing = true;

      await tick();
      const button = document.getElementById('organization_type_input');
      button?.classList.add('is-invalid');
      button?.focus();
      return;
    }

    orgTypeMissing = false;
    await onSubmit();
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  function focusableElements() {
    return Array.from(
      modalPanel?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => !element.disabled && element.offsetParent !== null);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (showOrgTypeDropdown) {
        showOrgTypeDropdown = false;

        if (orgTypeSelected?.code) {
          orgTypeSearch = localizedOrgTypeName(orgTypeSelected);
        }

        return;
      }

      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const items = focusableElements();
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(async () => {
    await tick();

    if (orgTypeSelected?.code) {
      orgTypeSearch = localizedOrgTypeName(orgTypeSelected);
      firstInput?.focus();
    } else {
      organizationTypeInput?.focus();
    }

    if (window.mdb) {
      modalPanel?.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  });
</script>

<div
  class="zeno-registration-modal"
  class:zeno-registration-modal--rtl={isRtl}
  role="presentation"
  on:click={handleOverlayClick}
  on:keydown={handleKeydown}>
  <section
    class="zeno-registration-modal__panel animate__animated animate__fadeInUp faster"
    bind:this={modalPanel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="registration-modal-title"
    dir={isRtl ? 'rtl' : 'ltr'}>
    <button type="button" class="zeno-registration-modal__close" aria-label={text.close} on:click={onClose}>
      <i class="bi bi-x-lg"></i>
    </button>

   

    <div class="zeno-registration-modal__header">
      <div class="zeno-registration-modal__package-icon zeno-registration-modal__package-icon--{packageIcon.tone}">
        <i class="bi {packageIcon.icon}"></i>
      </div>
      <div>
        <span class="zeno-registration-modal__eyebrow">{text.package}</span>
        <h3>{packageName(packageSelected)}</h3>
      </div>
    </div>

    <div class="zeno-registration-modal__intro">
      <h2 id="registration-modal-title">{text.title}</h2>
      <p>{text.subtitle}</p>
    </div>

    {#if error}
      <div class="zeno-registration-modal__error" role="alert">
        {error}
      </div>
    {/if}

    <form class="zeno-registration-modal__form" on:submit|preventDefault={handleSubmit}>
      <div class="zeno-registration-modal__field zeno-registration-modal__field--full">
        <span id="organization_type_label">{text.organizationType}</span>

        <div class="zeno-registration-modal__orgtype">
          <div
            class="zeno-registration-modal__orgtype-control"
            class:is-invalid={orgTypeMissing}>
            <i
              class="bi {orgTypeSelected?.icon || 'bi-buildings'} zeno-registration-modal__orgtype-leading"
              aria-hidden="true"></i>

            <input
              bind:this={organizationTypeInput}
              id="organization_type_input"
              class="zeno-registration-modal__orgtype-input"
              type="text"
              bind:value={orgTypeSearch}
              placeholder={text.organizationTypePlaceholder}
              autocomplete="off"
              aria-labelledby="organization_type_label"
              aria-expanded={showOrgTypeDropdown}
              aria-controls="organization_type_results"
              aria-autocomplete="list"
              on:input={handleOrgTypeInput}
              on:focus={handleOrgTypeFocus}
              on:blur={handleOrgTypeBlur}
              on:keydown={handleOrgTypeKeydown} />

            {#if orgTypeSearch}
              <button
                type="button"
                class="zeno-registration-modal__orgtype-clear"
                aria-label={text.organizationTypePlaceholder}
                title={text.organizationTypePlaceholder}
                on:mousedown|preventDefault={clearOrganizationType}>
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            {/if}

            <i
              class="bi bi-chevron-down zeno-registration-modal__orgtype-chevron"
              aria-hidden="true"></i>
          </div>

          {#if showOrgTypeDropdown}
            <div
              id="organization_type_results"
              class="zeno-registration-modal__orgtype-menu"
              role="listbox"
              aria-labelledby="organization_type_label">
              {#if filteredOrgTypes.length > 0}
                {#each filteredOrgTypes as item (item.id || item.code)}
                  <button
                    type="button"
                    class="zeno-registration-modal__orgtype-option"
                    class:active={item.id != null && orgTypeSelected?.id != null
                      ? String(item.id) === String(orgTypeSelected.id)
                      : String(item.code) === String(orgTypeSelected?.code)}
                    role="option"
                    aria-selected={item.id != null && orgTypeSelected?.id != null
                      ? String(item.id) === String(orgTypeSelected.id)
                      : String(item.code) === String(orgTypeSelected?.code)}
                    on:mousedown|preventDefault={() =>
                      selectOrganizationType(item)}>
                    <i
                      class="bi {item.icon || 'bi-building'}"
                      aria-hidden="true"></i>

                    <span class="zeno-registration-modal__orgtype-option-copy">
                      <strong>{localizedOrgTypeName(item)}</strong>

                      {#if localizedOrgTypeSummary(item)}
                        <small>{localizedOrgTypeSummary(item)}</small>
                      {/if}
                    </span>
                  </button>
                {/each}
              {:else}
                <div class="zeno-registration-modal__orgtype-empty">
                  <i class="bi bi-search" aria-hidden="true"></i>
                  <span>{text.noOrganizationTypes}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <small
          class="zeno-registration-modal__hint"
          class:text-danger={orgTypeMissing}>
          {orgTypeMissing
            ? text.organizationTypeRequired
            : text.organizationTypeHint}
        </small>
      </div>

      <label class="zeno-registration-modal__field">
        <span>{text.company}</span>
        <input
          bind:this={firstInput}
          bind:value={orgName}
          id="org_name_input"
          type="text"
          autocomplete="organization"
          on:input={() => setInputState('org_name_input', orgName.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.fullName}</span>
        <input
          bind:value={fullName}
          id="full_name_input"
          type="text"
          autocomplete="name"
          on:input={() => setInputState('full_name_input', fullName.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.phone}</span>
        <input
          bind:value={phone}
          id="phone_input"
          type="tel"
          autocomplete="tel"
          on:input={() => setInputState('phone_input', phone.trim().length > 0)} />
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.username}</span>
        <input
          bind:value={username}
          id="username_input"
          type="text"
          autocomplete="username"
          on:input={() => setInputState('username_input', username.trim().length >= 4 && username.indexOf(' ') === -1)} />
      </label>

      <div class="zeno-registration-modal__field zeno-registration-modal__field--full">
        <span id="inventory_method_label">{text.inventoryMethod}</span>
        <div class="dropdown zeno-registration-modal__dropdown">
          <button
            id="inventory_method_input"
            class="zeno-registration-modal__dropdown-btn dropdown-toggle hidden-arrow"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            aria-haspopup="listbox"
            aria-labelledby="inventory_method_label"
            aria-label={text.inventoryMethod}>
            <i class="bi bi-layers" aria-hidden="true"></i>
            <span>{inventoryMethodLabel}</span>
            <i class="bi bi-chevron-down zeno-registration-modal__dropdown-chevron" aria-hidden="true"></i>
          </button>
          <ul
            class="dropdown-menu shadow-sm border-0 rounded-3"
            role="listbox"
            aria-labelledby="inventory_method_label">
            {#each inventoryOptions as option (option.value)}
              <li role="none">
                <button
                  class="dropdown-item rounded-2 {option.value === inventoryMethod ? 'active' : ''}"
                  type="button"
                  role="option"
                  aria-selected={option.value === inventoryMethod}
                  on:click={() => selectInventoryMethod(option.value)}>
                  {option.label}
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <small class="zeno-registration-modal__hint">{text.inventoryHint}</small>
      </div>

      <label class="zeno-registration-modal__field">
        <span>{text.password}</span>
        <div class="zeno-registration-modal__password">
          <input
            bind:value={password}
            id="password_input"
            type={showPassword ? 'text' : 'password'}
            autocomplete="new-password"
            on:input={() => setInputState('password_input', password.length >= 6)} />
          <button type="button" on:click={() => (showPassword = !showPassword)} aria-label={text.password}>
            <i class="bi {showPassword ? 'bi-eye-slash' : 'bi-eye'}"></i>
          </button>
        </div>
      </label>

      <label class="zeno-registration-modal__field">
        <span>{text.confirmPassword}</span>
        <div class="zeno-registration-modal__password">
          <input
            bind:value={confirmPassword}
            id="confirm_password_input"
            type={showConfirmPassword ? 'text' : 'password'}
            autocomplete="new-password"
            on:input={() => setInputState('confirm_password_input', confirmPassword.length > 0 && confirmPassword === password)} />
          <button type="button" on:click={() => (showConfirmPassword = !showConfirmPassword)} aria-label={text.confirmPassword}>
            <i class="bi {showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}"></i>
          </button>
        </div>
      </label>

      <button type="submit" class="zeno-registration-modal__submit" disabled={registering}>
        {#if registering}
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        {:else}
          {text.submit}
        {/if}
      </button>
    </form>

    <p class="zeno-registration-modal__login">
      <span>{text.loginPrefix}</span>
      <button type="button" on:click={onLogin}>{text.login}</button>
    </p>
  </section>
</div>

<style>
  /*
   * Organization type direct-search control.
   * The rest of the modal keeps using the existing home-landing.css.
   */
  .zeno-registration-modal__orgtype {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .zeno-registration-modal__orgtype-control {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 3rem;
    overflow: hidden;
    border: 1px solid #d9e2f0;
    border-radius: 1rem;
    background: #ffffff;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease;
  }

  .zeno-registration-modal__orgtype-control:hover {
    border-color: #bfd0e7;
  }

  .zeno-registration-modal__orgtype-control:focus-within {
    border-color: #7aa7ff;
    box-shadow: 0 0 0 0.2rem rgba(47, 111, 237, 0.1);
  }

  .zeno-registration-modal__orgtype-control.is-invalid {
    border-color: #dc3545;
    box-shadow: 0 0 0 0.18rem rgba(220, 53, 69, 0.08);
  }

  .zeno-registration-modal__orgtype-leading {
    display: inline-grid;
    flex: 0 0 2.75rem;
    width: 2.75rem;
    height: 100%;
    min-height: 3rem;
    place-items: center;
    color: #64748b;
    font-size: 0.95rem;
    pointer-events: none;
  }

  .zeno-registration-modal__orgtype-input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 3rem;
    padding: 0.75rem 0.25rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #0f172a;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 650;
    box-shadow: none;
  }

  .zeno-registration-modal__orgtype-input::placeholder {
    color: #94a3b8;
    font-weight: 500;
    opacity: 1;
  }

  .zeno-registration-modal__orgtype-clear {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 0.55rem;
    background: transparent;
    color: #94a3b8;
    font-size: 0.7rem;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .zeno-registration-modal__orgtype-clear:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .zeno-registration-modal__orgtype-chevron {
    flex: 0 0 auto;
    padding-inline: 0.45rem 0.9rem;
    color: #94a3b8;
    font-size: 0.75rem;
    pointer-events: none;
  }

  .zeno-registration-modal__orgtype-menu {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 0.45rem);
    z-index: 60;
    width: 100%;
    max-height: 18rem;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0.4rem;
    border: 1px solid #dbe4f0;
    border-radius: 1rem;
    background: #ffffff;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14);
    scrollbar-width: thin;
    scrollbar-color: #c7d2e1 transparent;
  }

  .zeno-registration-modal__orgtype-menu::-webkit-scrollbar {
    width: 0.4rem;
  }

  .zeno-registration-modal__orgtype-menu::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #c7d2e1;
  }

  .zeno-registration-modal__orgtype-option {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    width: 100%;
    min-width: 0;
    padding: 0.7rem 0.75rem;
    border: 0;
    border-radius: 0.85rem;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .zeno-registration-modal__orgtype-option:hover,
  .zeno-registration-modal__orgtype-option:focus-visible {
    outline: 0;
    background: #f6f9fd;
  }

  .zeno-registration-modal__orgtype-option.active {
    background: #eef4ff;
  }

  .zeno-registration-modal__orgtype-option > i {
    flex: 0 0 1.4rem;
    margin-top: 0.15rem;
    color: #475569;
    font-size: 0.9rem;
    text-align: center;
  }

  .zeno-registration-modal__orgtype-option.active > i {
    color: #2f6fed;
  }

  .zeno-registration-modal__orgtype-option-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.2rem;
  }

  .zeno-registration-modal__orgtype-option-copy strong {
    overflow: hidden;
    color: #0f172a;
    font-size: 0.86rem;
    font-weight: 800;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zeno-registration-modal__orgtype-option-copy small {
    display: -webkit-box;
    overflow: hidden;
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 500;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .zeno-registration-modal__orgtype-empty {
    display: grid;
    min-height: 8rem;
    place-items: center;
    align-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: #94a3b8;
    font-size: 0.82rem;
    font-weight: 650;
    text-align: center;
  }

  .zeno-registration-modal__orgtype-empty i {
    font-size: 1rem;
  }

  :global(html[dir='rtl']) .zeno-registration-modal__orgtype-input {
    text-align: right;
  }

  :global(html[dir='ltr']) .zeno-registration-modal__orgtype-input {
    text-align: left;
  }

  /*
   * The registration modal is intentionally light-only, even when the rest
   * of the app runs in dark mode: every field here follows the landing page
   * styling. Global dark rules from app.css (.dropdown-menu, .dropdown-item,
   * .text-danger) use !important, so they have to be neutralised explicitly.
   */
  :global(html.dark) .zeno-registration-modal .dropdown-menu {
    border-color: #dbe4f0 !important;
    background: #ffffff !important;
    color: #0f172a !important;
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.14) !important;
  }

  :global(html.dark) .zeno-registration-modal .dropdown-item {
    color: #334155 !important;
  }

  :global(html.dark) .zeno-registration-modal .dropdown-item:hover,
  :global(html.dark) .zeno-registration-modal .dropdown-item:focus {
    background: #f6f9fd !important;
    color: #1d4ed8 !important;
  }

  :global(html.dark) .zeno-registration-modal .dropdown-item.active,
  :global(html.dark) .zeno-registration-modal .dropdown-item:active {
    background: #eef4ff !important;
    color: #2f6fed !important;
  }

  :global(html.dark) .zeno-registration-modal label,
  :global(html.dark) .zeno-registration-modal .zeno-registration-modal__field {
    color: var(--z-text, #0f172a) !important;
  }

  :global(html.dark) .zeno-registration-modal small:not(.text-danger) {
    color: var(--z-muted, #64748b) !important;
  }

  :global(html.dark)
    .zeno-registration-modal__field
    .zeno-registration-modal__hint.text-danger {
    color: #dc3545 !important;
  }

  @media (max-width: 575.98px) {
    .zeno-registration-modal__orgtype-menu {
      max-height: 14rem;
    }
  }
</style>
