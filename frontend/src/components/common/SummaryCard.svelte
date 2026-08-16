<script>
  export let label = '';
  export let value = '';
  export let icon = 'bi-grid';
  export let tone = 'blue';
</script>

<div class="summary-card {tone}">
  <div class="summary-icon">
    <i class="bi {icon}"></i>
  </div>
  <div class="summary-content">
    <div class="summary-label">{label}</div>
    <div class="summary-value">
      <slot>{@html value}</slot>
    </div>
  </div>
</div>

<style>
  .summary-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: clamp(3.75rem, 5vw, 4.25rem);
    padding: clamp(0.5rem, 0.8vw, 0.65rem);
    border: 1px solid #e5edf6;
    border-radius: var(--card-radius, 0.8rem);
    background: #fff;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.03);
    min-width: 0;
  }

  .summary-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: clamp(1.75rem, 2.2vw, 2rem);
    height: clamp(1.75rem, 2.2vw, 2rem);
    border-radius: 10px;
    color: #0f6efd;
    background: #eff6ff;
    font-size: 0.9rem;
  }

  .summary-content {
    min-width: 0;
  }

  .summary-label {
    margin-bottom: 0.15rem;
    color: #64748b;
    font-size: var(--app-font-xs, 0.68rem);
    font-weight: 700;
  }

  .summary-value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #0f172a;
    font-size: var(--control-font, 0.86rem);
    font-weight: 800;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .green .summary-icon {
    color: #059669;
    background: #ecfdf5;
  }

  .amber .summary-icon {
    color: #d97706;
    background: #fffbeb;
  }

  .purple .summary-icon {
    color: #7c3aed;
    background: #f5f3ff;
  }

  .cyan .summary-icon {
    color: #0891b2;
    background: #ecfeff;
  }
</style>
