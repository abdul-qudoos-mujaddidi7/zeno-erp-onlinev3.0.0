<script>
  
  import { logoutClear } from '../auth/authService';
  import { register, validateRegister } from '../auth/authService';

  import { onMount, onDestroy } from 'svelte';
  import 'animate.css';
  import { t, lang, setLanguage, isRTL, supported,translate_org_type } from '../i18n/i18n';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { push } from 'svelte-spa-router';
  import { auth } from '../auth/authStore';

  import {allOrgTypes,orgTypes,comming_soon} from './OrgTypes';



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
  let username = '';
  let email = '';
  let password = '';

  let error = '';
  const features = [
    { icon: 'bi-box', title: 'مدیریت انبار', desc: 'مدیریت موجودی و کنترل دقیق کالاها' },
    { icon: 'bi-currency-dollar', title: 'مدیریت مالی', desc: 'کنترل حساب‌ها و گزارشات مالی' },
    { icon: 'bi-people', title: 'مدیریت کاربران', desc: 'نقش‌ها  برای سازماندهی کاربران' },
    { icon: 'bi-graph-up', title: 'گزارشات', desc: 'تحلیل کامل عملکرد کسب‌وکار' },
    { icon: 'bi-gear', title: 'تنظیمات', desc: 'پیکربندی کامل سیستم' },
    { icon: 'bi-phone', title: 'پشتیبانی', desc: 'دسترسی سریع به کمک و پشتیبانی' },
  ];
  // <script>

  let phase = 'enter'; // enter | exit
  let resetKey = 0;
  let timer;

  let currentLang = localStorage.getItem('lang') || 'fa';

  let orgTypeSelected = null;


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

  function validateEmailType(email) {
    // Simple email regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleRegister() {
    error = '';
    if (!org_name.trim()) {
      error = t('Organization Name is required');
      document.getElementById('org_name_input').focus();
      document.getElementById('org_name_input').classList.add('is-invalid');
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
    // if (!validateEmailType(email)) {
    //   error = t('Invalid email address');
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
        username,
        email,
        password,
        phone,
        language: currentLang,
        theme: currentTheme,
        type: allOrgTypes.find((o) => o.id === orgTypeSelected)?.id || 'standard',
      });
      selectOrgType(null);
      push('/dashboard');
    } catch (err) {
      error = err.message;
    }
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

  let showPassword = false;
  function togglePassword() {
    showPassword = !showPassword;
  }


  let forVideo = false;

  /// scroll system


</script>

