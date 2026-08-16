
<style>
    body { overflow-x: hidden; }

    /* Sidebar */
    #sidebar {
      width: 260px;
      height: 100vh;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 1050;
      transition: transform .3s ease;
    }

    [dir="rtl"] #sidebar {
      left: auto;
      right: 0;
    }

    /* Content */
    .content-wrapper {
      margin-left: 260px;
      min-width: 0 !important;
      transition: margin .3s ease;
    }

    [dir="rtl"] .content-wrapper {
      margin-left: 0;
      min-width: 0 !important;
      margin-right: 260px;
    }

    /* Mobile */
    @media (max-width: 991px) {
      #sidebar {
        transform: translateX(-100%);
      }

      [dir="rtl"] #sidebar {
        transform: translateX(100%);
      }

      #sidebar.show {
        transform: translateX(0);
      }

      .content-wrapper {
        margin: 0 !important;
      }
    }

    

    .sidebar-link {
      cursor: pointer;
      user-select: none;
    }

    .sidebar-link i {
      width: 22px;
    }
  </style>

<!-- SIDEBAR -->
<nav id="sidebar" class="bg-body-tertiary shadow">

  <!-- Sidebar Header -->
  <div class="d-flex justify-content-between align-items-center p-3 border-bottom">
    <strong class="fs-5">ERP System</strong>

    <!-- Close button (mobile only) -->
    <button class="btn btn-sm btn-outline-secondary d-lg-none" id="sidebarClose">
      <i class="bi bi-x-lg"></i>
    </button>


  </div>

  <!-- Sidebar Links -->
  <div class="list-group list-group-flush mt-2">

    <a href="#dashboard" class="list-group-item list-group-item-action sidebar-link active">
      <i class="bi bi-speedometer2 me-2"></i> Dashboard
    </a>

    <a href="#accounts" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-people me-2"></i> Accounts
    </a>

    <a href="#journals" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-journal-text me-2"></i> Journals
    </a>

    <a href="#sales" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-cart-check me-2"></i> Sales
    </a>

    <a href="#pos" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-shop me-2"></i> POS
    </a>

    <a href="#warehouses" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-box-seam me-2"></i> Warehouses
    </a>

    <a href="#purchases" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-bag-plus me-2"></i> Purchases
    </a>

    <a href="#products" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-box2 me-2"></i> Products
    </a>

    <a href="#settings" class="list-group-item list-group-item-action sidebar-link">
      <i class="bi bi-gear me-2"></i> Settings
    </a>

  </div>
</nav>

<!-- CONTENT -->
<div class="content-wrapper">

  <!-- TOP BAR -->
  <nav class="navbar navbar-light bg-body-tertiary shadow-sm px-3">
    <button class="btn btn-outline-secondary d-lg-none" id="sidebarToggle">
      <i class="bi bi-list"></i>
    </button>

    <span class="navbar-brand ms-3">Dashboard</span>

    <div class="ms-auto d-flex gap-3 align-items-center">

      <!-- RTL -->
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="rtlToggle">
        <label class="form-check-label">RTL</label>
      </div>

      <!-- Theme -->
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="themeToggle">
        <label class="form-check-label">Dark</label>
      </div>

    </div>
  </nav>

  <!-- MAIN -->
  <main class="p-4">

    <div class="row g-4">
      <div class="col-md-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <h6>Total Sales</h6>
            <h3>$12,540</h3>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <h6>Orders</h6>
            <h3>245</h3>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <h6>Products</h6>
            <h3>1,320</h3>
          </div>
        </div>
      </div>
    </div>

  </main>
</div>

<!-- MDB JS -->

<script>
  import { onMount } from 'svelte';
  onMount(() => {
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebarClose = document.getElementById("sidebarClose");
    const themeToggle = document.getElementById("themeToggle");
    const rtlToggle = document.getElementById("rtlToggle");
    const mdbCss = document.getElementById("mdb-css");
    const mdbRtlCss = document.getElementById("mdb-rtl-css");

    if (sidebarToggle && sidebar) {
      sidebarToggle.onclick = () => sidebar.classList.add("show");
    }
    if (sidebarClose && sidebar) {
      sidebarClose.onclick = () => sidebar.classList.remove("show");
    }
    if (themeToggle) {
      themeToggle.onchange = () => {
        document.documentElement.dataset.mdbTheme =
          themeToggle.checked ? "dark" : "light";
      };
    }
    if (rtlToggle) {
      rtlToggle.onchange = () => {
        if (rtlToggle.checked) {
          document.documentElement.dir = "rtl";
          if (mdbCss && mdbRtlCss) {
            mdbCss.disabled = true;
            mdbRtlCss.disabled = false;
          }
        } else {
          document.documentElement.dir = "ltr";
          if (mdbCss && mdbRtlCss) {
            mdbCss.disabled = false;
            mdbRtlCss.disabled = true;
          }
        }
      };
    }
  });
</script>
