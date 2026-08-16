<script>
  import { logoutClear } from '../auth/authService';
  import { register, validateRegister } from '../auth/authService';
  import { onMount, onDestroy } from 'svelte';
  import { t, lang, setLanguage, isRTL, supported, translate_org_type } from '../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import { auth } from '../auth/authStore';
  import { allOrgTypes, orgTypes, comming_soon } from './OrgTypes';
  import { app_version } from '../config.js';

  // State management
  let shiftPressed = false;
  let ctrlPressed = false;
  let registering = false;
  let isAuthenticated = false;
  let phone = '';
  let org_name = '';
  let username = '';
  let email = '';
  let password = '';
  let error = '';
  let phase = 'enter';
  let resetKey = 0;
  let timer;
  let currentLang = localStorage.getItem('lang') || 'fa';
  let orgTypeSelected = null;
  let currentTheme = 'light';
  let showPassword = false;
  let forVideo = false;

  // Reactive declarations
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: if ($auth && $auth.isAuthenticated) {
    push('/dashboard');
    isAuthenticated = true;
  } else {
    isAuthenticated = false;
  }

  // Features list for display
  const features = [
    { icon: 'bi-box', title: 'مدیریت انبار', desc: 'مدیریت موجودی و کنترل دقیق کالاها' },
    { icon: 'bi-currency-dollar', title: 'مدیریت مالی', desc: 'کنترل حساب‌ها و گزارشات مالی' },
    { icon: 'bi-people', title: 'مدیریت کاربران', desc: 'نقش‌ها برای سازماندهی کاربران' },
    { icon: 'bi-graph-up', title: 'گزارشات', desc: 'تحلیل کامل عملکرد کسب‌وکار' },
    { icon: 'bi-gear', title: 'تنظیمات', desc: 'پیکربندی کامل سیستم' },
    { icon: 'bi-phone', title: 'پشتیبانی', desc: 'دسترسی سریع به کمک و پشتیبانی' },
  ];

  // Keyboard handlers
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  // Animation sequence
  function startSequence() {
    phase = 'enter';
    clearTimeout(timer);
  }

  function resetAnimations() {
    phase = 'enter';
    resetKey++;
    startSequence();
    initializeMDBComponents();
  }

  function initializeMDBComponents() {
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          if (!el._mdbInput) new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          if (!el._mdbDropdown) new window.mdb.Dropdown(el);
        });
        document.querySelectorAll('[data-mdb-ripple-init]').forEach((el) => {
          if (!el._mdbRipple) new window.mdb.Ripple(el);
        });
      }
    }, 100);
  }

  async function selectOrgType(type) {
    orgTypeSelected = type;
    initializeMDBComponents();
  }

  function validateEmailType(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleRegister() {
    error = '';
    
    // Validation helpers
    const setInvalid = (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('is-valid');
        el.classList.add('is-invalid');
        el.focus();
      }
    };
    
    const setValid = (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('is-invalid');
        el.classList.add('is-valid');
      }
    };

    // Field validations
    if (!org_name.trim()) {
      error = t('Organization Name is required');
      setInvalid('org_name_input');
      return;
    }
    setValid('org_name_input');

    if (!phone.trim()) {
      error = t('Phone is required');
      setInvalid('phone_input');
      return;
    }
    setValid('phone_input');

    if (!username.trim()) {
      error = t('Username is required');
      setInvalid('username_input');
      return;
    }
    
    if (username.length < 4) {
      error = t('Username must be at least 4 characters');
      setInvalid('username_input');
      return;
    }

    if (username.indexOf(' ') !== -1) {
      error = t('Username cannot contain spaces');
      setInvalid('username_input');
      return;
    }
    setValid('username_input');

    if (!password) {
      error = t('Password is required');
      setInvalid('password_input');
      return;
    }
    
    if (password.length < 6) {
      error = t('Password must be at least 6 characters');
      setInvalid('password_input');
      return;
    }
    setValid('password_input');

    // Server-side validation
    let validRegister = await validateRegister(username, email);
    
    if (!validRegister.validUsername) {
      error = t('Username is already taken');
      setInvalid('username_input');
      return;
    }

    // Registration attempt
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
      error = err.message || t('Registration failed. Please try again.');
    }
  }

  // Lifecycle hooks
  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    startSequence();

    // Initialize language and theme
    try {
      const lang = localStorage.getItem('lang') || 'fa';
      setLanguage(lang);
      const shouldRtl = isRTL(lang);
      document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
      
      const mdbCss = document.getElementById('mdb-css');
      const mdbRtlCss = document.getElementById('mdb-rtl-css');
      if (mdbCss && mdbRtlCss) {
        mdbCss.disabled = shouldRtl;
        mdbRtlCss.disabled = !shouldRtl;
      }
    } catch (e) {
      console.warn('Language init error:', e);
    }

    try {
      const theme = localStorage.getItem('theme') || 'light';
      currentTheme = theme;
      document.documentElement.dataset.mdbTheme = theme;
    } catch (e) {
      console.warn('Theme init error:', e);
    }

    initializeMDBComponents();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    clearTimeout(timer);
  });

  // Utility functions
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Fullscreen error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function togglePassword() {
    showPassword = !showPassword;
  }

  function changeLanguage(code) {
    setLanguage(code);
    const shouldRtl = isRTL(code);
    document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
    
    const mdbCss = document.getElementById('mdb-css');
    const mdbRtlCss = document.getElementById('mdb-rtl-css');
    if (mdbCss && mdbRtlCss) {
      mdbCss.disabled = shouldRtl;
      mdbRtlCss.disabled = !shouldRtl;
    }
    localStorage.setItem('lang', code);
    currentLang = code;
  }
