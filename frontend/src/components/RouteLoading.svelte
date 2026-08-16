<script>
  export let params = undefined;
  void params;
</script>

<div class="erp-route-loading" aria-busy="true">
  <div class="erp-route-spinner"></div>
</div>

<style>
  .erp-route-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
  }

  .erp-route-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(15, 23, 42, 0.12);
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: erp-spin 0.7s linear infinite;
  }

  @keyframes erp-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
