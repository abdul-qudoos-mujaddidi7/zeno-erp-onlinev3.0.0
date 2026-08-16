<script>
  import { t } from '../../i18n/i18n';
  import PasswordInput from './PasswordInput.svelte';

  export let username = '';
  export let password = '';
  export let showPassword = false;
  export let logining = false;
  export let onTogglePassword = () => {};
  export let onSubmit = async () => {};
</script>

<form class="zeno-login__form" on:submit|preventDefault={onSubmit}>
  <label class="zeno-login__field">
    <span>{t('Username')}</span>
    <div class="zeno-login__control">
      <i class="bi bi-person zeno-login__control-icon"></i>
      <input type="text" id="form2Example1" bind:value={username} autocomplete="username" />
    </div>
  </label>

  <PasswordInput
    bind:value={password}
    {showPassword}
    label={t('Password')}
    showLabel={t('Show password')}
    hideLabel={t('Hide password')}
    onToggle={onTogglePassword} />

  <button disabled={logining} class="zeno-login__submit" type="submit">
    {#if logining}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
    {:else}
      <span>{t('Login')}</span>
      <i class="bi bi-arrow-right-short"></i>
    {/if}
  </button>
</form>