</script>

{#key resetKey}
  <div class="min-vh-100 d-flex flex-column bg-gradient-light">
    
    <!-- Modern Header with MDB Patterns -->
    <header class="zeno-header py-3 px-4">
      <div class="container-fluid">
        <div class="d-flex justify-content-between align-items-center">
          
          <!-- Logo -->
          <a href="/" class="d-flex align-items-center text-decoration-none">
            <img src="/img/logo.png" height="40" alt="ZenoERP" class="me-2" />
          </a>

          <!-- Action Buttons -->
          <div class="d-flex align-items-center gap-2">
            
            {#if isAuthenticated}
              <button 
                class="btn btn-primary btn-rounded btn-sm" 
                data-mdb-ripple-init
                on:click={() => push('/dashboard')}>
                <i class="bi bi-speedometer2 me-1"></i>
                {t('Dashboard')}
              </button>
            {:else}
              <button 
                class="btn btn-outline-primary btn-rounded btn-sm" 
                data-mdb-ripple-init
                on:click={() => push('/login')}>
                <i class="bi bi-box-arrow-in-right me-1"></i>
                {t('Login')}
              </button>
            {/if}

            <!-- Language Dropdown -->
            <div class="dropdown">
              <button 
                class="btn btn-outline-secondary btn-rounded btn-sm dropdown-toggle" 
                type="button" 
                data-mdb-dropdown-init 
                data-mdb-toggle="dropdown" 
                aria-expanded="false"
                data-mdb-ripple-init>
                <i class="bi bi-globe"></i>
                <span class="d-none d-md-inline ms-1">{currentLang.toUpperCase()}</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="max-height: 250px; overflow-y: auto;">
                {#each supported as s}
                  <li>
                    <button
                      class="dropdown-item d-flex align-items-center {s.code === currentLang ? 'active' : ''}"
                      on:click={() => changeLanguage(s.code)}
                      type="button"
                      data-mdb-ripple-init>
                      <span class="me-2">{s.label}</span>
                      {#if s.code === currentLang}
                        <i class="bi bi-check text-primary ms-auto"></i>
                      {/if}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>

            <!-- Fullscreen Toggle -->
            <button 
              class="btn btn-outline-secondary btn-rounded btn-sm" 
              on:click={toggleFullscreen} 
              title="Fullscreen"
              data-mdb-ripple-init>
              <i class="bi bi-arrows-fullscreen"></i>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-grow-1 py-4 py-md-5">
      <div class="container">
        
        <!-- Hero Section -->
        <div class="text-center mb-4 mb-md-5 animate__animated animate__fadeIn">
          {#if !orgTypeSelected}
            <div class="mb-4">
              <img 
                src="/img/logo.png" 
                height="{window.innerWidth < 768 ? '70' : '100'}" 
                alt="ZenoERP Logo"
                class="animate__animated animate__bounceIn" />
            </div>
            
            {#if currentLang != 'en'}
              <h1 class="display-5 display-md-3 fw-bold mb-3 animate__animated animate__fadeInUp">
                <span class="gradient-text">زینو</span> 
                <span class="text-dark">ای‌ آر‌ پی</span>
              </h1>
            {/if}
          {/if}

          {#if shiftPressed && ctrlPressed}
            <div class="badge bg-danger-subtle text-danger mb-3">
              <i class="bi bi-code-slash me-1"></i>
              {app_version}
            </div>
            <button 
              class="btn btn-outline-danger btn-sm mb-4" 
              on:click={logoutClear}
              data-mdb-ripple-init>
              <i class="bi bi-box-arrow-left me-1"></i>
              {t('Logout Clear')}
            </button>
          {/if}

          {#if !orgTypeSelected}
            <p class="lead text-muted mb-0 animate__animated animate__fadeInUp animate__delay-1s">
              {#if forVideo}
                دیتابیس مدیریتی برای هر نوع شرکت
              {:else}
                {currentLang === 'en' ? 'Select your business type to get started' : 'نوع شرکت خود را انتخاب کنید'}
              {/if}
            </p>
          {/if}
        </div>

        <!-- Registration Form (MDB Card Pattern) -->
        {#if orgTypeSelected}
          <div class="row justify-content-center">
            <div class="col-lg-8 col-xl-6">
              <div class="card shadow-4 border-0 rounded-4 animate__animated animate__fadeInUp">
                <div class="card-header bg-primary-subtle border-0 py-3">
                  <div class="d-flex align-items-center">
                    <div class="icon-wrapper bg-primary rounded-3 p-3 me-3">
                      <i class={`bi ${allOrgTypes.find((o) => o.id === orgTypeSelected)?.icon} text-white fs-4`}></i>
                    </div>
                    <div>
                      <h4 class="card-title mb-0 fw-bold">
                        {currentLang === 'en'
                          ? allOrgTypes.find((o) => o.id === orgTypeSelected)?.name_en
                          : allOrgTypes.find((o) => o.id === orgTypeSelected)?.name}
                      </h4>
                      <small class="text-muted">{t('Register your organization')}</small>
                    </div>
                  </div>
                </div>
                
                <div class="card-body p-4">
                  <!-- Error Alert (MDB Pattern) -->
                  {#if error}
                    <div class="alert alert-danger alert-dismissible fade show mb-4" role="alert" data-mdb-alert-init>
                      <i class="bi bi-exclamation-triangle-fill me-2"></i>
                      {error}
                      <button type="button" class="btn-close" data-mdb-ripple-init on:click={() => error = ''}></button>
                    </div>
                  {/if}

                  <!-- Form Grid -->
                  <div class="row g-3">
                    <!-- Organization Name -->
                    <div class="col-md-6">
                      <div data-mdb-input-init class="form-outline">
                        <input
                          type="text"
                          id="org_name_input"
                          class="form-control form-control-lg"
                          bind:value={org_name}
                          on:input={(e) => {
                            org_name = e.target.value;
                            const el = document.getElementById('org_name_input');
                            if (el) {
                              el.classList.toggle('is-valid', org_name.trim());
                              el.classList.toggle('is-invalid', !org_name.trim());
                            }
                          }} />
                        <label class="form-label" for="org_name_input">
                          {t('Name')} {currentLang === 'en' ? 'of ' : ''}
                          {currentLang === 'en'
                            ? allOrgTypes.find((o) => o.id === orgTypeSelected)?.name_en
                            : allOrgTypes.find((o) => o.id === orgTypeSelected)?.name}
                        </label>
                        <div class="invalid-feedback">{t('Organization name is required')}</div>
                      </div>
                    </div>

                    <!-- Phone -->
                    <div class="col-md-6">
                      <div data-mdb-input-init class="form-outline">
                        <input
                          type="tel"
                          id="phone_input"
                          class="form-control form-control-lg"
                          bind:value={phone}
                          on:input={(e) => {
                            phone = e.target.value;
                            const el = document.getElementById('phone_input');
                            if (el) {
                              el.classList.toggle('is-valid', phone.trim());
                              el.classList.toggle('is-invalid', !phone.trim());
                            }
                          }} />
                        <label class="form-label" for="phone_input">{t('Phone')}</label>
                        <div class="invalid-feedback">{t('Phone number is required')}</div>
                      </div>
                    </div>

                    <!-- Username -->
                    <div class="col-md-6">
                      <div data-mdb-input-init class="form-outline">
                        <input
                          type="text"
                          id="username_input"
                          class="form-control form-control-lg"
                          bind:value={username}
                          on:input={(e) => {
                            username = e.target.value;
                            const el = document.getElementById('username_input');
                            if (el) {
                              const valid = username.trim() && username.length >= 4 && username.indexOf(' ') === -1;
                              el.classList.toggle('is-valid', valid);
                              el.classList.toggle('is-invalid', !valid && username.length > 0);
                            }
                          }} />
                        <label class="form-label" for="username_input">{t('Username')}</label>
                        <div class="invalid-feedback">{t('Username must be 4+ chars, no spaces')}</div>
                      </div>
                    </div>

                    <!-- Password with Toggle -->
                    <div class="col-md-6">
                      <div class="input-group" data-mdb-input-init>
                        <div class="form-outline flex-fill">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            id="password_input"
                            class="form-control form-control-lg"
                            bind:value={password}
                            on:input={(e) => {
                              password = e.target.value;
                              const el = document.getElementById('password_input');
                              if (el) {
                                el.classList.toggle('is-valid', password && password.length >= 6);
                                el.classList.toggle('is-invalid', password && password.length < 6);
                              }
                            }} />
                          <label class="form-label" for="password_input">{t('Password')}</label>
                          <div class="invalid-feedback">{t('Password must be at least 6 characters')}</div>
                        </div>
                        <button
                          class="btn btn-outline-secondary"
                          type="button"
                          on:click={togglePassword}
                          data-mdb-ripple-init
                          title={showPassword ? t('Hide password') : t('Show password')}>
                          <i class={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Action Buttons -->
                  <div class="d-grid gap-3 mt-4">
                    <button
                      class="btn btn-primary btn-lg"
                      disabled={registering}
                      on:click={async () => {
                        registering = true;
                        await handleRegister();
                        registering = false;
                      }}
                      data-mdb-ripple-init>
                      {#if registering}
                        <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                        {t('Processing...')}
                      {:else}
                        <i class="bi bi-check-circle me-2"></i>
                        {currentLang === 'en' ? 'Start using ZenoERP' : 'شروع استفاده از زینو ای‌آر‌پی'}
                      {/if}
                    </button>
                    
                    <div class="d-flex justify-content-between align-items-center">
                      <button 
                        class="btn btn-link text-decoration-none p-0" 
                        on:click={() => {
                          orgTypeSelected = null;
                          error = '';
                        }}
                        data-mdb-ripple-init>
                        <i class="bi bi-arrow-left me-1"></i>
                        {currentLang === 'en' ? 'Choose different type' : 'انتخاب نوع دیگر'}
                      </button>
                      
                      <div class="text-muted small">
                        {t('Already have an account?')}
                        <button 
                          class="btn btn-link text-decoration-none p-0 ms-1 fw-medium" 
                          on:click={() => push('/login')}
                          data-mdb-ripple-init>
                          {t('Login here')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        {:else}
          <!-- Organization Type Selection Grid -->
          <div class="row g-3 g-md-4 justify-content-center mb-5">
            {#each orgTypes as f, i}
              <div class="col-6 col-sm-4 col-md-3 col-lg-2">
                <div 
                  class="card h-100 border-0 shadow-sm hover-shadow-lg cursor-pointer animate__animated animate__fadeInUp"
                  style="animation-delay: {i * 0.05}s"
                  on:click={() => selectOrgType(f.id)}
                  data-mdb-ripple-init>
                  <div class="card-body text-center py-4">
                    <div class="icon-wrapper bg-primary-subtle rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center" 
                         style="width: 70px; height: 70px;">
                      <i class={`bi ${f.icon} text-primary fs-3`}></i>
                    </div>
                    <h6 class="card-title fw-semibold mb-2 small">
                      {currentLang === 'en' ? f.name_en : f.name}
                    </h6>
                    <p class="card-text text-muted small mb-0" style="font-size: 0.85rem;">
                      {currentLang === 'en' ? f.description_en : f.description}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <!-- Coming Soon Section -->
          <div class="text-center mb-4">
            <span class="badge bg-secondary-subtle text-secondary px-3 py-2">
              <i class="bi bi-hourglass-split me-2"></i>
              {currentLang === 'en' ? 'Coming Soon' : 'به زودی'}
            </span>
          </div>

          <div class="row g-3 g-md-4 justify-content-center opacity-75">
            {#each comming_soon as f, i}
              <div class="col-6 col-sm-4 col-md-3 col-lg-2">
                <div 
                  class="card h-100 border-0 bg-light-subtle cursor-not-allowed"
                  on:click={() => {
                    if (ctrlPressed && shiftPressed) {
                      selectOrgType(f.id);
                    }
                  }}>
                  <div class="card-body text-center py-4">
                    <div class="icon-wrapper bg-secondary-subtle rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center" 
                         style="width: 70px; height: 70px;">
                      <i class={`bi ${f.icon} text-secondary fs-3`}></i>
                    </div>
                    <h6 class="card-title fw-semibold mb-2 small text-secondary">
                      {currentLang === 'en' ? f.name_en : f.name}
                    </h6>
                    <p class="card-text text-muted small mb-0" style="font-size: 0.85rem;">
                      {currentLang === 'en' ? f.description_en : f.description}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Features Preview (Optional Marketing Section) -->
        {#if !orgTypeSelected && !forVideo}
          <div class="mt-5 pt-4 border-top">
            <h3 class="text-center fw-bold mb-4">{t('Everything you need')}</h3>
            <div class="row g-4">
              {#each features as feature, i}
                <div class="col-6 col-md-4 col-lg-2">
                  <div class="text-center">
                    <div class="bg-primary-subtle rounded-circle d-inline-flex align-items-center justify-content-center mb-3" 
                         style="width: 50px; height: 50px;">
                      <i class={`bi ${feature.icon} text-primary fs-5`}></i>
                    </div>
                    <h6 class="fw-semibold small mb-1">{feature.title}</h6>
                    <p class="text-muted small mb-0" style="font-size: 0.8rem;">{feature.desc}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

      </div>
    </main>

    <!-- Modern Footer with MDB Patterns -->
    <footer class="zeno-footer mt-auto py-4 py-md-5">
      <div class="container">
        <div class="row g-4 g-md-5">
          
          <!-- Brand Column -->
          <div class="col-md-4">
            <div class="d-flex align-items-center mb-3">
              <img src="/img/logo.png" alt="ZenoERP" height="40" class="me-2" />
            </div>
            <p class="text-muted small mb-4">
              {currentLang === 'en' 
                ? 'Smart ERP solution for modern businesses. Manage inventory, finance, users, reports and operations in one platform.'
                : 'راهکار هوشمند مدیریت کسب‌وکار. مدیریت انبار، مالی، کاربران، گزارشات و عملیات در یک پلتفرم'}
            </p>
            <div class="d-flex gap-2">
              {#each ['facebook', 'instagram', 'linkedin', 'telegram'] as social}
                <a href="#" class="btn btn-outline-primary btn-rounded btn-sm social-btn" 
                   data-mdb-ripple-init title={social}>
                  <i class={`bi bi-${social}`}></i>
                </a>
              {/each}
            </div>
          </div>

          <!-- Contact Column -->
          <div class="col-md-4">
            <h5 class="fw-bold mb-4">
              <i class="bi bi-headset text-primary me-2"></i>
              {t('Contact')}
            </h5>
            <ul class="list-unstyled">
              <li class="mb-3">
                <a href="https://zenoerp.com" target="_blank" class="text-decoration-none text-muted hover-primary d-flex align-items-center">
                  <i class="bi bi-globe2 text-primary me-2"></i>
                  zenoerp.com
                </a>
              </li>
              <li class="mb-3">
                <a href="mailto:support@zenoerp.com" class="text-decoration-none text-muted hover-primary d-flex align-items-center">
                  <i class="bi bi-envelope-fill text-primary me-2"></i>
                  support@zenoerp.com
                </a>
              </li>
              <li class="mb-3">
                <span class="text-muted d-flex align-items-center">
                  <i class="bi bi-telephone-fill text-primary me-2"></i>
                  <span dir="ltr" class="fw-medium">+93 70 449 5743</span>
                </span>
              </li>
              <li>
                <span class="text-muted d-flex align-items-center">
                  <i class="bi bi-clock-fill text-primary me-2"></i>
                  {t('24/7 Support')}
                </span>
              </li>
            </ul>
          </div>

          <!-- Downloads Column -->
          <div class="col-md-4">
            <h5 class="fw-bold mb-4">
              <i class="bi bi-download text-primary me-2"></i>
              {t('Downloads')}
            </h5>
            <div class="d-grid gap-2">
              {#each [
                {title: 'Thermal Printer Driver', desc: 'POS / Receipt Printers'},
                {title: 'Barcode Printer Driver', desc: 'Label & Barcode Printers'},
                {title: 'Full Driver Package', desc: 'All Supported Devices'}
              ] as item}
                <a href="#" class="btn btn-outline-secondary btn-sm text-start download-card" data-mdb-ripple-init>
                  <div class="d-flex justify-content-between align-items-center w-100">
                    <div>
                      <div class="fw-medium small">{item.title}</div>
                      <small class="text-muted">{item.desc}</small>
                    </div>
                    <i class="bi bi-download text-primary"></i>
                  </div>
                </a>
              {/each}
            </div>
          </div>
        </div>

        <!-- Footer Bottom -->
        <hr class="my-4 opacity-25" />
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-center small text-muted">
          <div>
            © {new Date().getFullYear()} ZENO ERP. {t('All rights reserved.')}
          </div>
          <div class="mt-2 mt-md-0 d-flex align-items-center">
            <i class="bi bi-heart-fill text-danger me-1"></i>
            {currentLang === 'en' ? 'Built for modern businesses' : 'ساخته شده برای کسب‌وکارهای مدرن'}
          </div>
        </div>
      </div>
    </footer>

  </div>
{/key}

<style>
  /* MDB-Inspired Global Styles */
  :global(.bg-gradient-light) {
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  }

  :global(.gradient-text) {
    background: linear-gradient(135deg, #0d6efd, #6f42c1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  /* Header Styles */
  .zeno-header {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    position: sticky;
    top: 0;
    z-index: 1030;
  }

  /* Card Hover Effects */
  .hover-shadow-lg {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  .hover-shadow-lg:hover {
    transform: translateY(-5px);
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
  }

  /* Icon Wrapper Animation */
  .icon-wrapper {
    transition: transform 0.3s ease;
  }
  .card:hover .icon-wrapper {
    transform: scale(1.1);
  }

  /* Social Button Hover */
  .social-btn:hover {
    background: linear-gradient(135deg, #0d6efd, #6f42c1) !important;
    color: white !important;
    border-color: transparent !important;
  }

  /* Download Card Hover */
  .download-card:hover {
    background: rgba(13, 110, 253, 0.05) !important;
    border-color: rgba(13, 110, 253, 0.2) !important;
  }

  /* Footer Styles */
  .zeno-footer {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }

  .hover-primary:hover {
    color: #0d6efd !important;
  }

  /* Responsive Typography */
  @media (max-width: 768px) {
    :global(.display-5) {
      font-size: 1.8rem !important;
    }
    .zeno-footer {
      border-radius: 24px 24px 0 0;
    }
  }

  /* RTL Support Enhancements */
  :global([dir="rtl"]) .me-1,
  :global([dir="rtl"]) .me-2,
  :global([dir="rtl"]) .me-3 {
    margin-left: 0.25rem !important;
    margin-right: 0 !important;
  }
  
  :global([dir="rtl"]) .ms-1,
  :global([dir="rtl"]) .ms-2,
  :global([dir="rtl"]) .ms-3 {
    margin-right: 0.25rem !important;
    margin-left: 0 !important;
  }

  /* Cursor Utilities */
  .cursor-pointer {
    cursor: pointer;
  }
  .cursor-not-allowed {
    cursor: not-allowed;
  }

  /* Animation Duration Override */
  :global(.animate__faster) {
    --animate-duration: 0.4s !important;
  }
</style>