<script>
  import './login.css';
  import LoginCard from './LoginCard.svelte';

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
</script>

<main class="zeno-login" dir={currentLang === 'en' ? 'ltr' : 'rtl'}>
  <div class="zeno-login__bg" aria-hidden="true">
    <div class="zeno-login__blob zeno-login__blob--1"></div>
    <div class="zeno-login__blob zeno-login__blob--2"></div>
    <div class="zeno-login__dots"></div>
    <div class="zeno-login__mock zeno-login__mock--sales">
      <span></span>
      <strong></strong>
      <em></em>
    </div>
    <div class="zeno-login__mock zeno-login__mock--report">
      <span></span>
      <strong></strong>
      <em></em>
    </div>
  </div>

  <LoginCard
    bind:currentLang
    {supported}
    bind:username
    bind:password
    {showPassword}
    {logining}
    {error}
    {appVersion}
    {showClearButton}
    {onBack}
    {onRegister}
    {onClear}
    {onLanguageChange}
    {onTogglePassword}
    {onSubmit} />
</main>
