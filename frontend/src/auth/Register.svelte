<script>
  import { register } from './authService';
  import { push } from 'svelte-spa-router';
  import { t, setLanguage, isRTL, lang, supported } from '../i18n/i18n';
  import { onMount } from 'svelte';
  import { useLightPageTheme } from '../stores/themeStore.js';

  onMount(useLightPageTheme);
  import {app_version} from '../config.js';

  let phone = '';
  let org_name = '';
  let username = '';
  let email = '';
  let password = '';
  let error = '';
  let currentLang = localStorage.getItem('lang') || 'fa';

  const unsubscribeLang = lang.subscribe((v) => (currentLang = v));

  onMount(() => {
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
    try {
      const storedLang = localStorage.getItem('lang') || 'fa';
      setLanguage(storedLang);
      const shouldRtl = isRTL(storedLang);
      document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
      const mdbCss = document.getElementById('mdb-css');
      const mdbRtlCss = document.getElementById('mdb-rtl-css');
      if (mdbCss && mdbRtlCss) {
        mdbCss['disabled'] = shouldRtl;
        mdbRtlCss['disabled'] = !shouldRtl;
      }
    } catch (e) {}

    return () => unsubscribeLang();
  });

  function validateEmail(email) {
    // Simple email regex
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleRegister() {
    error = '';
    if (!org_name.trim()) {
      error = t('Organization Name is required');
      return;
    }
    if (!phone.trim()) {
      error = t('Phone is required');
      return;
    }
    if (!email.trim()) {
      error = t('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      error = t('Invalid email address');
      return;
    }
    if (!username.trim()) {
      error = t('Username is required');
      return;
    }
    if (!password) {
      error = t('Password is required');
      return;
    }
    if (password.length < 6) {
      error = t('Password must be at least 6 characters');
      return;
    }
    try {
      await register({ org_name, username, email, password,language:currentLang,theme:"light",phone,type: 'general' });
      push('/dashboard');
    } catch (err) {
      error = err.message;
    }
  }

  function goToLogin() {
    push('/login');
  }
</script>

<div class="container-fluid p-0">
  <div class="row g-0">
    <div class="col-md-6 d-none d-md-block p-0" style="height: 100vh;">
      <img src="/img/authback.jpg" alt="Auth Background" class="w-100 h-100 object-cover" />
    </div>

    <div
      class="col-md-6"
      style="height: 100vh;display: flex; align-items: center; justify-content: center;background: #f8f9fa;">
      <div class="card" style="min-width: 300px;max-width: 400px;">
        <div class="card-body">
          <div class="text-center mb-4">
            <h2 class="fw-bold mb-1">
              <i class="bi bi-rocket-takeoff me-2 text-primary"></i>
              {t('app.title')}
            </h2>
            <h3 class="text-muted mt-3">{t('Register')}</h3>
          </div>

          {#if error}
            <div class="alert alert-danger text-center py-2">
              {error}
            </div>
          {/if}

          <!-- Language -->
          <div class="mb-3">
            <select
              class="form-select form-select-sm"
              style="border:1px solid #bbbbbb;"
              bind:value={currentLang}
              on:change={(e) => {
                const code = e.currentTarget.value;
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
              }}>
              {#each supported as s}
                <option value={s.code}>{s.label}</option>
              {/each}
            </select>
          </div>

          <div data-mdb-input-init class="form-outline mb-4">
            <input type="text" id="form2Example0" class="form-control" bind:value={org_name} />
            <label class="form-label" for="form2Example0">{t('Organization Name')}</label>
          </div>

          <div data-mdb-input-init class="form-outline mb-4">
            <input type="text" id="phone_input" class="form-control" bind:value={phone} />
            <label class="form-label" for="phone_input">{t('Phone')}</label>
          </div>
          <div data-mdb-input-init class="form-outline mb-4">
            <input type="email" id="form2Example44" class="form-control" bind:value={email} />
            <label class="form-label" for="form2Example44">{t('Email')}</label>
          </div>

          <div data-mdb-input-init class="form-outline mb-4">
            <input type="text" id="form2Example1" class="form-control" bind:value={username} />
            <label class="form-label" for="form2Example1">{t('Username')}</label>
          </div>
          <!-- Password input -->
          <div data-mdb-input-init class="form-outline mb-4">
            <input type="password" id="form2Example2" class="form-control" bind:value={password} />
            <label class="form-label" for="form2Example2">{t('Password')}</label>
          </div>

          <!-- Submit button -->
          <button data-mdb-ripple-init type="button" class="btn btn-primary btn-block mb-4" on:click={handleRegister}
            >{t('Register')}</button>

          <div class="text-center small">
            <span class="text-muted">{t('Already have an account?')}</span>
            <button class="btn btn-link p-0 ms-1" on:click={goToLogin}>
              {t('Login here')}
            </button>
          </div>

          <div class="text-center mt-4">
            <small class="text-muted" style="font-size:7pt">{t('Version')} {app_version}</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .object-cover {
    object-fit: cover;
  }
</style>
