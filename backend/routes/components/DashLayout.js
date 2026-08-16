
const pageIcons = {
  Dashboard: "bi-speedometer2",
  Organizations: "bi-building",
  Users: "bi-people",
  "Sync Logs": "bi-clock",
  Warehouses: "bi-archive",
  Products: "bi-box-seam",
  "Product Categories": "bi-tags",
  "Product Units": "bi-rulers",
  "Product Brands": "bi-bricks",
  "Product Generics": "bi-box2-heart",
  Currencies: "bi-currency-exchange",
  Sales: "bi-cart",
  Purchases: "bi-bag",
  Accounts: "bi-wallet",
  Journals: "bi-book",
  "Activity Logs": "bi-list-task",
  Settings: "bi-gear",
  "Stock Transactions": "bi-arrow-left-right",
  Wastes: "bi-trash",
  "Stock Transfers": "bi-arrows-move",
  "Commands": "bi-terminal",
  "Commands List": "bi-terminal",
  "Error Logs": "bi-bug",
  "Command": "bi-terminal",
  "Command Details": "bi-terminal",

};

module.exports = function DashLayout(page = "404 Not Found", req, content = "404 Not Found!") {
  return /*html*/ `

    <!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${page} - ZenoERP SuperAdmin Dashboard</title>

    <link id="mdb-css" href="/css/mdb.min.css" rel="stylesheet" />
    <link id="mdb-rtl-css" href="/css/mdb.rtl.min.css" rel="stylesheet" disabled />
    <link rel="stylesheet" href="/css/bootstrap-icons.min.css" />

    <link id="mdb-rtl-css" href="/css/mds.bs.datetimepicker.style.css" rel="stylesheet" />
    
  <style>
    body {  }

    .sidebar {
      height: 100vh;
      color: white;
      position: fixed;
    }

    .sidebar a {
      color: #ffffff;
      display: block;
      padding: 6px 8px;
      border-radius: 8px;
      margin: 4px 8px;
      text-decoration: none;
    }

    .sidebar a:hover, .sidebar a.active {
      background: #3566b6;
      color: white;
    }

    .card {
      border-radius: 16px;
    }

    .topbar {
      background: white;
      border-bottom: 1px solid #eee;
    }

    @media(max-width: 3768px) {
      .sidebar {
        position: fixed;
        left: -100%;
        width: 240px;
        transition: 0.3s;
        z-index: 1000;
      }

      .sidebar.active {
        left: 0;
      }

      .sidebar-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.4);
        z-index: 999;
        display: none;
      }

      .sidebar-overlay.active {
        display: block;
      }
    }
  </style>

    <link rel="stylesheet" href="/fonts/vazirmatn.css" />
  </head>

  <body>


<div id="overlay" class="sidebar-overlay" onclick="toggleSidebar()"></div>

<div class="container-fluid">
  <div class="row">

    <!-- Sidebar -->
    <div class="col-md-2 sidebar p-2 bg-primary overflow-y-auto no-print" id="sidebar">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="mb-0">Menu</h5>
        <button class="btn btn-sm btn-light" onclick="toggleSidebar()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <h5 class="mb-2 text-center">${req.session.user.username=='superadmin' ? `Super Admin` : 'Back Office'}</h5>
      ${
        req.session.user.org_id
          ? `<p class="text-center"><strong>${req.session.user.org_name}</strong>${req.session.user.username=='superadmin' ? `<a href="/api/superadmin/select_org/0" class="text-danger d-inline mx-0" data-mdb-ripple-init><i class='bi bi-x-circle'></i></a>` : ''} </p> 
    `
          : ""
      }
      <a ${page == "Dashboard" ? "class='active'" : ""} href="/api/superadmin/dashboard"><i class="bi bi-speedometer2 me-2"></i>Dashboard</a>
      ${req.session.user.username == "superadmin" ? `<a ${page == "Organizations" ? "class='active'" : ""} href="/api/superadmin/organizations"><i class="bi bi-building me-2"></i>Organizations</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Org Types" ? "class='active'" : ""} href="/api/superadmin/list-org-types/all/id/DESC/0/20/1"><i class="bi bi-building me-2"></i>Organization Types</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Features" ? "class='active'" : ""} href="/api/superadmin/list-features/all/id/DESC/0/20/1"><i class="bi bi-building me-2"></i>Features</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Subscription Plans" ? "class='active'" : ""} href="/api/superadmin/list-subscription-plans/all/id/ASC/0/20/1"><i class="bi bi-building me-2"></i>Subscription Plans</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Subscriptions" ? "class='active'" : ""} href="/api/superadmin/list-subscriptions/all/id/DESC/0/20/1"><i class="bi bi-clipboard me-2"></i>Subscriptions</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Organization List" ? "class='active'" : ""} href="/api/superadmin/organization-list/id/DESC/all/100/1"><i class="bi bi-list me-2"></i>Organization List</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Error Logs" ? "class='active'" : ""} href="/api/superadmin/list-error-logs/error_logs/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-bug me-2"></i>Error Logs</a>`:""}
      ${req.session.user.username == "superadmin" ? `<a ${page == "Commands List" ? "class='active'" : ""} href="/api/superadmin/list-commands/all/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-terminal me-2"></i>Commands List</a>`:""}
      <a ${page == "Users" ? "class='active'" : ""} href="/api/superadmin/list/users/latest_sync/DESC/${req.session.user.org_id}/100/1/"><i class="bi bi-people me-2"></i>Users</a>
      <a ${page == "Sync Logs" ? "class='active'" : ""} href="/api/superadmin/list/sync_logs/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-clock me-2"></i>Sync Logs</a>
      <a ${page == "Warehouses" ? "class='active'" : ""} href="/api/superadmin/list/warehouses/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-archive me-2"></i>Warehouses</a>
      <a ${page == "Products" ? "class='active'" : ""} href="/api/superadmin/list/products/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-box-seam me-2"></i>Products</a>
      <a ${page == "Product Images" ? "class='active'" : ""} href="/api/superadmin/list/product_images/created_at/DESC/${req.session.user.org_id}/5/1/"><i class="bi bi-image me-2"></i>Product Images</a>
      <a ${page == "Product Categories" ? "class='active'" : ""} href="/api/superadmin/list/product_categories/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-tags me-2"></i>Product Categories</a>
      <a ${page == "Product Units" ? "class='active'" : ""} href="/api/superadmin/list/product_units/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-rulers me-2"></i>Product Units</a>
      <a ${page == "Product Brands" ? "class='active'" : ""} href="/api/superadmin/list/product_brands/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-bricks me-2"></i>Product Brands</a>
      <a ${page == "Product Generics" ? "class='active'" : ""} href="/api/superadmin/list/product_generics/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-box2-heart me-2"></i>Product Generics</a>
      <a ${page == "Currencies" ? "class='active'" : ""} href="/api/superadmin/list/currencies/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-currency-exchange me-2"></i>Currencies</a>
      <a ${page == "Sales" ? "class='active'" : ""} href="/api/superadmin/list/sales/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-cart me-2"></i>Sales</a>
      <a ${page == "Purchases" ? "class='active'" : ""} href="/api/superadmin/list/purchases/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-bag me-2"></i>Purchases</a>
      <a ${page == "Accounts" ? "class='active'" : ""} href="/api/superadmin/list/accounts/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-wallet me-2"></i>Accounts</a>
        <a ${page == "Account Groups" ? "class='active'" : ""} href="/api/superadmin/list/account_groups/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-wallet me-2"></i>Account Groups</a>
      <a ${page == "Journals" ? "class='active'" : ""} href="/api/superadmin/list/journals/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-book me-2"></i>Journals</a>
      <a ${page == "Activity Logs" ? "class='active'" : ""} href="/api/superadmin/list/activity_logs/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-list-task me-2"></i>Activity Logs</a>
      <a ${page == "Settings" ? "class='active'" : ""} href="/api/superadmin/list/settings/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-gear me-2"></i>Settings</a>
 <a ${page == "Stock Transactions" ? "class='active'" : ""} href="/api/superadmin/list/stock_transactions/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-arrow-left-right me-2"></i>Stock Transactions</a>
 <a ${page == "Wastes" ? "class='active'" : ""} href="/api/superadmin/list/wastes/created_at/DESC/${req.session.user.org_id}/20/1/"><i class="bi bi-trash me-2"></i>Wastes</a>

 <a ${page == "Stock Transfers" ? "class='active'" : ""} href="/api/superadmin/list/stock_transfers/${req.session.user.org_id}/20/1/"><i class="bi bi-arrows-move me-2"></i>Stock Transfers</a>

      

    </div>

    <!-- Main Content -->
    <div class="col-md-12 ms-sm-auto p-0">

      <!-- Topbar -->
      <div class="topbar d-flex justify-content-between align-items-center px-3 py-2 bg-body-tertiary no-print">
      <span>
        <button class="btn btn-light px-3" onclick="toggleSidebar()">
          <i class="bi bi-list"></i> 
        </button>

        <button class="btn btn-link px-2" onclick="">
          <i class="bi bi-rocket-takeoff"></i>
        ZenoERP
        </button>
      </span>

        <h5 class="mb-0"><i class="bi ${pageIcons[page] || "bi-question-circle"}"></i> ${page}</h5>
        <button class="btn btn-sm btn-primary px-2" onclick="location.reload()"><i class="bi bi-arrow-clockwise"></i><span class="d-none d-sm-inline"> Refresh</span></button>

        <div>
          <div class="dropdown">
        <a
          data-mdb-dropdown-init
          class="dropdown-toggle d-flex align-items-center hidden-arrow"
          href="#"
          id="navbarDropdownMenuAvatar"
          role="button"
          aria-expanded="false"
        >
          <span class="fs-5">${req.session.user.username} <i class="bi bi-person-circle"></i></span>
        <ul
          class="dropdown-menu dropdown-menu-end"
          aria-labelledby="navbarDropdownMenuAvatar"
        >
          <li>
            <a class="dropdown-item" href="/api/superadmin/logout"><i class="bi bi-box-arrow-right me-2"></i>Logout</a>
          </li>
        </ul>
      </div>
        </div>
      </div>

      <!-- Content -->
      <div class="p-3">
        ${content}
      </div>
    </div>
  </div>
</div>
    <script src="/js/mdb.umd.min.js"></script>
    <script>
      window.bootstrap = mdb;
      function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('overlay').classList.toggle('active');
      }

      function clearDatabaseAndContinue(data) {
  const request = indexedDB.deleteDatabase('ERPDatabase');

  request.onsuccess = () => {
    console.log("Database deleted");
    proceedLogin(data);
  };

  request.onerror = () => {
    alert("DB deletion failed");
    console.warn("DB deletion failed");
    proceedLogin(data);
  };

  request.onblocked = () => {
    alert("DB deletion blocked (open connections?)");
    console.warn("DB deletion blocked (open connections?)");
    proceedLogin(data);
  };
}

function proceedLogin(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user_id', data.user_id);
  localStorage.setItem('org_id', data.org_id);
  localStorage.setItem('username', data.username);
  localStorage.setItem('last_synced_org', data.org_id); // 🔥 IMPORTANT

  if (data.language) localStorage.setItem('lang', data.language);
  if (data.theme) localStorage.setItem('theme', data.theme);

  // window.location.href = '/#/dashboard';
  window.open('/#/dashboard', '_blank');
}

function loginAsUser(username) {
  fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password: "", superadmin: "me@2020" })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.token) {
      alert("Error: " + JSON.stringify(data, null, 2));
      return;
    }

    const prevSyncedOrg = localStorage.getItem('last_synced_org');

    if (prevSyncedOrg && String(prevSyncedOrg) !== String(data.org_id)) {
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}

      alert("Wrong org detected, clearing local DB...");
      clearDatabaseAndContinue(data);
    } else {
      proceedLogin(data);
    }
  })
  .catch(err => {
    alert("ERROR! " + JSON.stringify(err, null, 2));
  });
}
    </script>

    <script src="/js/mds.bs.datetimepicker.js"></script>

    <script>

      // document.documentElement.dataset.mdbTheme = "dark";
    </script>



  </body>
</html>

`;
}
