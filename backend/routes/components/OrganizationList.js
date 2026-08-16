const DashLayout = require("./DashLayout");

function showTimeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 0) return "Just now";
  if (seconds < 60) return `${seconds}${seconds == 1 ? "S" : "S"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${minutes == 1 ? "M" : "M"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${hours == 1 ? "H" : "H"} ago`;
  const days = Math.floor(hours / 24);
  return `${days}${days == 1 ? "D" : "D"} ago`;
}

function showTimeLater(date,type="trial") {
  if (!date) return "";
  let text = type === "trial" ? "Trial ends in " : "Expires in ";
  let seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds > 0) return type === "trial" ? "Trial Expired" : "Subscription Expired";
  seconds = Math.abs(seconds);
  if (seconds < 60) return text+`${seconds}${seconds == 1 ? "S" : "S"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return text+`${minutes}${minutes == 1 ? "M" : "M"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return text+`${hours}${hours == 1 ? "H" : "H"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return text+`${days}${days == 1 ? "D" : "D"}`;
  const months = Math.floor(days / 30);
  return text+`${months}${months == 1 ? "Month" : "Months"}`;
}


function getPaginationPages(current, total, delta = 2) {
  const range = [];
  const rangeWithDots = [];

  let left = Math.max(1, current - delta);
  let right = Math.min(total, current + delta);

  for (let i = left; i <= right; i++) {
    range.push(i);
  }

  if (left > 2) rangeWithDots.push(1, "...");
  else for (let i = 1; i < left; i++) rangeWithDots.push(i);

  rangeWithDots.push(...range);

  if (right < total - 1) rangeWithDots.push("...", total);
  else for (let i = right + 1; i <= total; i++) rangeWithDots.push(i);

  return rangeWithDots;
}

module.exports = async function ListItems(req, res, db) {

	let startTime = Date.now();

  const sortColumn = req.params.sortcolumn || "id";
  const sortDir = req.params.sortdir === "ASC" ? "ASC" : "DESC";
  const type = req.params.type || "all";
  const typeFilter = type!='all' ? `type = '${type}'` : "";
  const tableName = "organizations";
  const pageName = "Organization List";
  const startAddress = "/api/superadmin/organization-list/";
  const address = `${startAddress}${sortColumn}/${sortDir}/${type}/`;
  const page = parseInt(req.params.page) || 1;
  const limit = parseInt(req.params.limit) || 100;

  if (req.session.user.username != "superadmin") {
    return res.status(403).send("Access denied");
  }
  const offset = (page - 1) * limit;

  const [orgs] = await db.query(`SELECT * FROM \`organizations\``);
  const [subscriptions] = await db.query(`SELECT * FROM \`subscriptions\``);
  const [subscription_plans] = await db.query(`SELECT * FROM \`subscription_plans\``);

  const [totalPagesQueryResult] = await db.query(
    `SELECT COUNT(*) AS count FROM ${tableName}`,
  );
  const totalRows = totalPagesQueryResult[0].count;
  const totalPages = Math.ceil(totalRows / limit);
  if (page > totalPages) {
    if (totalPages === 0) {
      return res.send(
        DashLayout(
          pageName,
          req,
          /*html*/ `

      <div class="card shadow-sm">
              <div class="card-body p-4">
                
                <p>No ${pageName.toLowerCase()} found.</p>
                </div>
                </div>
                
              </div>
              </div>

              `,
        ),
      );
    } else {
      return res.redirect(`${address}/${limit}/${totalPages}`);
    }
  }

  const pages = getPaginationPages(page, totalPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const sortableCounts = [
  'products_count',
  'sales_count',
  'purchases_count',
  'journals_count',
  'accounts_count',
  'users_count',
  'activity_logs_count'
];

let orderBy;

if (sortableCounts.includes(sortColumn)) {
  orderBy = sortColumn; // computed column
} else {
  orderBy = `o.${sortColumn}`; // normal column
}

let query = `
SELECT 
  o.*,

  COALESCE(pr.products_count, 0) AS products_count,
  COALESCE(s.sales_count, 0) AS sales_count,
  COALESCE(p.purchases_count, 0) AS purchases_count,
  COALESCE(j.journals_count, 0) AS journals_count,
  COALESCE(a.accounts_count, 0) AS accounts_count,
  COALESCE(u.users_count, 0) AS users_count,
  COALESCE(l.logs_count, 0) AS activity_logs_count

FROM ${tableName} o

LEFT JOIN (
  SELECT org_id, COUNT(*) AS products_count
  FROM products
  WHERE status != 0
  GROUP BY org_id
) pr ON pr.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS sales_count
  FROM sales
  WHERE status != 0
  GROUP BY org_id
) s ON s.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS purchases_count
  FROM purchases
  WHERE status != 0
  GROUP BY org_id
) p ON p.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS journals_count
  FROM journals
  WHERE status != 0
  GROUP BY org_id
) j ON j.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS accounts_count
  FROM accounts
  WHERE status != 0
  GROUP BY org_id
) a ON a.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS users_count
  FROM users
  WHERE status != 0
  GROUP BY org_id
) u ON u.org_id = o.id

LEFT JOIN (
  SELECT org_id, COUNT(*) AS logs_count
  FROM activity_logs
  WHERE status != 0
  GROUP BY org_id
) l ON l.org_id = o.id

${typeFilter ? `WHERE o.${typeFilter}` : ""}
ORDER BY ${orderBy} ${sortDir};
`;

  let [rows] = await db.query(query);


  let [allTypes] =  await db.query(`SELECT DISTINCT type FROM organizations WHERE type IS NOT NULL ORDER BY type ASC`);

  console.log("Orgs:", rows.length);
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `

    <div class="">
      <div class="card shadow-sm">

      <div class="card-header bg-body-tertiary border-bottom p-3">
          <div class="row g-3 align-items-center">

            <div class="col-md-6">

      <div class="text-muted small">
        Total ${totalRows} Organizations | Query Time: ${Date.now()-startTime} ms
      </div>
            </div>
              
            <div class="col-md-3 text-end">
              <select class="form-select d-inline-block w-auto" onchange="location = '${startAddress}${sortColumn}/${sortDir}/' + this.value + '/${limit}/${page}'">
                <option value='all' ${type == "all" ? "selected" : ""}>All Types</option>
                ${allTypes.map(t => `<option value='${t.type}' ${type == t.type ? "selected" : ""}>${t.type}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
  <div class="card-body p-0">
      <div class="table-responsive">
      <table class="table table-sm table-striped table-hover mb-0">
        <thead class="table-light">
          <tr>

            <th><a href="${startAddress}id/${sortColumn === 'id' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">ID ${sortColumn === 'id' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>

            <th><a href="${startAddress}name/${sortColumn === 'name' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Organization Name ${sortColumn === 'name' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}type/${sortColumn === 'type' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Type ${sortColumn === 'type' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>

            <th><a href="${startAddress}users_count/${sortColumn === 'users_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Users ${sortColumn === 'users_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}products_count/${sortColumn === 'products_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Products ${sortColumn === 'products_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}sales_count/${sortColumn === 'sales_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Sales ${sortColumn === 'sales_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}purchases_count/${sortColumn === 'purchases_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Purchases ${sortColumn === 'purchases_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}accounts_count/${sortColumn === 'accounts_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Accounts ${sortColumn === 'accounts_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}journals_count/${sortColumn === 'journals_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Journals ${sortColumn === 'journals_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}activity_logs_count/${sortColumn === 'activity_logs_count' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Activity Logs ${sortColumn === 'activity_logs_count' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>


            <th><a href="${startAddress}status/${sortColumn === 'status' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Status ${sortColumn === 'status' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th><a href="${startAddress}created_at/${sortColumn === 'created_at' && sortDir === 'DESC' ? 'ASC' : 'DESC'}/${type}/${limit}/${page}">Created Time ${sortColumn === 'created_at' ? (sortDir === 'ASC' ? '↓' : '↑') : ''}</a></th>
            <th>Subscription</th>
            <th>Actions</th>
            
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) => /*html*/ `
                <tr>
                  <td>z${row.id}</td>
                  <td>${row.name}</td>
                  <td>${row.type}</td>
                  <td>${row.users_count ? `<a href="/api/superadmin/list/users/latest_sync/DESC/${row.id}/100/1/" class="btn btn-sm btn-link px-2">${row.users_count}</a>` : ""}</td>
                  <td>${row.products_count ? `<a href="/api/superadmin/list/products/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.products_count}</a>` : ""}</td>
                  <td>${row.sales_count ? `<a href="/api/superadmin/list/sales/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.sales_count}</a>` : ""}</td>
                  <td>${row.purchases_count ? `<a href="/api/superadmin/list/purchases/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.purchases_count}</a>` : ""}</td>
                  <td>${row.accounts_count ? `<a href="/api/superadmin/list/accounts/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.accounts_count}</a>` : ""}</td>
                  <td>${row.journals_count ? `<a href="/api/superadmin/list/journals/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.journals_count}</a>` : ""}</td>
                  <td>${row.activity_logs_count ? `<a href="/api/superadmin/list/activity_logs/created_at/DESC/${row.id}/20/1/" class="btn btn-sm btn-link px-2">${row.activity_logs_count}</a>` : ""}

                  <td>${row.status}</td>

                  
                  <td>${showTimeAgo(row.created_at)} - ${new Date(row.created_at).toLocaleString()}</td>
                  <td>${subscriptions.find(s => s.org_id == row.id) ? `<div onclick="window.location='/api/superadmin/subscription/${subscriptions.find(s => s.org_id == row.id).id}/0/'" class='badge badge-${subscriptions.find(s => s.org_id == row.id).subscription_status==='active' ? 'success' : 'warning'}' style='cursor:pointer'>` + subscription_plans.find(p => p.id == subscriptions.find(s => s.org_id == row.id).plan_id)?.name + "<br>"+`${subscriptions.find(s => s.org_id == row.id).subscription_status==='active' ?showTimeLater(subscriptions.find(s => s.org_id == row.id).end_date,"expiry"):showTimeLater(subscriptions.find(s => s.org_id == row.id).trial_end_date,"trial")}` +"</div>" : `<div class='badge badge-danger'>No Subscription</div> <a href='/api/superadmin/subscription/0/${row.id}/' class='btn btn-sm btn-link p-0'><i class='bi bi-plus-circle'></i></a>`}</td>
                  <td><a href="/api/superadmin/select_org/${row.id}" class="btn btn-primary btn-sm px-2 mx-1" data-mdb-ripple-init><i class='bi bi-check-circle'></i> Select</a></td>
                  
                  </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      </div>
      </div>
      </div>
      
    </div>


    <style>.page-item.active .page-link {
  background: #0d6efd;
  border-color: #0d6efd;
  color: white;
  font-weight: bold;
}
.table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
}

</style>
  `,
    ),
  );
};
