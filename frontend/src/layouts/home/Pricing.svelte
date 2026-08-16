<script>
  import { t } from '../../i18n/i18n';

  export let currentLang = 'fa';
  export let subscriptionPlans = null;
  export let expandedPlans = {};
  export let planDescLines = () => [];
  export let getPlanIcon = () => ({ icon: 'bi-box', tone: 'blue' });
  export let planFeatureName = () => '';
  export let planFeatureValueText = () => '';
  export let planHasMoreFeatures = () => false;
  export let showAllPlanFeatures = () => {};
  export let onSelectPlan = () => {};

  const copy = {
    en: {
      kicker: 'Pricing',
      title: 'Simple plans for every business size',
      subtitle: 'Start small and upgrade as your team, branches, and operations grow.',
      popular: 'Most Popular',
      cost: 'cost',
      free: 'Start free',
      choose: 'Choose this plan',
      more: 'See More',
    },
    fa: {
      kicker: 'قیمت‌ها',
      title: 'پلن‌های ساده برای هر اندازه کسب‌وکار',
      subtitle: 'از کوچک شروع کنید و همراه با رشد تیم، شعبه‌ها و عملیات ارتقا دهید.',
      popular: 'محبوب‌ترین',
      cost: 'هزینه',
      free: 'شروع رایگان',
      choose: 'انتخاب این پلن',
      more: 'نمایش بیشتر',
    },
    ps: {
      kicker: 'بیې',
      title: 'د هر کاروبار لپاره ساده پلانونه',
      subtitle: 'کوچنی پیل وکړئ او د ټیم، څانګو او کارونو له ودې سره پلان لوړ کړئ.',
      popular: 'ترټولو مشهور',
      cost: 'هزینه',
      free: 'وړیا پیل',
      choose: 'دا پلان غوره کړئ',
      more: 'نور وګورئ',
    },
  };

  function planName(plan) {
    return currentLang === 'en'
      ? plan.name
      : currentLang === 'fa'
        ? plan.name_fa
        : currentLang === 'ps' && plan.name_ps
          ? plan.name_ps
          : plan.name_fa;
  }

  $: text = copy[currentLang] || copy.fa;
</script>

<section id="pricing" class="zeno-pricing">
  <div class="zeno-container zeno-container--wide">
    <div class="zeno-section-header zeno-pricing__header">
      <span class="zeno-section-kicker">{text.kicker}</span>
      <h2>{text.title}</h2>
      <p>{text.subtitle}</p>
    </div>

    <div class="zeno-pricing__grid">
      {#if subscriptionPlans}
        {#each subscriptionPlans as plan, planIndex (plan.id)}
          {@const isPopular = plan.color == 'popular' || planIndex === Math.floor(subscriptionPlans.length / 2)}
          {@const iconMeta = getPlanIcon(plan, planIndex)}
          <article class="zeno-pricing-card {isPopular ? 'zeno-pricing-card--popular' : ''}">
            {#if isPopular}
              <span class="zeno-pricing-card__ribbon">{text.popular}</span>
            {/if}

            <div class="zeno-pricing-card__icon zeno-pricing-card__icon--{iconMeta.tone}">
              <i class="bi {iconMeta.icon}"></i>
            </div>

            <h3 class="zeno-pricing-card__name">{planName(plan)}</h3>

            <ul class="zeno-pricing-card__checklist">
              {#each planDescLines(plan, currentLang) as line, lineIndex (`${plan.id}-${lineIndex}`)}
                <li
                  class="zeno-pricing-card__check-item"
                  class:zeno-pricing-card__check-item--head={lineIndex === 0}>
                  <i class="bi bi-check-circle-fill zeno-pricing-card__check-icon"></i>
                  <span class="zeno-pricing-card__check-text">{line}</span>
                </li>
              {/each}
            </ul>

            <div class="zeno-pricing-card__price-block">
              <div class="zeno-pricing-card__amount">
                {Number(plan.price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                <span class="zeno-pricing-card__currency">{t(plan.currency)}</span>
              </div>
              <div class="zeno-pricing-card__period">{text.period}</div>
              {#if plan.recurring_price}
                <div class="zeno-pricing-card__renewal">
                  {Number(plan.recurring_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(plan.currency)}
                  {t('renewal/yr')}
                </div>
              {/if}
            </div>

            {#if expandedPlans[plan.id]}
              <ul class="zeno-pricing-card__features">
                {#each plan.features ?? [] as feature (`${plan.id}-${feature.id || feature.name}`)}
                  <li class="zeno-pricing-card__feature {feature.value == 'false' ? 'zeno-pricing-card__feature--muted' : ''}">
                    {#if feature.value != 'false'}
                      <i class="{feature.icon} zeno-pricing-card__feature-icon"></i>
                      <span class="zeno-pricing-card__feature-name">{planFeatureName(feature)}</span>
                      {#if feature.value == 'true'}
                        <span class="zeno-pricing-card__badge zeno-pricing-card__badge--ok">
                          <i class="bi bi-check-circle"></i>
                          {t(feature.unit)}
                        </span>
                      {:else}
                        <span
                          class="zeno-pricing-card__badge zeno-pricing-card__badge--value"
                          dir={feature.name == 'Storage' ? 'ltr' : ''}>
                          {planFeatureValueText(feature)}
                        </span>
                      {/if}
                    {:else}
                      <i class="{feature.icon} zeno-pricing-card__feature-icon zeno-pricing-card__feature-icon--no"></i>
                      <span class="zeno-pricing-card__feature-name zeno-pricing-card__feature-name--muted">{planFeatureName(feature)}</span>
                      <span class="zeno-pricing-card__badge zeno-pricing-card__badge--no">
                        <i class="bi bi-x-circle"></i>
                        {t(feature.unit)}
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}

            {#if planHasMoreFeatures(plan)}
              <button
                type="button"
                class="zeno-pricing-card__more"
                on:click={() => showAllPlanFeatures(plan.id)}>
                {text.more}...
              </button>
            {/if}

            <button
              type="button"
              class="zeno-pricing-card__btn {isPopular ? 'zeno-pricing-card__btn--solid' : 'zeno-pricing-card__btn--outline'}"
              on:click={() => onSelectPlan(plan)}>
              {Number(plan.price || 0) === 0 ? text.free : text.choose}
            </button>
          </article>
        {/each}
      {/if}
    </div>
  </div>
</section>
