<script>
  import { login, logoutClear } from './authService';
  import { push } from 'svelte-spa-router';
  import { setLanguage, isRTL, lang, supported, setTranslateOrgType } from '../i18n/i18n';
  import { onMount, onDestroy } from 'svelte';
  import LoginPage from './login/LoginPage.svelte';
  import { useLightPageTheme } from '../stores/themeStore.js';

  onMount(useLightPageTheme);

  import { app_version } from '../config.js';

  let error = null;

  let logining = false;
  let username = '';
  let password = '';
  let currentLang = localStorage.getItem('lang') || 'fa';

  let shiftPressed = false;
  let ctrlPressed = false;

  // get shift key status for sidebar toggle
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  // subscribe to language changes for reactive updates
  const unsubscribeLang = lang.subscribe((v) => (currentLang = v));

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    unsubscribeLang();
  });
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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // Initialize language and theme from localStorage
    try {
      const storedLang = localStorage.getItem('lang') || 'fa';
      setLanguage(storedLang);
      setTranslateOrgType(localStorage.getItem('org_type') || 'general');
      const shouldRtl = isRTL(storedLang);
      document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
      const mdbCss = document.getElementById('mdb-css');
      const mdbRtlCss = document.getElementById('mdb-rtl-css');
      if (mdbCss && mdbRtlCss) {
        mdbCss['disabled'] = shouldRtl;
        mdbRtlCss['disabled'] = !shouldRtl;
      }
    } catch (e) {}

  });

  async function handleLogin() {
    try {
      await login(username, password);
      push('/dashboard');
    } catch (err) {
      error = err.message || 'Login failed';
    }
  }

  function goToHome() {
    push('/');
  }

  function handleLanguageChange(code) {
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
  }

  let showPassword = false;
  function togglePassword() {
    showPassword = !showPassword;
  }
</script>

<LoginPage
  bind:currentLang
  {supported}
  bind:username
  bind:password
  {showPassword}
  {logining}
  {error}
  appVersion={app_version}
  showClearButton={shiftPressed && ctrlPressed}
  onBack={goToHome}
  onRegister={goToHome}
  onClear={logoutClear}
  onLanguageChange={handleLanguageChange}
  onTogglePassword={togglePassword}
  onSubmit={async () => {
    logining = true;
    await handleLogin();
    logining = false;
  }} />