{#key resetKey}
  <div class="container" style="{forVideo?"padding-top:100px":""}">
    <div class="my-3 d-flex justify-content-start gap-2  {forVideo?"d-none":""}">
      {#if isAuthenticated}
        <button class="btn btn-primary" style="z-index: 999;" on:click={() => push('/dashboard')}>
          <i class="bi bi-speedometer2"></i>
          {t('Dashboard')}
        </button>
      {:else}
        <button class="btn btn-primary" style="z-index: 999;" on:click={() => push('/login')}>
          <i class="bi bi-box-arrow-in-right"></i>
          {t('Login')}
        </button>
      {/if}

      {#if orgTypeSelected}
        <!-- <p
          class="animate__animated {phase === 'enter'
            ? 'animate__backInDown animate__delay-0s'
            : 'animate__fadeOutUp faster'}">
    </p> -->
      {/if}

      <button
        id="showUnitDropdown"
        class="btn btn-outline-primary px-2 dropdown-toggle "
        type="button"
        data-mdb-toggle="dropdown"
        aria-expanded="false">
        <i class="bi bi-globe"></i>
      </button>

      <button class="btn btn-outline-primary px-2" on:click={toggleFullscreen} title="Fullscreen">
        <i class="bi bi-arrows-fullscreen"></i>
      </button>

      <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
        {#each supported as s}
          <li>
            <button
              class="dropdown-item {s.code === currentLang ? 'bg-primary text-white' : ''}"
              on:click={() => {
                setLanguage(s.code);
                const shouldRtl = isRTL(s.code);
                document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';

                const mdbCss = document.getElementById('mdb-css');
                const mdbRtlCss = document.getElementById('mdb-rtl-css');

                if (mdbCss && mdbRtlCss) {
                  mdbCss.disabled = shouldRtl;
                  mdbRtlCss.disabled = !shouldRtl;
                }

                localStorage.setItem('lang', s.code);
              }}
              type="button">
              {s.label}
            </button>
          </li>
        {/each}
      </ul>
    </div>
    <!-- HERO -->

    <div class="hero text-center">
      {#if !orgTypeSelected}
      <div
          class="logo d-none d-md-block text-primary gradient-text animate__animated {phase === 'enter'
            ? 'animate__jackInTheBox  animate__delay-0s'
            : 'animate__fadeOutTopRight faster'}"
          style="line-height:110px">
          <img src='/img/logo.png' height="100" />
        </div>
         <div
          class="logo  d-block d-md-none mt-4 text-primary gradient-text animate__animated {phase === 'enter'
            ? 'animate__jackInTheBox  animate__delay-0s'
            : 'animate__fadeOutTopRight faster'}"
          style="line-height:110px">
          <img src='/img/logo.png' height="80" />
        </div>
        <!-- <div
          class="logo text-primary gradient-text animate__animated {phase === 'enter'
            ? 'animate__backInUp  animate__delay-1s faster'
            : 'animate__fadeOutTopRight faster'}"
          style="line-height:110px">
          <i class="bi bi-rocket-takeoff"></i>
        </div>
        {#if currentLang == 'en' || true}
          <h1
            class="title-en animate__animated {phase === 'enter'
              ? 'animate__lightSpeedInLeft animate__delay-0.5s'
              : 'animate__fadeOutUp faster'} m-0"
            style="">
            <span class="text-primary gradient-text">ZENO</span><span style="font-weight: 900;">ERP</span>
          </h1>
        {/if}
 -->
        {#if currentLang != 'en'}
          <h1
            class="title animate__animated {phase === 'enter'
              ? 'animate__lightSpeedInRight faster animate__delay-0.5s'
              : 'animate__fadeOutUp faster'} m-0 mb-5 mb-sm-3 mb-xxl-4">
            <span class="text-primary gradient-text">زینو</span> <span style="font-weight: 900">ای‌ آر‌ پی</span>
          </h1>
        {/if}
      {:else}{/if}

      {#if shiftPressed&&ctrlPressed}

        <div
          class="subtitle">
          {app_version}
        </div>
          <button class="btn btn-outline-danger my-3" on:click={logoutClear}>
            {t('Logout Clear')}
          </button>
      {/if}
      {#if !orgTypeSelected}
        <div
          class="subtitle animate__animated mb-5 mb-sm-4 mb-xxl-4 {phase === 'enter'
            ? 'animate__flipInX animate__delay-1s'
            : 'animate__flipOutX faster'}">
            {#if forVideo}
              دیتابیس مدیریتی برای هر نوع شرکت
            {:else}
          {currentLang === 'en' ? 'Select your business type' : 'نوع شرکت خود را انتخاب کنید'}
          {/if}
        </div>
      {/if}
    </div>
    {#if orgTypeSelected}
      <div class="row my-4">
        <div class="col-md-6 mx-auto">
          <div
            class="card animate__animated shadow
  {phase === 'enter' ? 'animate__bounceIn' : 'animate__fadeOutDown faster'}"
            style="animation-delay: 0s">
            <div class="card-body text-center">
              <div class="mb-2"><small class="text-dark"><i class="bi bi-person-plus"></i> {t('Register')}</small></div>
              <div class="icon-wrapper mb-3 bg-primary">
                <i class={`bi ${allOrgTypes.find((o) => o.id === orgTypeSelected)?.icon}`}></i>
              </div>
              <h4 class="alert-heading">
                {currentLang === 'en'
                  ? allOrgTypes.find((o) => o.id === orgTypeSelected)?.name_en
                  : allOrgTypes.find((o) => o.id === orgTypeSelected)?.name}
              </h4>
              <p>
                {currentLang === 'en'
                  ? allOrgTypes.find((o) => o.id === orgTypeSelected)?.description_en
                  : allOrgTypes.find((o) => o.id === orgTypeSelected)?.description}
              </p>

              {#if error}
                <div class="alert alert-danger text-center py-2">
                  {error}
                </div>
              {/if}
              <div class="row g-3">
                <div class="col-md-6">
                  <div data-mdb-input-init class="form-outline">
                    <input
                      type="text"
                      id="org_name_input"
                      class="form-control mb-0"
                      bind:value={org_name}
                      on:input={(e) => {
                        org_name = e.target.value;
                        if (org_name.trim()) {
                          document.getElementById('org_name_input').classList.remove('is-invalid');
                          document.getElementById('org_name_input').classList.add('is-valid');
                        } else {
                          document.getElementById('org_name_input').classList.add('is-invalid');
                          document.getElementById('org_name_input').classList.remove('is-valid');
                        }
                      }} />
                    <label class="form-label" for="org_name_input"
                      >{t('Name')}
                      {currentLang === 'en' ? 'of' : ''}
                      {currentLang === 'en'
                        ? allOrgTypes.find((o) => o.id === orgTypeSelected)?.name_en
                        : allOrgTypes.find((o) => o.id === orgTypeSelected)?.name}</label>
                  </div>
                </div>

                <div class="col-md-6">
                  <div data-mdb-input-init class="form-outline">
                    <input
                      type="text"
                      id="phone_input"
                      class="form-control mb-0"
                      bind:value={phone}
                      on:input={(e) => {
                        phone = e.target.value;
                        if (phone.trim()) {
                          document.getElementById('phone_input').classList.remove('is-invalid');
                          document.getElementById('phone_input').classList.add('is-valid');
                        } else {
                          document.getElementById('phone_input').classList.add('is-invalid');
                          document.getElementById('phone_input').classList.remove('is-valid');
                        }
                      }} />
                    <label class="form-label" for="phone_input">{t('Phone')}</label>
                  </div>
                </div>
                <!-- <div class="col-md-6">
                  <div data-mdb-input-init class="form-outline">
                    <input
                      type="email"
                      id="email_input"
                      class="form-control mb-0"
                      bind:value={email}
                      on:input={(e) => {
                        email = e.target.value;
                        if (email.trim() && validateEmailType(email)) {
                          document.getElementById('email_input').classList.remove('is-invalid');
                          document.getElementById('email_input').classList.add('is-valid');
                        } else {
                          document.getElementById('email_input').classList.add('is-invalid');
                          document.getElementById('email_input').classList.remove('is-valid');
                        }
                      }} />
                    <label class="form-label" for="email_input">{t('Email')}</label>
                  </div>
                </div> -->

                <div class="col-md-6">
                  <div data-mdb-input-init class="form-outline">
                    <input
                      type="text"
                      id="username_input"
                      class="form-control mb-0"
                      bind:value={username}
                      on:input={(e) => {
                        username = e.target.value;
                        if (username.trim() && username.length >= 4 && username.indexOf(' ') === -1) {
                          document.getElementById('username_input').classList.remove('is-invalid');
                          document.getElementById('username_input').classList.add('is-valid');
                        } else {
                          document.getElementById('username_input').classList.add('is-invalid');
                          document.getElementById('username_input').classList.remove('is-valid');
                        }
                      }} />
                    <label class="form-label" for="username_input">{t('Username')}</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <!-- Password input -->
                   <div class="input-group">
                   <div data-mdb-input-init class="form-outline">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password_input"
                      class="form-control mb-0"
                      bind:value={password}
                      on:input={(e) => {
                        password = e.target.value;
                        if (password && password.length >= 6) {
                          document.getElementById('password_input').classList.remove('is-invalid');
                          document.getElementById('password_input').classList.add('is-valid');
                        } else {
                          document.getElementById('password_input').classList.add('is-invalid');
                          document.getElementById('password_input').classList.remove('is-valid');
                        }
                      }} />
                    <label class="form-label" for="password_input">{t('Password')}</label>
                  </div>
       

        <button
          type="button"
          class="btn btn-outline-secondary px-2"
          on:click={togglePassword}
        >
          <i class={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
        </button>
  </div>
                  
                </div>
              </div>

              <hr />

              <button
                disabled={registering}
                class="btn btn-primary"
                on:click={async () => {
                  registering = true;
                  await handleRegister();
                  registering = false;
                }}>
                {@html registering
                  ? `<div class="spinner-border spinner-border-sm" role="status">
                    <span class="visually-hidden">Loading...</span>
                  </div>`
                  : currentLang === 'en'
                    ? 'Start using'
                    : 'شروع استفاده'}
              </button>

              <div class="row mt-3">
                <div class="col-md-6 text-start">
                  <button class="btn btn-link" on:click={() => (orgTypeSelected = null)}
                    ><i class="bi bi-arrow-repeat"></i>
                    {currentLang === 'en' ? 'Choose Again' : 'انتخاب مجدد'}
                  </button>
                </div>
                <div class="col-md-6 d-flex align-items-center">
                  <div class="text-center small">
                    <span class="text-muted">{t('Already have an account?')}</span>
                    <button class="btn btn-link p-0 ms-1" on:click={() => push('/login')}>
                      {t('Login here!')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="row g-3 g-md-4 justify-content-center mb-4">
        {#each orgTypes as f, i}
          <div class="col-6 col-sm-6 col-md-4 col-lg-3 col-xl-2 d-flex">
            <div
              class="card d-flex flex-fill animate__animated shadow-0
  {phase === 'enter' ? 'animate__fadeInUp' : 'animate__fadeOutDown faster'}"
              style="animation-delay: {phase === 'enter' ? i * 0.2 + 1 : i * 0.05}s"
              on:click={() => selectOrgType(f.id)}>
              <div class="feature-card">
                <div class="card-body text-center">
                  <div class="icon-wrapper bg-primary">
                    <i class={`bi ${f.icon}`}></i>
                  </div>

                  <h6 class="card-title mt-3" style="font-size: 17px;">{currentLang === 'en' ? f.name_en : f.name}</h6>
                  <p class="card-text small">{currentLang === 'en' ? f.description_en : f.description}</p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div
        class="subtitle-soon text-center animate__animated mt-5 mb-3 {phase === 'enter'
          ? 'animate__flipInX animate__delay-3s'
          : 'animate__flipOutX faster'}">
        {currentLang === 'en' ? 'Coming Soon for these types too' : 'به زودی برای این نوع شرکت‌ها نیز ارائه خواهد شد'}
      </div>

      <div class="row g-3 g-md-4 justify-content-center mb-4">
        {#each comming_soon as f, i}
          <div class="col-6 col-sm-6 col-md-4 col-lg-3 col-xl-2 d-flex">
            <div
              class="card d-flex flex-fill animate__animated shadow-0
  {phase === 'enter' ? 'animate__fadeInUp' : 'animate__fadeOutDown faster'}"
              style="animation-delay: {phase === 'enter' ? i * 0.05 + 1 + 3 : i * 0.05}s"
              on:click={() => {
                if (ctrlPressed && shiftPressed) {
                  selectOrgType(f.id);
                }
              }}>
              <div class="{ctrlPressed&&shiftPressed?"feature-card":"feature-card-soon"}">
                <div class="card-body text-center">
                  <div class="{ctrlPressed&&shiftPressed?"icon-wrapper":"icon-wrapper-soon"}">
                    <i class={`bi ${f.icon}`}></i>
                  </div>

                  <h6 class="card-title mt-3" style="font-size: 17px;">{currentLang === 'en' ? f.name_en : f.name}</h6>
                  <p class="card-text small">{currentLang === 'en' ? f.description_en : f.description}</p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  <!-- MODERN MDBOOTSTRAP FOOTER -->
<footer class="zeno-footer mt-5 pt-5 pb-3">
  <div class="container">
    <div class="row g-4">

      <!-- Brand -->
      <div class="col-md-4">
        <div class="d-flex align-items-center mb-3">
          <img src="/img/logo.png" alt="ZenoERP" height="42" class="me-2" />
        </div>

        <p class="text-muted small mb-4">
          Smart ERP solution for modern businesses. Manage inventory, finance,
          users, reports and operations in one platform.
        </p>

        <div class="d-flex gap-3 social-links">
          <a href="#" class="social-icon">
            <i class="bi bi-facebook"></i>
          </a>

          <a href="#" class="social-icon">
            <i class="bi bi-instagram"></i>
          </a>

          <a href="#" class="social-icon">
            <i class="bi bi-linkedin"></i>
          </a>

          <a href="#" class="social-icon">
            <i class="bi bi-youtube"></i>
          </a>

          <a href="#" class="social-icon">
            <i class="bi bi-telegram"></i>
          </a>
        </div>
      </div>

      <!-- Contact -->
      <div class="col-md-4">
        <h5 class="footer-title mb-4">
          <i class="bi bi-headset text-primary me-2"></i>
          Contact
        </h5>

        <ul class="list-unstyled footer-links">
          <li class="mb-3">
            <i class="bi bi-globe2 text-primary me-2"></i>
            <a href="https://zenoerp.com" target="_blank">
              zenoerp.com
            </a>
          </li>

          <li class="mb-3">
            <i class="bi bi-envelope-fill text-primary me-2"></i>
            <a href="mailto:support@zenoerp.com">
              support@zenoerp.com
            </a>
          </li>

          <li class="mb-3">
            <i class="bi bi-telephone-fill text-primary me-2"></i>
            <span dir="ltr">+93 70 449 5743</span>
          </li>

          <li class="mb-3">
            <i class="bi bi-clock-fill text-primary me-2"></i>
            <span>24/7 Customer Support</span>
          </li>
        </ul>
      </div>

      <!-- Downloads -->
      <div class="col-md-4">
        <h5 class="footer-title mb-4">
          <i class="bi bi-download text-primary me-2"></i>
          Downloads
        </h5>

        <div class="d-grid gap-3">

          <a href="#" class="download-card">
            <div>
              <div class="fw-semibold">Thermal Printer Driver</div>
              <small class="text-muted">POS / Receipt Printers</small>
            </div>

            <i class="bi bi-download"></i>
          </a>

          <a href="#" class="download-card">
            <div>
              <div class="fw-semibold">Barcode Printer Driver</div>
              <small class="text-muted">Label & Barcode Printers</small>
            </div>

            <i class="bi bi-download"></i>
          </a>

          <a href="#" class="download-card">
            <div>
              <div class="fw-semibold">Full Driver Package</div>
              <small class="text-muted">All Supported Devices</small>
            </div>

            <i class="bi bi-download"></i>
          </a>

        </div>
      </div>
    </div>

    <hr class="my-4 opacity-25" />

    <!-- Bottom -->
    <div class="d-flex flex-column flex-md-row justify-content-between align-items-center small text-muted">
      <div>
        © {new Date().getFullYear()} ZENO ERP. All rights reserved.
      </div>

      <div class="mt-2 mt-md-0">
        Built with ❤️ for modern businesses
      </div>
    </div>
  </div>
</footer>
{/key}

<style>
  .hero {
    /* margin-top: 30px; */
  }
  .gradient-text {
    background: linear-gradient(135deg, #0d6efd, #6f42c1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;

    /* for Firefox */
    background-clip: text;
    color: transparent;
  }
  .logo {
    font-size: 80px;
  }

  .title {
    font-size: 42px;
  }

  .title-en {
    line-height: 54px;
    font-size: 50px;
  }

  .subtitle {
    font-size: 18px;
    font-weight: 500;
    color: #6c757d;
  }

  .subtitle-soon {
    font-size: 22px;
    font-weight: 500;
    color: #6c757d;
  }

  /* Faster exit */
  .faster {
    --animate-duration: 0.5s;
  }

  /* CARD DESIGN */
  .feature-card {
    display: flex;
    border-radius: 22px;
    transition:
      transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1),
      box-shadow 0.35s;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(10px);
    overflow: hidden;
    position: relative;
    cursor: pointer;
  }

  /* ✨ gradient glow border effect */
  .feature-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 22px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(0, 123, 255, 0.4), rgba(111, 66, 193, 0.4));
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: 0.3s;
  }
  /* 🚀 hover effect */
  .card:hover .feature-card,
  .card:focus .feature-card {
    transform: translateY(-10px) scale(1.03);
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.15);
  }
  .feature-card .card-body,
  .feature-card-soon .card-body {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .card-body {
    display: flex;
    flex-direction: column;
    height: 100%; /* 🔥 VERY IMPORTANT */
  }

  .card {
    display: flex;
    flex-direction: column;
  }

  .card-body {
    flex: 1;
  }
  .card-text {
    flex-grow: 1; /* pushes content evenly */
  }

  .feature-card,
  .feature-card-soon {
    display: flex;
    flex-direction: column;
    height: 100%; /* 🔥 VERY IMPORTANT */
  }
  .card-text {
    flex-grow: 1;
  }

  .feature-card:hover::before,
  .feature-card:focus::before {
    opacity: 1;
  }

  .icon-wrapper {
    width: 65px;
    height: 65px;
    margin: 0 auto;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 30px;
    padding-top: 6px;

    background: linear-gradient(135deg, #0d6efd, #6f42c1);
    box-shadow: 0 10px 20px rgba(13, 110, 253, 0.3);
    transition: 0.3s;
  }

  /* icon hover animation */
  .feature-card:hover .icon-wrapper {
    transform: scale(1.1) rotate(5deg);
  }

  .feature-card-soon {
    display: flex;
    border-radius: 22px;
    transition:
      transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1),
      box-shadow 0.35s;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(10px);
    overflow: hidden;
    position: relative;
  }

  /* ✨ gradient glow border effect */
  .feature-card-soon::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 22px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(0, 123, 255, 0.1), rgba(0, 0, 0, 0.1));
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: 0.3s;
  }

  .icon-wrapper-soon {
    width: 65px;
    height: 65px;
    margin: 0 auto;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 30px;
    padding-top: 6px;

    background: #888;
    transition: 0.3s;
  }

  .logo.animate__backInUp {
    animation-name: backInUpLeft !important;
  }

  /* custom animation */
  @keyframes backInUpLeft {
    0% {
      transform: translate(-800px, 100vh) scale(0.7);
      opacity: 0;
    }

    60% {
      transform: translate(20px, -20px) scale(1.05);
      opacity: 1;
    }

    80% {
      transform: translate(-5px, 5px) scale(0.98);
    }

    100% {
      transform: translate(0, 0) scale(1);
    }
  }

  .card {
    height: 100%;
  }

  /* FOOTER */
.zeno-footer {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(14px);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 30px 30px 0 0;
}

/* subtle glow */
.zeno-footer::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(13, 110, 253, 0.08), transparent 35%),
    radial-gradient(circle at top right, rgba(111, 66, 193, 0.08), transparent 35%);
  pointer-events: none;
}

.footer-title {
  font-weight: 700;
  font-size: 18px;
}

.footer-links li {
  display: flex;
  align-items: center;
  color: #6c757d;
}

.footer-links a {
  color: inherit;
  text-decoration: none;
  transition: 0.25s ease;
}

.footer-links a:hover {
  color: #0d6efd;
}

/* SOCIAL */
.social-links {
  flex-wrap: wrap;
}

.social-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(13, 110, 253, 0.08);
  color: #0d6efd;

  font-size: 18px;
  text-decoration: none;

  transition:
    transform 0.25s ease,
    background 0.25s ease,
    color 0.25s ease;
}

.social-icon:hover {
  transform: translateY(-4px);
  background: linear-gradient(135deg, #0d6efd, #6f42c1);
  color: white;
}

/* DOWNLOAD CARDS */
.download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 14px 16px;
  border-radius: 18px;

  background: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  color: inherit;

  border: 1px solid rgba(0, 0, 0, 0.05);

  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}

.download-card:hover {
  transform: translateY(-4px);

  border-color: rgba(13, 110, 253, 0.2);

  box-shadow:
    0 10px 25px rgba(13, 110, 253, 0.08);
}

.download-card i {
  font-size: 20px;
  color: #0d6efd;
}

/* MOBILE */
@media (max-width: 768px) {
  .zeno-footer {
    border-radius: 22px 22px 0 0;
  }
}
</style>
