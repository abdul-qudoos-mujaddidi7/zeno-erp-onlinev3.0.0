<script>
  export let currentLang = 'fa';
  export let supported = [];
  export let onChange = () => {};

  $: currentLangLabel = supported.find((s) => s.code === currentLang)?.label || currentLang;
</script>

<div class="dropdown zeno-login__lang">
  <button
    id="loginLangDropdown"
    class="zeno-login__lang-btn dropdown-toggle hidden-arrow"
    type="button"
    data-mdb-toggle="dropdown"
    aria-expanded="false"
    aria-label="Language">
    <i class="bi bi-globe2"></i>
    <span>{currentLangLabel}</span>
    <i class="bi bi-chevron-down zeno-login__lang-chevron"></i>
  </button>
  <ul class="dropdown-menu shadow-sm border-0 rounded-3" style="max-height: 200px; overflow-y: auto;">
    {#each supported as s (s.code)}
      <li>
        <button
          class="dropdown-item rounded-2 {s.code === currentLang ? 'active' : ''}"
          type="button"
          on:click={() => onChange(s.code)}>
          {s.label}
        </button>
      </li>
    {/each}
  </ul>
</div>
