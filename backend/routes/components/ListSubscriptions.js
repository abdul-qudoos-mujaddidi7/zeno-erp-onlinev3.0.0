const DashLayout = require("./DashLayout");

function showTimeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60)
    return `${seconds} ${seconds == 1 ? "second" : "seconds"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} ${minutes == 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours == 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days == 1 ? "day" : "days"} ago`;
}


function getLocalDateTime(mysqlDate) {
  if (!mysqlDate) return "";

  const date = new Date(mysqlDate);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return formatter.format(date);
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
const commandColors = {
  pending: "danger", // neutral
  sent: "warning", // red
  answered: "info", // yellow
  executed: "success", // light blue
};

function truncate(str, maxLength = 50) {
  if (!str) return "";
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}
module.exports = async function ListCommands(req, res, db) {
  let startTime = Date.now();

  const sortColumn = req.params.sortcolumn || "id";
  const sortDir = req.params.sortdir === "ASC" ? "ASC" : "DESC";
  const subscription_status = req.params.subscription_status||'all';
  const tableName = "subscriptions";
  const pageName = "Subscriptions";
  const address = `/api/superadmin/list-subscriptions/${subscription_status}/${sortColumn}/${sortDir}/`;
  const page = parseInt(req.params.page) || 1;
  const limit = parseInt(req.params.limit) || 20;
  const orgFilter =
    req.params.org && req.params.org != 0
      ? `org_id = ${db.escape(req.params.org)}`
      : "";
  let selectedOrg = req.params.org || 0;

  if (
    req.session.user.username != "superadmin" &&
    selectedOrg != req.session.user.org_id
  ) {
    return res.status(403).send("Access denied");
  }
  const offset = (page - 1) * limit;

  const [orgs] = await db.query(`SELECT * FROM \`organizations\``);
  const [org_types] = await db.query(`SELECT * FROM \`org_types\``);
  const [subscription_plans] = await db.query(`SELECT * FROM \`subscription_plans\``);

  const myHead = /*html*/ `
    <div class="">
      <div class="card shadow-sm">
        <!-- Toolbar -->
        <div class="card-header bg-body-tertiary border-bottom p-3">
          <div class="row g-3 align-items-center">

            <div class='col-md-6'>
             <select class="form-select d-inline-block w-auto" onchange="location = '/api/superadmin/list-subscriptions/' + this.value + '/${sortColumn}/${sortDir}/${selectedOrg}/${limit}/${page}'">
                <option value='all' ${subscription_status == "all" ? "selected" : ""}>All Statuses</option>
                <option value='active' ${subscription_status == "active" ? "selected" : ""}>active</option>
                <option value='trial' ${subscription_status == "trial" ? "selected" : ""}>trial</option>
                <option value='cancelled' ${subscription_status == "cancelled" ? "selected" : ""}>cancelled</option>
                <option value='suspended' ${subscription_status == "suspended" ? "selected" : ""}>suspended</option>
                <option value='inactive' ${subscription_status == "inactive" ? "selected" : ""}>inactive</option>
              </select>
              
            Query Time: ${Date.now() - startTime}



            </div>

            <div class="col-md-6 text-end">
              <select class="form-select d-inline-block w-auto" onchange="location = '${address}' + '${selectedOrg}/' + this.value + '/${page}'">
                <option value='5' ${limit == 5 ? "selected" : ""}>5 per page</option>
                <option value='10' ${limit == 10 ? "selected" : ""}>10 per page</option>
                <option value='20' ${limit == 20 ? "selected" : ""}>20 per page</option>
                <option value='50' ${limit == 50 ? "selected" : ""}>50 per page</option>
                <option value='100' ${limit == 100 ? "selected" : ""}>100 per page</option>
                <option value='250' ${limit == 250 ? "selected" : ""}>250 per page</option>
              </select>
              
              

                <a  href="/api/superadmin/subscription/0/0/" class="btn btn-dark ms-2 px-2"><i class="bi bi-plus-circle me-2"></i>New Subscription</a>
                
        </div>
      </div>
    </div>`;

  const [totalPagesQueryResult] = await db.query(
    `SELECT COUNT(*) AS count FROM ${tableName} ${orgFilter ? `WHERE ${orgFilter}` : ""} ${subscription_status!='all' ? (orgFilter?"AND":"WHERE")+` subscription_status = ${db.escape(subscription_status)}` : ""}`,
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
              ${myHead} 
              <div class="card-body p-4">
                
                <p>No ${pageName.toLowerCase()} found.</p>
                </div>
                </div>
                
              </div>

              `,
        ),
      );
    } else {
      return res.redirect(`${address}${selectedOrg}/${limit}/${totalPages}`);
    }
  }

  let orderBy;

  orderBy = sortColumn; // computed column
  const pages = getPaginationPages(page, totalPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  let query = `SELECT *
FROM ${tableName} ${subscription_status!='all' ? "WHERE subscription_status = " + db.escape(subscription_status) : ""} ORDER BY ${orderBy} ${sortDir} LIMIT ${limit} OFFSET ${offset}`;

  let [rows] = await db.query(query);

  console.log("Error LOGS:", rows.length);
  res.send(
    DashLayout(
      pageName,
      req,
      myHead +
        /*html*/ `
  <div class="card-body p-0">
      <div class="table-responsive">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>Org</th>
            <th>plan</th>
            <th>start_date</th>
            <th>end_date</th>
            <th>next_billing_date</th>
            <th>subscription_status</th>
            <th>auto_renew</th>
            <th>trial_end_date</th>
            <th>cancelled_at</th>
            <th>price_override</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) => /*html*/ `
                <tr>
                  <td>${i + 1 + offset}</td>
                 

                  <td>${orgs.find((ot) => ot.id === row.org_id)?.name || 'N/A'} (z${row.org_id})</td>
                  <td>${subscription_plans.find((sp) => sp.id === row.plan_id)?.name || 'N/A'}</td>
                  <td>${getLocalDateTime(row.start_date)}</td>
                  <td>${getLocalDateTime(row.end_date)}</td>
                  <td>${getLocalDateTime(row.next_billing_date)}</td>
                  <td>${row.subscription_status}</td>
                  <td>${row.auto_renew}</td>
                  <td>${getLocalDateTime(row.trial_end_date)}</td>
                  <td>${getLocalDateTime(row.cancelled_at)}</td>
                  <td>${row.price_override?Number(row.price_override).toLocaleString()+" "+row.currency:''}</td>
                  <td>
                    <a href="/api/superadmin/invoices/${row.id}/" class="btn btn-sm btn-outline-info"><i class="bi bi-receipt"></i> Invoices</a>  
                    <a href="/api/superadmin/subscription/${row.id}/0/" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> View</a>  
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
      </div>
      </div>


      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
      <div class="text-muted small">
        Showing ${offset + 1} to ${Math.min(offset + limit, totalRows)} of ${totalRows} ${pageName.toLowerCase()}
      </div>
      <nav>
        <ul class="pagination">
          <li class="page-item ${page <= 1 ? "disabled" : ""}">
            <a class="page-link" href="${address}${selectedOrg}/${limit}/${prevPage}">Previous</a>
          </li>
          ${pages
            .map((p) => {
              if (p === "...") {
                return `<li class="page-item disabled">
                <span class="page-link">...</span>
              </li>`;
              }

              return `
      <li class="page-item ${p === page ? "active" : ""}">
        <a class="page-link" href="${address}${selectedOrg}/${limit}/${p}">
          ${p}
        </a>
      </li>
    `;
            })
            .join("")}
          <li class="page-item ${page >= totalPages ? "disabled" : ""}">
            <a class="page-link" href="${address}${selectedOrg}/${limit}/${nextPage}">Next</a>
          </li>
        </ul>
      </nav>
    </div>
      </div>
      
    </div>

    <style>.page-item.active .page-link {
  background: #0d6efd;
  border-color: #0d6efd;
  color: white;
  font-weight: bold;
}</style>
  `,
    ),
  );
};
