<script>
  export let currentLang = 'fa';
  export let phase = 'enter';
  export let forVideo = false;
  export let orgTypeSelected = null;
  export let shiftPressed = false;
  export let ctrlPressed = false;
  export let appVersion = '';
  export let heroImage = '/img/zeno-hero-dashboard.png';
  export let onStartFree = () => {};
  export let onLogoutClear = () => {};

  const copy = {
    en: {
      eyebrow: 'Built for everyday business work',
      title: 'Know what is happening in your business without asking five people',
      subtitle:
        'Zeno ERP keeps sales, stock, purchases, payments, and reports in one place, so owners and teams can see the same truth and act faster.',
      start: 'Start Free',
      updates: 'Free updates',
      support: '24/7 support',
      secure: 'Secure platform',
      alt: 'Zeno ERP dashboard preview',
    },

    fa: {
      eyebrow: 'ERP مدرن برای رشد کسب‌وکار',
      title: 'تمام کسب‌وکار خود را در یک سیستم ERP مدیریت کنید',
      subtitle:
        'Zeno ERP فروش، خرید، انبار، حسابداری، گزارش‌ها و دسترسی کاربران را در یک محیط ساده و قابل اعتماد کنار هم قرار می‌دهد.',
      start: 'شروع رایگان',
      updates: 'آپدیت رایگان',
      support: 'پشتیبانی ۲۴/۷',
      secure: 'پلتفرم امن',
      alt: 'پیش‌نمایش داشبورد Zeno ERP',
    },

    ps: {
      eyebrow: 'د ودې سوداګرۍ لپاره عصري ERP',
      title: 'خپل ټول کاروبار په یوه ERP سیستم کې مدیریت کړئ',
      subtitle:
        'Zeno ERP پلور، پیرود، ذخیره، حسابداري، راپورونه او د ټیم لاسرسی په یوه ساده او باوري ځای کې راټولوي.',
      start: 'وړیا پیل',
      updates: 'وړیا تازه کول',
      support: '۲۴/۷ ملاتړ',
      secure: 'خوندي پلتفرم',
      alt: 'د Zeno ERP ډشبورډ مخکتنه',
    },
  };

  $: text = copy[currentLang] || copy.fa;

  $: contentDirectionClass =
    currentLang === 'en'
      ? 'zeno-hero__enter-left'
      : 'zeno-hero__enter-right';

  $: visualDirectionClass =
    currentLang === 'en'
      ? 'zeno-hero__enter-right'
      : 'zeno-hero__enter-left';
</script>

