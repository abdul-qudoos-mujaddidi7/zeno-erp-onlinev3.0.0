<script>
  export let value = '';
  export let label = 'Password';
  export let showPassword = false;
  export let showLabel = 'Show password';
  export let hideLabel = 'Hide password';
  export let onToggle = () => {};
</script>

<label class="zeno-login__field">
  <span>{label}</span>
  <div class="zeno-login__control zeno-login__password">
    <i class="bi bi-lock zeno-login__control-icon"></i>
    <input
      type={showPassword ? 'text' : 'password'}
      id="form2Example2"
      bind:value
      autocomplete="current-password" />
    <button type="button" on:click={onToggle} aria-label={showPassword ? hideLabel : showLabel}>
      <i class={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
    </button>
  </div>
</label>
