<script>
  import { logoutClear } from '../auth/authService';
  import { register, validateRegister } from '../auth/authService';

  import { onMount, onDestroy } from 'svelte';
  import 'animate.css';
  import { t, lang, setLanguage, isRTL, supported, translate_org_type } from '../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { push } from 'svelte-spa-router';
  import { auth } from '../auth/authStore';

  import { API_URL } from '../config';
  import './home-landing.css';
  import Navbar from './home/Navbar.svelte';
  import Hero from './home/Hero.svelte';
  import Features from './home/Features.svelte';
  import Pricing from './home/Pricing.svelte';
  import RegistrationModal from './home/RegistrationModal.svelte';
  import Footer from './home/Footer.svelte';

  const HERO_IMAGE = '/img/zeno-hero-dashboard.png';

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const featureCards = [
    {
      icon: 'bi-box-seam',
      color: 'blue',
      title: { en: 'Inventory Management', fa: 'مدیریت انبار', ps: 'د ذخیرې مدیریت' },
      desc: {
        en: 'Track stock, warehouses, product movement, and inventory alerts in real time.',
        fa: 'موجودی، انبارها، حرکت محصولات و هشدارهای ذخیره را لحظه‌ای کنترل کنید.',
        ps: 'ذخیره، ګدامونه، د محصول حرکت او خبرتیاوې په ریښتیني وخت کې وڅارئ.',
      },
    },
    {
      icon: 'bi-basket',
      color: 'green',
      title: { en: 'Sales System', fa: 'سیستم فروش', ps: 'د پلور سیستم' },
      desc: {
        en: 'Create invoices, manage customers, and keep daily sales moving fast.',
        fa: 'فاکتور صادر کنید، مشتریان را مدیریت کنید و فروش روزانه را سریع پیش ببرید.',
        ps: 'رسیدونه جوړ کړئ، پیرودونکي مدیریت کړئ او ورځنی پلور چټک کړئ.',
      },
    },
    {
      icon: 'bi-cart3',
      color: 'purple',
      title: { en: 'Purchase System', fa: 'سیستم خرید', ps: 'د پیرود سیستم' },
      desc: {
        en: 'Control suppliers, purchase orders, costs, and procurement workflows.',
        fa: 'تامین‌کنندگان، سفارش خرید، هزینه‌ها و جریان تدارکات را کنترل کنید.',
        ps: 'عرضه کوونکي، د پیرود امرونه، لګښتونه او تدارکات کنټرول کړئ.',
      },
    },
    {
      icon: 'bi-wallet2',
      color: 'orange',
      title: { en: 'Accounting', fa: 'حسابداری', ps: 'حسابدارۍ' },
      desc: {
        en: 'Manage accounts, payments, journals, balances, and financial records.',
        fa: 'حساب‌ها، پرداخت‌ها، ژورنال‌ها، بیلانس و اسناد مالی را مدیریت کنید.',
        ps: 'حسابونه، تادیات، ژورنالونه، بیلانس او مالي اسناد مدیریت کړئ.',
      },
    },
    {
      icon: 'bi-pie-chart',
      color: 'teal',
      title: { en: 'Reports & Analytics', fa: 'گزارش‌ها و تحلیل', ps: 'راپورونه او تحلیل' },
      desc: {
        en: 'See business performance clearly with dashboards and decision-ready reports.',
        fa: 'عملکرد کسب‌وکار را با داشبوردها و گزارش‌های آماده تصمیم‌گیری ببینید.',
        ps: 'د کاروبار فعالیت په ډشبورډونو او چمتو راپورونو کې روښانه وګورئ.',
      },
    },
    {
      icon: 'bi-people',
      color: 'pink',
      title: { en: 'Multi-user Access', fa: 'دسترسی چندکاربره', ps: 'څو کاروونکي لاسرسی' },
      desc: {
        en: 'Give every team member the right roles, permissions, and secure access.',
        fa: 'برای هر عضو تیم نقش، سطح دسترسی و ورود امن مناسب تعریف کنید.',
        ps: 'هر ټیم غړي ته سم رول، اجازه او خوندي لاسرسی ورکړئ.',
      },
    },
  ];

  function featureText(obj, lang) {
    return obj[lang] || obj.fa || obj.en;
  }

  let activeNav = 'home';

  function planDesc(plan, lang) {
    const raw =
      lang === 'en'
        ? plan.description
        : lang === 'ps' && plan.description_ps
          ? plan.description_ps
          : plan.description_fa;
    if (!raw) return '';
    return raw.trim();
  }

  function planDescLines(plan, lang) {
    const raw = planDesc(plan, lang);
    if (!raw) return [];
    return raw.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  function getPlanIcon(plan, index) {
    if (plan.color === 'popular') return { icon: 'bi-briefcase-fill', tone: 'primary' };
    const map = [
      { icon: 'bi-gift', tone: 'gray' },
      { icon: 'bi-layers-fill', tone: 'blue' },
      { icon: 'bi-briefcase-fill', tone: 'primary' },
      { icon: 'bi-building', tone: 'purple' },
    ];
    return map[index % map.length];
  }

  function planFeatureName(feature) {
    return _lang === 'en'
      ? feature.name
      : _lang === 'fa'
        ? feature.name_fa
        : _lang === 'ps' && feature.name_ps
          ? feature.name_ps
          : feature.name_fa;
  }

  function planFeatureValueText(feature) {
    if (feature.value == 'true') return t(feature.unit);
    if (feature.value == 'false') return t(feature.unit);

    const val = feature.value;
    const unit = feature.unit ? t(feature.unit) : '';

    if (val === 'null' || val === null || val === '' || String(val).toLowerCase() === 'unlimited') {
      return unit && unit !== 'null' ? unit : t('Unlimited');
    }

    if (unit && unit !== 'null') return `${val} ${unit}`;
    return String(val);
  }

  let shiftPressed = false;
  let ctrlPressed = false;

  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  import { app_version } from '../config.js';

  let registering = false;

  // Ensure initial sync runs once after a successful login. Also start/stop auto-sync
  // according to authentication state.
  let isAuthenticated = false;

  $: if ($auth && $auth.isAuthenticated) {
    push('/dashboard');
    isAuthenticated = true;
  } else {
    isAuthenticated = false;
  }

  let phone = '';
  let org_name = '';
  let full_name = '';
  let username = '';
  let email = '';
  let password = '';
  let confirm_password = '';
  let inventory_method = 'CLASSIC';

  let error = '';
  // const features = [
  //   { icon: 'bi-box', title: 'مدیریت انبار', desc: 'مدیریت موجودی و کنترل دقیق کالاها' },
  //   { icon: 'bi-currency-dollar', title: 'مدیریت مالی', desc: 'کنترل حساب‌ها و گزارشات مالی' },
  //   { icon: 'bi-people', title: 'مدیریت کاربران', desc: 'نقش‌ها  برای سازماندهی کاربران' },
  //   { icon: 'bi-graph-up', title: 'گزارشات', desc: 'تحلیل کامل عملکرد کسب‌وکار' },
  //   { icon: 'bi-gear', title: 'تنظیمات', desc: 'پیکربندی کامل سیستم' },
  //   { icon: 'bi-phone', title: 'پشتیبانی', desc: 'دسترسی سریع به کمک و پشتیبانی' },
  // ];
  // <script>

  let phase = 'enter'; // enter | exit
  let resetKey = 0;
  let timer;

  let currentLang = localStorage.getItem('lang') || 'fa';

  $: currentLangLabel = supported.find((s) => s.code === currentLang)?.label || 'دری';

  function changeLanguage(code) {
    setLanguage(code);
    currentLang = code;
    const shouldRtl = isRTL(code);
    document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
    const mdbCss = document.getElementById('mdb-css');
    const mdbRtlCss = document.getElementById('mdb-rtl-css');
    if (mdbCss && mdbRtlCss) {
      mdbCss.disabled = shouldRtl;
      mdbRtlCss.disabled = !shouldRtl;
    }
    localStorage.setItem('lang', code);
  }

  function navigateLanding(id) {
    activeNav = id;
    scrollToSection(id === 'home' ? 'top' : id);
  }

  function findOrganizationTypeForPlan(plan) {
    if (!plan || !Array.isArray(org_types)) return null;

    return (
      org_types.find(
        (organizationType) =>
          (plan.org_type_id != null &&
            Number(organizationType.id) === Number(plan.org_type_id)) ||
          (plan.org_type_code &&
            String(organizationType.code) === String(plan.org_type_code)),
      ) || null
    );
  }

  function selectPlan(plan) {
    packageSelected = plan;
    orgTypeSelected = findOrganizationTypeForPlan(plan);
    showRegistrationModal = true;
    error = '';

    setTimeout(() => {
      if (!window.mdb) return;

      document.querySelectorAll('[data-mdb-input-init]').forEach((element) => {
        new window.mdb.Input(element);
      });

      document.querySelectorAll('.dropdown-toggle').forEach((element) => {
        const existing = window.mdb.Dropdown.getInstance?.(element);
        existing?.dispose?.();
        new window.mdb.Dropdown(element);
      });
    }, 100);
  }

  let orgTypeSelected = null;
  let packageSelected = null;
  let showRegistrationModal = false;

  $: selectedPackageIcon = packageSelected
    ? getPlanIcon(
        packageSelected,
        subscription_plans?.findIndex((plan) => plan.id === packageSelected.id) ?? 0,
      )
    : { icon: 'bi-gift', tone: 'blue' };

  function openRegistrationModal() {
    if (!packageSelected && subscription_plans?.length) {
      selectPlan(subscription_plans[0]);
      return;
    }

    if (!packageSelected) {
      packageSelected = { id: 1, name: 'Demo', name_fa: 'دمو', name_ps: 'ډیمو', org_type_id: null };
    }

    showRegistrationModal = true;
    error = '';
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }

  function closeRegistrationModal() {
    showRegistrationModal = false;
    error = '';
  }

  function startSequence() {
    phase = 'enter';
    clearTimeout(timer);
    // timer = setTimeout(() => {
    //   phase = 'exit';
    // }, 7000); // 7 seconds then exit
  }

  function resetAnimations() {
    phase = 'enter';
    resetKey++; // force DOM re-render → animation restart
    startSequence();

    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  }

  function handleKey(e) {
    // if (e.code === 'Space') {
    //   e.preventDefault();
    //   resetAnimations();
    // }
    // if (e.code === 'Enter') {
    //   e.preventDefault();
    //   phase = 'exit';
    // }
  }

  async function selectOrgType(type) {
    orgTypeSelected = type;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  }

  async function handleRegister() {
    error = '';

    if (!orgTypeSelected?.code) {
      error =
        currentLang === 'en'
          ? 'Please select an organization type'
          : currentLang === 'ps'
            ? 'مهرباني وکړئ د سازمان ډول وټاکئ'
            : 'لطفاً نوع سازمان را انتخاب کنید';

      const organizationTypeInput = document.getElementById(
        'organization_type_input',
      );

      organizationTypeInput?.classList.add('is-invalid');
      organizationTypeInput?.focus();
      return;
    }

    if (!org_name.trim()) {
      error = t('Organization Name is required');
      document.getElementById('org_name_input').focus();
      document.getElementById('org_name_input').classList.add('is-invalid');
      return;
    }
    if (!full_name.trim()) {
      error = currentLang === 'en' ? 'Full Name is required' : currentLang === 'ps' ? 'بشپړ نوم اړین دی' : 'نام کامل الزامی است';
      document.getElementById('full_name_input').focus();
      document.getElementById('full_name_input').classList.add('is-invalid');
      return;
    }
    if (!phone.trim()) {
      error = t('Phone is required');
      document.getElementById('phone_input').focus();
      document.getElementById('phone_input').classList.add('is-invalid');
      return;
    }
    // if (!email.trim()) {
    //   error = t('Email is required');
    //   document.getElementById('email_input').focus();
    //   document.getElementById('email_input').classList.add('is-invalid');
    //   return;
    // }
    if (!username.trim()) {
      error = t('Username is required');
      document.getElementById('username_input').focus();
      document.getElementById('username_input').classList.add('is-invalid');
      return;
    }

    if (username.length < 4) {
      error = t('Username must be at least 4 characters');
      return;
    }

    if (username.indexOf(' ') !== -1) {
      error = t('Username cannot contain spaces');
      return;
    }

    if (!password) {
      error = t('Password is required');
      document.getElementById('password_input').focus();
      document.getElementById('password_input').classList.add('is-invalid');
      return;
    }
    if (password.length < 6) {
      error = t('Password must be at least 6 characters');
      return;
    }
    if (confirm_password !== password) {
      error =
        currentLang === 'en'
          ? 'Passwords do not match'
          : currentLang === 'ps'
            ? 'پټ نومونه سره برابر نه دي'
            : 'رمز عبور و تکرار آن یکسان نیست';
      document.getElementById('confirm_password_input').focus();
      document.getElementById('confirm_password_input').classList.add('is-invalid');
      return;
    }

    if (!['CLASSIC', 'FIFO', 'LIFO'].includes(inventory_method)) {
      error =
        currentLang === 'en'
          ? 'Please select an inventory method'
          : currentLang === 'ps'
            ? 'مهرباني وکړئ د ذخیرې طریقه وټاکئ'
            : 'لطفاً روش موجودی انبار را انتخاب کنید';
      document.getElementById('inventory_method_input')?.focus();
      return;
    }

    let validRegister = await validateRegister(username, email);
    console.log('validRegister', validRegister);

    // if (!validRegister.validEmail) {
    //   console.log('Email already in use');
    //   error = t('Email address already in use');
    //   document.getElementById('email_input').focus();
    //   document.getElementById('email_input').classList.add('is-invalid');
    //   return;
    // }

    if (!validRegister.validUsername) {
      console.log('Username already taken');
      error = t('Username is already taken');
      document.getElementById('username_input').focus();
      document.getElementById('username_input').classList.add('is-invalid');
      return;
    }
    try {
      await register({
        org_name,
        full_name,
        username,
        email,
        password,
        phone,
        language: currentLang,
        theme: currentTheme,
        type: orgTypeSelected.code,
        plan_id: packageSelected?.id || 1,
        inventory_method,
      });
      selectOrgType(null);
      push('/dashboard');
    } catch (err) {
      error = err.message;
    }
  }

  let subscription_plans = null;
  let subscription_plan_features = [];
  let features = [];
  let org_types = [];

  let expandedPlans = {};

  function showAllPlanFeatures() {
    expandedPlans = Object.fromEntries(
      (subscription_plans ?? []).map((plan) => [plan.id, true]),
    );
  }

  function planHasMoreFeatures(plan) {
    if (expandedPlans[plan.id]) return false;
    return (plan.features?.length ?? 0) > 0;
  }

  let currentTheme = 'light';

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    startSequence();
    window.addEventListener('keydown', handleKey);

    try {
      const lang = localStorage.getItem('lang') || 'fa';
      setLanguage(lang);
      const shouldRtl = isRTL(lang);
      document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
      const mdbCss = document.getElementById('mdb-css');
      const mdbRtlCss = document.getElementById('mdb-rtl-css');
      if (mdbCss && mdbRtlCss) {
        mdbCss['disabled'] = shouldRtl;
        mdbRtlCss['disabled'] = !shouldRtl;
      }
    } catch {}

    try {
      const theme = localStorage.getItem('theme') || 'light';
      currentTheme = theme;
      document.documentElement.dataset.mdbTheme = theme;
    } catch {}

    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);

    fetch(API_URL + '/api/v2/system/info')
      .then(async (response) => {
        if (!response.ok) {
          const responseText = await response.text();

          throw new Error(
            `Failed to load registration information: ${response.status} ${responseText}`,
          );
        }

        return response.json();
      })
      .then((responsePayload) => {
        /*
         * Support both response shapes:
         *
         * { org_types: [...] }
         * { data: { org_types: [...] } }
         */
        const data =
          responsePayload?.data &&
          typeof responsePayload.data === 'object' &&
          !Array.isArray(responsePayload.data)
            ? responsePayload.data
            : responsePayload;

        console.log('Registration API response:', data);

        subscription_plans = Array.isArray(data?.subscription_plans)
          ? data.subscription_plans
          : [];

        features = Array.isArray(data?.features)
          ? data.features
          : [];

        subscription_plan_features = Array.isArray(
          data?.subscription_plan_features,
        )
          ? data.subscription_plan_features
          : [];

        const receivedOrganizationTypes =
          data?.org_types ??
          data?.organization_types ??
          data?.orgTypes ??
          [];

        org_types = Array.isArray(receivedOrganizationTypes)
          ? receivedOrganizationTypes
          : [];

        console.log('Loaded organization types:', org_types);
        console.log(
          'Loaded active organization types:',
          org_types.filter((item) => {
            const typeStatus = String(
              item?.type_status ?? 'active',
            ).toLowerCase();

            const status = String(
              item?.status ?? '1',
            ).toLowerCase();

            return (
              ['active', '1', 'true'].includes(typeStatus) &&
              ['active', '1', 'true'].includes(status)
            );
          }),
        );

        subscription_plans = subscription_plans.map((plan) => {
          const planFeatures = subscription_plan_features
            .filter(
              (item) =>
                Number(item.plan_id) === Number(plan.id) &&
                Number(item.status) === 1,
            )
            .map((item) => {
              const feature = features.find(
                (featureItem) =>
                  Number(featureItem.id) === Number(item.feature_id) &&
                  Number(featureItem.status) === 1,
              );

              if (!feature) return null;

              return {
                ...feature,
                value: item.value,
                unit: item.unit,
              };
            })
            .filter(Boolean);

          return {
            ...plan,
            features: planFeatures,
          };
        });

        /*
         * A plan may have been selected before the API response arrived.
         * Resolve its organization type after org_types is populated.
         */
        if (packageSelected) {
          const linkedOrganizationType =
            findOrganizationTypeForPlan(packageSelected);

          if (linkedOrganizationType) {
            orgTypeSelected = linkedOrganizationType;
          }
        }

        console.log('Subscription plans:', subscription_plans);
      })
      .catch((err) => {
        console.error('Error getting registration information:', err);

        subscription_plans = [];
        subscription_plan_features = [];
        features = [];
        org_types = [];
      });
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  let forVideo = false;
  /// scroll system