<section class="zeno-hero">
  <div class="zeno-hero__bg" aria-hidden="true">
    <div class="zeno-hero__blob zeno-hero__blob--1"></div>
    <div class="zeno-hero__blob zeno-hero__blob--2"></div>
    <div class="zeno-hero__dots"></div>
  </div>

  <div class="zeno-container">
    {#key currentLang}
      <div class="zeno-hero__grid">
        <div
          class="zeno-hero__content {contentDirectionClass}"
        >
          <div class="zeno-hero__badge">
            <i class="bi bi-stars"></i>
            <span>{text.eyebrow}</span>
          </div>

          <h1 class="zeno-hero__title">
            {text.title}
          </h1>

          <p class="zeno-hero__subtitle">
            {forVideo
              ? 'دیتابیس مدیریتی برای هر نوع شرکت'
              : text.subtitle}
          </p>

          <div class="zeno-hero__cta">
            <button
              type="button"
              class="zeno-hero__cta-main"
              on:click={onStartFree}
            >
              <i class="bi bi-arrow-up-right"></i>
              <span>{text.start}</span>
            </button>
          </div>

          <div class="zeno-hero__trust">
            <div class="zeno-hero__trust-item">
              <span
                class="zeno-hero__trust-icon zeno-hero__trust-icon--cloud"
              >
                <i class="bi bi-cloud-arrow-up"></i>
              </span>

              <span>{text.updates}</span>
            </div>

            <div class="zeno-hero__trust-item">
              <span
                class="zeno-hero__trust-icon zeno-hero__trust-icon--support"
              >
                <i class="bi bi-headset"></i>
              </span>

              <span>{text.support}</span>
            </div>

            <div class="zeno-hero__trust-item">
              <span
                class="zeno-hero__trust-icon zeno-hero__trust-icon--secure"
              >
                <i class="bi bi-shield-check"></i>
              </span>

              <span>{text.secure}</span>
            </div>
          </div>

          {#if shiftPressed && ctrlPressed}
            <div class="zeno-hero__developer">
              <div class="zeno-hero__version">
                {appVersion}
              </div>

              <button
                class="btn btn-outline-danger btn-sm"
                type="button"
                on:click={onLogoutClear}
              >
                Logout Clear
              </button>
            </div>
          {/if}
        </div>

        <div
          class="zeno-hero__visual {visualDirectionClass}"
        >
          <div class="zeno-hero__image-wrap">
            <img
              src={heroImage}
              alt={text.alt}
              class="zeno-hero__image"
              width="800"
              height="600"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </div>
    {/key}
  </div>
</section>
<style>
  .zeno-hero {
    position: relative;
    display: flex;
    width: 100%;
    min-height: auto;
    align-items: center;
    overflow: hidden;
    padding: 46px 0 42px;
    background:
      linear-gradient(
        180deg,
        rgba(248, 251, 255, 0.95) 0%,
        rgba(255, 255, 255, 1) 100%
      );
  }

  .zeno-hero__bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .zeno-hero__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(2px);
    opacity: 0.5;
  }

  .zeno-hero__blob--1 {
    top: -170px;
    inset-inline-start: -130px;
    width: 390px;
    height: 390px;
    background:
      radial-gradient(
        circle,
        rgba(47, 111, 237, 0.18) 0%,
        rgba(47, 111, 237, 0) 70%
      );
  }

  .zeno-hero__blob--2 {
    right: -150px;
    bottom: -190px;
    width: 430px;
    height: 430px;
    background:
      radial-gradient(
        circle,
        rgba(99, 102, 241, 0.14) 0%,
        rgba(99, 102, 241, 0) 70%
      );
  }

  .zeno-hero__dots {
    position: absolute;
    top: 28px;
    right: 4%;
    width: 160px;
    height: 110px;
    opacity: 0.25;
    background-image:
      radial-gradient(
        circle,
        rgba(47, 111, 237, 0.5) 1px,
        transparent 1.5px
      );
    background-size: 14px 14px;
  }

  .zeno-container {
    position: relative;
    z-index: 2;
    width: min(100%, 1320px);
    margin-inline: auto;
    padding-inline: 20px;
  }

  .zeno-hero__grid {
    display: grid;
    grid-template-columns:
      minmax(0, 0.9fr)
      minmax(430px, 1.1fr);
    align-items: center;
    gap: 36px;
  }

  .zeno-hero__content {
    width: 100%;
    max-width: 560px;
  }

  .zeno-hero__badge {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border: 1px solid rgba(47, 111, 237, 0.14);
    border-radius: 999px;
    color: #2f6fed;
    background: rgba(47, 111, 237, 0.07);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
  }

  .zeno-hero__badge i {
    font-size: 11px;
  }

  .zeno-hero__title {
    max-width: 620px;
    margin: 13px 0 10px;
    color: #111827;
    font-size: clamp(32px, 3.7vw, 50px);
    font-weight: 800;
    line-height: 1.12;
    letter-spacing: -0.035em;
  }

  :global(html[dir='rtl']) .zeno-hero__title {
    letter-spacing: normal;
  }

  .zeno-hero__subtitle {
    max-width: 535px;
    margin: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.75;
  }

  .zeno-hero__cta {
    display: flex;
    align-items: center;
    margin-top: 18px;
  }

  .zeno-hero__cta-main {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 15px;
    border: 1px solid #2f6fed;
    border-radius: 9px;
    color: #ffffff;
    background: #2f6fed;
    box-shadow:
      0 7px 18px rgba(47, 111, 237, 0.2);
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      background-color 160ms ease;
  }

  .zeno-hero__cta-main:hover {
    background: #245ed0;
    box-shadow:
      0 9px 22px rgba(47, 111, 237, 0.25);
    transform: translateY(-1px);
  }

  .zeno-hero__cta-main:active {
    transform: translateY(0);
  }

  .zeno-hero__cta-main i {
    font-size: 12px;
  }

  :global(html[dir='rtl']) .zeno-hero__cta-main i {
    transform: scaleX(-1);
  }

  .zeno-hero__trust {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 13px;
    margin-top: 20px;
  }

  .zeno-hero__trust-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }

  .zeno-hero__trust-icon {
    display: inline-grid;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 7px;
    font-size: 11px;
  }

  .zeno-hero__trust-icon--cloud {
    color: #0f6efd;
    background: #eff6ff;
  }

  .zeno-hero__trust-icon--support {
    color: #059669;
    background: #ecfdf5;
  }

  .zeno-hero__trust-icon--secure {
    color: #7c3aed;
    background: #f5f3ff;
  }

  .zeno-hero__developer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 13px;
  }

  .zeno-hero__version {
    color: #94a3b8;
    font-size: 10px;
  }

  .zeno-hero__developer :global(.btn) {
    min-height: 29px;
    padding: 4px 8px;
    font-size: 10px;
  }

  .zeno-hero__visual {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: center;
  }

  .zeno-hero__image-wrap {
    position: relative;
    display: flex;
    width: 100%;
    max-width: 650px;
    align-items: center;
    justify-content: center;
  }

  .zeno-hero__image-wrap::before {
    position: absolute;
    inset: 12% 8%;
    z-index: -1;
    border-radius: 50%;
    background: rgba(47, 111, 237, 0.11);
    filter: blur(45px);
    content: '';
  }

  .zeno-hero__image {
    display: block;
    width: 100%;
    max-width: 650px;
    max-height: 455px;
    object-fit: contain;
    filter:
      drop-shadow(
        0 18px 30px rgba(15, 23, 42, 0.13)
      );
  }

  @media (max-width: 1199.98px) {
    .zeno-hero {
      padding-block: 42px 38px;
    }

    .zeno-hero__grid {
      grid-template-columns:
        minmax(0, 0.95fr)
        minmax(390px, 1.05fr);
      gap: 28px;
    }

    .zeno-hero__title {
      font-size: clamp(31px, 3.7vw, 45px);
    }

    .zeno-hero__image {
      max-height: 400px;
    }
  }

  @media (max-width: 991.98px) {
    .zeno-hero {
      padding-block: 38px;
    }

    .zeno-hero__grid {
      grid-template-columns: 1fr;
      gap: 30px;
    }

    .zeno-hero__content {
      max-width: 650px;
      margin-inline: auto;
      text-align: center;
    }

    .zeno-hero__subtitle {
      margin-inline: auto;
    }

    .zeno-hero__cta,
    .zeno-hero__trust,
    .zeno-hero__developer {
      justify-content: center;
    }

    .zeno-hero__visual {
      max-width: 680px;
      margin-inline: auto;
    }

    .zeno-hero__image {
      max-height: 380px;
    }
  }

  @media (max-width: 575.98px) {
    .zeno-hero {
      padding-block: 30px 34px;
    }

    .zeno-container {
      padding-inline: 13px;
    }

    .zeno-hero__grid {
      gap: 24px;
    }

    .zeno-hero__badge {
      min-height: 27px;
      font-size: 9px;
    }

    .zeno-hero__title {
      margin-top: 11px;
      font-size: 29px;
      line-height: 1.16;
    }

    .zeno-hero__subtitle {
      font-size: 12px;
      line-height: 1.7;
    }

    .zeno-hero__cta {
      margin-top: 15px;
    }

    .zeno-hero__cta-main {
      min-height: 36px;
      padding-inline: 13px;
    }

    .zeno-hero__trust {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .zeno-hero__trust-item {
      font-size: 10px;
    }

    .zeno-hero__image {
      max-height: 290px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .zeno-hero__cta-main {
      transition: none;
    }
  }


  /*
 * Initial page entrance and language-change entrance.
 * The backwards fill mode applies opacity: 0 before the
 * animation begins, preventing the first-render blink.
 */

.zeno-hero__content {
  --hero-enter-x: 55px;
  --hero-enter-y: 15px;

  opacity: 0;

  animation-name: zeno-hero-enter;
  animation-duration: 700ms;
  animation-delay: 0ms;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;

  backface-visibility: hidden;
  will-change: transform, opacity;
}

.zeno-hero__visual {
  --hero-enter-x: -65px;
  --hero-enter-y: 18px;

  opacity: 0;

  animation-name: zeno-hero-enter;
  animation-duration: 800ms;
  animation-delay: 110ms;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;

  backface-visibility: hidden;
  will-change: transform, opacity;
}

.zeno-hero__enter-left {
  --hero-enter-x: -55px;
}

.zeno-hero__visual.zeno-hero__enter-left {
  --hero-enter-x: -65px;
}

.zeno-hero__enter-right {
  --hero-enter-x: 55px;
}

.zeno-hero__visual.zeno-hero__enter-right {
  --hero-enter-x: 65px;
}

@keyframes zeno-hero-enter {
  from {
    opacity: 0;
    transform: translate3d(
      var(--hero-enter-x),
      var(--hero-enter-y),
      0
    );
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}
</style>
