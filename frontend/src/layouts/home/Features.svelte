<script>
  export let currentLang = 'fa';
  export let featureCards = [];
  export let featureText = (value) => value;
  export let onOpenPricing = () => {};

  const sectionCopy = {
    en: {
      title: 'Powerful ERP features for daily operations',
      subtitle: 'Six core tools your team can understand quickly and use every day.',
    },
    fa: {
      title: 'ویژگی‌های قدرتمند ERP برای کارهای روزانه',
      subtitle: 'شش ابزار اصلی که تیم شما سریع یاد می‌گیرد و هر روز استفاده می‌کند.',
    },
    ps: {
      title: 'د ورځنیو کارونو لپاره پیاوړي ERP ځانګړتیاوې',
      subtitle: 'شپږ اصلي وسیلې چې ستاسو ټیم یې ژر زده کوي او هره ورځ یې کاروي.',
    },
  };

  $: text = sectionCopy[currentLang] || sectionCopy.fa;
</script>

<section id="features" class="zeno-features">
  <div class="zeno-container zeno-container--wide">
    <div class="zeno-section-header zeno-features__header">
      <span class="zeno-section-kicker">Features</span>
      <h2>{text.title}</h2>
      <p>{text.subtitle}</p>
    </div>

    <div class="zeno-features__grid">
      {#each featureCards as card (card.title.en)}
        <article class="zeno-feature-card">
          <div class="zeno-feature-card__icon-wrap zeno-feature-card__icon-wrap--{card.color}">
            <div class="zeno-feature-card__icon">
              <i class="bi {card.icon}"></i>
            </div>
          </div>
          <h3 class="zeno-feature-card__title">{featureText(card.title, currentLang)}</h3>
          <p class="zeno-feature-card__desc">{featureText(card.desc, currentLang)}</p>
          <button
            type="button"
            class="zeno-feature-card__arrow"
            aria-label={featureText(card.title, currentLang)}
            on:click={onOpenPricing}>
            <i class="bi bi-arrow-right"></i>
          </button>
        </article>
      {/each}
    </div>
  </div>
</section>