</script>

{#key resetKey}
  <div class="zeno-landing" id="top" style={forVideo ? 'padding-top:100px' : ''}>
    <Navbar
      {currentLang}
      {currentLangLabel}
      {supported}
      {activeNav}
      {isAuthenticated}
      {forVideo}
      onNavigate={navigateLanding}
      onLogin={() => push('/login')}
      onDashboard={() => push('/dashboard')}
      onToggleFullscreen={toggleFullscreen}
      onLanguageSelect={changeLanguage} />

    <Hero
      {currentLang}
      {phase}
      {forVideo}
      {orgTypeSelected}
      {shiftPressed}
      {ctrlPressed}
      appVersion={app_version}
      heroImage={HERO_IMAGE}
      onStartFree={openRegistrationModal}
      onLogoutClear={logoutClear} />

    <Features
      {currentLang}
      {featureCards}
      {featureText}
      onOpenPricing={() => scrollToSection('pricing')} />

    <Pricing
      {currentLang}
      subscriptionPlans={subscription_plans}
      {expandedPlans}
      {planDescLines}
      {getPlanIcon}
      {planFeatureName}
      {planFeatureValueText}
      {planHasMoreFeatures}
      {showAllPlanFeatures}
      onSelectPlan={selectPlan} />

    {#if showRegistrationModal}
      <RegistrationModal
        {currentLang}
        {packageSelected}
        packageIcon={selectedPackageIcon}
        {registering}
        {error}
        orgTypes={org_types}
        bind:orgTypeSelected
        bind:orgName={org_name}
        bind:fullName={full_name}
        bind:phone
        bind:username
        bind:password
        bind:confirmPassword={confirm_password}
        bind:inventoryMethod={inventory_method}
        onClose={closeRegistrationModal}
        onLogin={() => push('/login')}
        onSubmit={async () => {
          registering = true;

          try {
            await handleRegister();
          } finally {
            registering = false;
          }
        }} />
    {/if}

  <Footer {currentLang} />
  </div>
{/key}