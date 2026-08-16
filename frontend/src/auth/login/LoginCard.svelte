<script>
  import { t } from '../../i18n/i18n';
  import LanguageSelect from './LanguageSelect.svelte';
  import LoginForm from './LoginForm.svelte';

  export let currentLang = 'fa';
  export let supported = [];
  export let username = '';
  export let password = '';
  export let showPassword = false;
  export let logining = false;
  export let error = null;
  export let appVersion = '';
  export let showClearButton = false;
  export let onBack = () => {};
  export let onRegister = () => {};
  export let onClear = () => {};
  export let onLanguageChange = () => {};
  export let onTogglePassword = () => {};
  export let onSubmit = async () => {};

  $: backLabel =
    currentLang === 'en' ? 'Back to website' : currentLang === 'ps' ? 'وېبپاڼې ته ستنیدل' : 'بازگشت به سایت';
  $: intro =
    currentLang === 'en'
      ? 'Welcome back. Sign in to continue managing your business.'
      : currentLang === 'ps'
        ? 'ښه راغلاست. خپل کاروبار مدیریت کولو لپاره ننوځئ.'
        : 'خوش آمدید. برای ادامه مدیریت کسب‌وکار خود وارد شوید.';
</script>

<section class="zeno-login__card animate__animated animate__fadeInUp" aria-labelledby="login-title">
  <div class="zeno-login__topbar">
    <button type="button" class="zeno-login__back" on:click={onBack}>
      <i class="bi bi-arrow-left-short"></i>
      <span>{backLabel}</span>
    </button>

    <LanguageSelect {currentLang} {supported} onChange={onLanguageChange} />
  </div>

  <div class="zeno-login__brand">
    <div class="zeno-login__logo-wrap">
      <img src="/img/logo.png" alt="ZenoERP" class="zeno-login__logo" />
    </div>
    <span class="zeno-login__eyebrow">Zeno ERP</span>
    <h1 id="login-title">{t('Login to System')}</h1>
    <p>{intro}</p>
  </div>

  {#if error}
    <div class="zeno-login__error" role="alert">
      {error}
    </div>
  {/if}

  <LoginForm
    bind:username
    bind:password
    {showPassword}
    {logining}
    {onTogglePassword}
    {onSubmit} />

  <p class="zeno-login__register">
    <span>{t("Don't have an account?")}</span>
    <button type="button" on:click={onRegister}>{t('Register here')}</button>
  </p>

  {#if showClearButton}
    <button class="zeno-login__danger" type="button" on:click={onClear}>
      {t('Logout Clear')}
    </button>
  {/if}

 
</section>
