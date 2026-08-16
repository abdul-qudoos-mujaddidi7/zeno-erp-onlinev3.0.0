<script>
  export let currentLang = 'fa';
  export let currentLangLabel = 'دری';
  export let supported = [];
  export let activeNav = 'home';
  export let isAuthenticated = false;
  export let forVideo = false;
  export let onNavigate = () => {};
  export let onLogin = () => {};
  export let onDashboard = () => {};
  export let onToggleFullscreen = () => {};
  export let onLanguageSelect = () => {};

  const labels = {
    home: { en: 'Home', fa: 'خانه', ps: 'کور' },
    features: { en: 'Features', fa: 'ویژگی‌ها', ps: 'ځانګړتیاوې' },
    pricing: { en: 'Pricing', fa: 'قیمت‌ها', ps: 'بیې' },
    contact: { en: 'Contact', fa: 'تماس', ps: 'اړیکه' },
    login: { en: 'Login', fa: 'ورود به سیستم', ps: 'ننوتل' },
  };

  function label(key) {
    return labels[key]?.[currentLang] || labels[key]?.fa || labels[key]?.en;
  }
</script>

<header class="zeno-nav {forVideo ? 'd-none' : ''}">
  <div class="zeno-nav__inner">
    <div class="zeno-nav__start">
      <a href="/#" class="zeno-nav__brand" aria-label="Zeno ERP home">
        <img src="/img/logo.png" alt="ZenoERP" />
      </a>
    </div>

    <nav class="zeno-nav__links d-none d-xl-flex" aria-label="Primary navigation">
      {#each ['home', 'features', 'pricing', 'contact'] as item (item)}
        <button
          type="button"
          class="zeno-nav__link {activeNav === item ? 'zeno-nav__link--active' : ''}"
          on:click={() => onNavigate(item)}>
          {label(item)}
        </button>
      {/each}
    </nav>

    <div class="zeno-nav__actions">
      {#if isAuthenticated}
        <button class="btn zeno-btn-primary btn-sm" type="button" on:click={onDashboard}>
          Dashboard
        </button>
      {:else}
        <button class="btn zeno-btn-primary zeno-nav__login btn-sm" type="button" on:click={onLogin}>
          {label('login')}
        </button>
      {/if}

      <div class="dropdown zeno-nav__lang">
        <button
          id="showUnitDropdown"
          class="zeno-nav__lang-btn dropdown-toggle hidden-arrow"
          type="button"
          data-mdb-toggle="dropdown"
          aria-expanded="false"
          aria-label="Language">
          <i class="bi bi-globe2"></i>
          <span>{currentLangLabel}</span>
          <i class="bi bi-chevron-down zeno-nav__lang-chevron"></i>
        </button>
        <ul class="dropdown-menu shadow-sm border-0 rounded-3" style="max-height: 200px; overflow-y: auto;">
          {#each supported as s (s.code)}
            <li>
              <button
                class="dropdown-item rounded-2 {s.code === currentLang ? 'active' : ''}"
                type="button"
                on:click={() => onLanguageSelect(s.code)}>
                {s.label}
              </button>
            </li>
          {/each}
        </ul>
      </div>

      <button
        class="btn zeno-btn-ghost btn-sm d-none d-md-inline-flex"
        type="button"
        on:click={onToggleFullscreen}
        title="Fullscreen"
        aria-label="Fullscreen">
        <i class="bi bi-arrows-fullscreen"></i>
      </button>
    </div>
  </div>
</header>
