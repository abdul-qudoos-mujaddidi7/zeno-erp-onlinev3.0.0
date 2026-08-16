<script>
  export let now = new Date();
  export let hourAngle = 0;
  export let minuteAngle = 0;
  export let secondAngle = 0;
  export let persianDate = '';
  export let englishDate = '';
</script>

<div class="erp-clock-card">
  <div class="erp-clock-visual">
    <svg viewBox="0 0 200 200" class="w-100 h-100" aria-hidden="true">
      <circle cx="100" cy="100" r="94" fill="#ffffff" stroke="#e8eef8" stroke-width="5" />
      <circle cx="100" cy="100" r="80" fill="#fbfdff" />
      {#each Array(12) as _, i}
        <line
          x1="100"
          y1="18"
          x2="100"
          y2="28"
          stroke="#94a3b8"
          stroke-width="2"
          stroke-linecap="round"
          transform="rotate({i * 30} 100 100)" />
      {/each}
      <line x1="100" y1="100" x2="100" y2="58" stroke="#0f172a" stroke-width="5" stroke-linecap="round" transform="rotate({hourAngle} 100 100)" />
      <line x1="100" y1="100" x2="100" y2="38" stroke="#0f6efd" stroke-width="3" stroke-linecap="round" transform="rotate({minuteAngle} 100 100)" />
      <line x1="100" y1="110" x2="100" y2="28" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" transform="rotate({secondAngle} 100 100)" />
      <circle cx="100" cy="100" r="5" fill="#0f6efd" />
    </svg>
  </div>
  <div class="erp-clock-meta">
    <span class="erp-clock-label"><i class="bi bi-clock"></i> زمان محلی</span>
    <h3 dir="ltr">{now.toLocaleTimeString()}</h3>
    <p dir="rtl">{persianDate}</p>
    <small dir="ltr">{englishDate}</small>
  </div>
</div>

<style>
  .erp-clock-card {
    position: relative;
    height: 100%;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.15rem;
    border: 1px solid #dce6f2;
    border-radius: 14px;
    background: #eef4fb;
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    text-align: center;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }

  .erp-clock-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(21, 32, 51, 0.075);
  }

  .erp-clock-visual {
    width: min(132px, 58vw);
    height: min(132px, 58vw);
    margin: 0 auto 0.55rem;
    filter: none;
  }

  .erp-clock-label {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    padding: 0.28rem 0.55rem;
    border: 1px solid #dce6f2;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.68);
    color: #52657d;
    font-size: 0.66rem;
    font-weight: 850;
  }

  .erp-clock-meta h3 {
    margin: 0.55rem 0 0.22rem;
    color: #172f4f;
    font-size: 1.28rem;
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .erp-clock-meta p {
    margin: 0;
    color: #2f6fed;
    font-size: 0.84rem;
    font-weight: 900;
  }

  .erp-clock-meta small {
    display: block;
    margin-top: 0.25rem;
    color: #718198;
    font-size: 0.72rem;
    font-weight: 650;
  }

  @media (max-width: 1199px) {
    .erp-clock-card {
      display: flex;
      gap: 1rem;
      align-items: center;
      justify-content: center;
      text-align: start;
    }

    .erp-clock-visual {
      width: 96px;
      height: 96px;
      margin: 0;
      flex: 0 0 auto;
    }
  }

  @media (max-width: 575px) {
    .erp-clock-card {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
