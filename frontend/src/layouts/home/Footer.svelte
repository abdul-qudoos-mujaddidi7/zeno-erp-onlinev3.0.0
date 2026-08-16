<script>
  import { t } from '../../i18n/i18n';

  export let currentLang = 'fa';

  const copy = {
    en: {
      about: 'About ERP',
      contact: 'Contact',
      aboutText:
        'Smart ERP solution for modern businesses. Manage inventory, finance, users, reports, and operations in one platform.',
      downloads: 'Downloads',
      printerDrivers: 'Printer Drivers',
      printerDriversDesc: 'POS / Receipt Printers',
      zenoDesk: 'ZenoDesk',
      zenoDeskDesc: 'Remote Desktop Software',
      firefox: 'Firefox',
      firefoxDesc: 'Web Browser',
      rights: 'All rights reserved.',
    },
    fa: {
      about: 'درباره ERP',
      contact: 'تماس',
      aboutText:
        'راهکار هوشمند ERP برای کسب‌وکارهای مدرن؛ مدیریت انبار، مالی، کاربران، گزارش‌ها و عملیات در یک پلتفرم.',
      downloads: 'دانلودها',
      printerDrivers: 'Printer Drivers',
      printerDriversDesc: 'درایورهای POS / رسید',
      zenoDesk: 'ZenoDesk',
      zenoDeskDesc: 'نرم‌افزار دسکتاپ از راه دور',
      firefox: 'Firefox',
      firefoxDesc: 'مرورگر وب',
      rights: 'تمام حقوق محفوظ است.',
    },
    ps: {
      about: 'د ERP په اړه',
      contact: 'اړیکه',
      aboutText:
        'د عصري کاروبارونو لپاره هوښیار ERP؛ ذخیره، مالي، کاروونکي، راپورونه او عملیات په یوه پلتفرم کې.',
      downloads: 'ډاونلوډونه',
      printerDrivers: 'Printer Drivers',
      printerDriversDesc: 'د POS / رسید پرنټرونه',
      zenoDesk: 'ZenoDesk',
      zenoDeskDesc: 'د لرې ډیسکتاپ سافټویر',
      firefox: 'Firefox',
      firefoxDesc: 'ویب براوزر',
      rights: 'ټول حقوق خوندي دي.',
    },
  };

  $: text = copy[currentLang] || copy.fa;
</script>

<footer id="contact" class="zeno-footer pt-5 pb-4" dir={currentLang === 'en' ? 'ltr' : 'rtl'}>
  <div class="zeno-hero__bg" aria-hidden="true">
    <div class="zeno-hero__blob zeno-hero__blob--1"></div>
    <div class="zeno-hero__blob zeno-hero__blob--2"></div>
    <div class="zeno-hero__dots"></div>
  </div>

  <div class="zeno-container">
    <div class="zeno-footer__grid">
      <div class="zeno-footer__col zeno-footer__col--about">
        <h5 class="footer-title mb-4">{text.about}</h5>
        <div class="d-flex align-items-center mb-3">
          <img src="/img/logo.png" alt="ZenoERP" height="40" class="me-2" />
        </div>
        <p class="text-muted small mb-4">{text.aboutText}</p>
        <div class="d-flex gap-2 social-links flex-wrap">
          <a href="https://www.facebook.com/ZenoERP/" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="Facebook">
            <i class="bi bi-facebook"></i>
          </a>
          <a href="https://www.instagram.com/zenoerp/" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="Instagram">
            <i class="bi bi-instagram"></i>
          </a>
          <a href="https://www.tiktok.com/@zenoerp" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="TikTok">
            <i class="bi bi-tiktok"></i>
          </a>
          <a href="https://www.youtube.com/@zenoerp" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="YouTube">
            <i class="bi bi-youtube"></i>
          </a>
          <a href="https://t.me/zenoerp" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="Telegram">
            <i class="bi bi-telegram"></i>
          </a>
          <a href="https://x.com/zenoerp" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="X">
            <i class="bi bi-twitter-x"></i>
          </a>
        </div>
      </div>

      <div class="zeno-footer__col zeno-footer__col--downloads">
        <h5 class="footer-title mb-4">{text.downloads}</h5>
        <div class="zeno-footer__downloads-list">
          <a href="https://zenoerp.com/ZenoERPPrinterDrivers.zip" class="download-card">
            <div>
              <div class="fw-semibold">{text.printerDrivers}</div>
              <small class="text-muted">{text.printerDriversDesc}</small>
            </div>
            <i class="bi bi-download"></i>
          </a>
          <a href="https://zenoerp.com/zenodesk-1.4.6-x86_64.exe" class="download-card">
            <div>
              <div class="fw-semibold">{text.zenoDesk}</div>
              <small class="text-muted">{text.zenoDeskDesc}</small>
            </div>
            <i class="bi bi-download"></i>
          </a>
          <a href="https://zenoerp.com/FirefoxSetup150.0.3.msi" class="download-card">
            <div>
              <div class="fw-semibold">{text.firefox}</div>
              <small class="text-muted">{text.firefoxDesc}</small>
            </div>
            <i class="bi bi-download"></i>
          </a>
        </div>
      </div>

      <div class="zeno-footer__col zeno-footer__col--contact">
        <h5 class="footer-title mb-4">{text.contact}</h5>
        <ul class="list-unstyled footer-links">
          <li class="mb-3">
            <i class="bi bi-globe2 me-2"></i>
            <a href="https://zenoerp.com" target="_blank" rel="noopener noreferrer">zenoerp.com</a>
          </li>
          <li class="mb-3">
            <i class="bi bi-envelope-fill me-2"></i>
            <a href="mailto:support@zenoerp.com">support@zenoerp.com</a>
          </li>
          <li class="mb-3">
            <i class="bi bi-telephone-fill me-2"></i>
            <a href="https://wa.me/93704495743" target="_blank" rel="noopener noreferrer" dir="ltr">+93 70 449 5743</a>
          </li>
          <li class="mb-3">
            <i class="bi bi-clock-fill me-2"></i>
            <span>{t('24/7 Customer Support')}</span>
          </li>
        </ul>
      </div>
    </div>

    <hr class="my-4 opacity-25" />

    <div class="d-flex flex-column flex-md-row justify-content-between align-items-center small text-muted">
      <div>© {new Date().getFullYear()} ZENO ERP. {text.rights}</div>
      <div class="mt-2 mt-md-0">
        Powered By <a href="https://zulnun.com" target="_blank" rel="noopener noreferrer" class="text-decoration-underline">Zulnun IT & Software Services Company</a>
      </div>
    </div>
  </div>
</footer>
