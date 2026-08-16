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
const logColors = {
  log: "secondary", // neutral
  error: "danger", // red
  warn: "warning", // yellow
  info: "info", // light blue
  debug: "primary", // dark/low priority
  "uncaught-error": "danger", // critical → same as error
  "unhandled-promise": "warning", // async issues → warning
};

function truncate(str, maxLength = 50) {
  if (!str) return "";
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}
module.exports = async function ListErrorLogs(req, res, db) {
  let startTime = Date.now();

  const sortColumn = req.params.sortcolumn || "id";
  const sortDir = req.params.sortdir === "ASC" ? "ASC" : "DESC";
  const log_type = req.params.logtype||'error_logs';
  const tableName = "error_logs";
  const pageName = tableName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const address = `/api/superadmin/list-error-logs/${log_type}/${sortColumn}/${sortDir}/`;
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

  const myHead = /*html*/ `
    <div class="">
      <div class="card shadow-sm">
        <!-- Toolbar -->
        <div class="card-header bg-body-tertiary border-bottom p-3">
          <div class="row g-3 align-items-center">

            <div class="col-md-4">
            ${
              req.session.user.username == "superadmin"
                ? /*html*/ `
              <select class="form-select d-inline-block w-auto" onchange="location = '${address}' + this.value + '/${limit}/${page}'">
              <option value='0' ${selectedOrg == 0 ? "selected" : ""}>All Organizations</option>
                ${orgs
                  .map(
                    (org) => `
                      <option value='${org.id}' ${selectedOrg == org.id ? "selected" : ""}>${org.name}</option>
                    `,
                  )
                  .join("")}
              </select>
              `
                : ""
            }
            </div>
            <div class='col-md-4'>
             <select class="form-select d-inline-block w-auto" onchange="location = '/api/superadmin/list-error-logs/' + this.value + '/${sortColumn}/${sortDir}/${selectedOrg}/${limit}/${page}'">
                <option value='error_logs' ${log_type == "error_logs" ? "selected" : ""}>All Types</option>
                <option value='log' ${log_type == "log" ? "selected" : ""}>log</option>
                <option value='error' ${log_type == "error" ? "selected" : ""}>error</option>
                <option value='warn' ${log_type == "warn" ? "selected" : ""}>warn</option>
                <option value='info' ${log_type == "info" ? "selected" : ""}>info</option>
                <option value='debug' ${log_type == "debug" ? "selected" : ""}>debug</option>
                <option value='uncaught-error' ${log_type == "uncaught-error" ? "selected" : ""}>uncaught-error</option>
                <option value='unhandled-promise' ${log_type == "unhandled-promise" ? "selected" : ""}>unhandled-promise</option>
              </select>
              
            Query Time: ${Date.now() - startTime}



            </div>

            <div class="col-md-4 text-end">
              <select class="form-select d-inline-block w-auto" onchange="location = '${address}' + '${selectedOrg}/' + this.value + '/${page}'">
                <option value='5' ${limit == 5 ? "selected" : ""}>5 per page</option>
                <option value='10' ${limit == 10 ? "selected" : ""}>10 per page</option>
                <option value='20' ${limit == 20 ? "selected" : ""}>20 per page</option>
                <option value='50' ${limit == 50 ? "selected" : ""}>50 per page</option>
                <option value='100' ${limit == 100 ? "selected" : ""}>100 per page</option>
                <option value='250' ${limit == 250 ? "selected" : ""}>250 per page</option>
              </select>
              
              

                
            ${
              tableName === "error_logs"
                ? `<form method="post" action="/api/superadmin/list/error_logs/" style="display:inline;" onsubmit="return confirm('Are you sure you want to clear all ' + '${pageName}'.toLowerCase() + '? This action cannot be undone.')">
              <input type="hidden" name="action" value="clear_all_logs" />
              <button type="submit" class="btn btn-danger ms-2"><i class="bi bi-trash"></i> Empty</button>
            </form>
            
            <form method="post" action="/api/superadmin/list/error_logs/" style="display:inline;">
              <input type="hidden" name="action" value="clear_only_logs" />
              <button type="submit" class="btn btn-info ms-2"><i class="bi bi-x-lg"></i> Clear Only Logs</button>
            </form>`
                : ""
            }
        
        </div>
      </div>
    </div>`;

  const [totalPagesQueryResult] = await db.query(
    `SELECT COUNT(*) AS count FROM ${tableName} ${orgFilter ? `WHERE ${orgFilter}` : ""} ${log_type!='error_logs' ? (orgFilter?"AND":"WHERE")+` log_type = ${db.escape(log_type)}` : ""}`,
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
  const sortableCounts = ["u.user_name", "o.name"];

  let orderBy;

  if (sortableCounts.includes(sortColumn)) {
    orderBy = sortColumn; // computed column
  } else {
    orderBy = `tb.${sortColumn}`; // normal column
  }
  const pages = getPaginationPages(page, totalPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  let query = ``;

  if (tableName == "error_logs") {
    query = `SELECT 
  tb.*,
  o.name AS org_name,
  u.username AS user_name
FROM ${tableName} tb
LEFT JOIN organizations o ON tb.org_id = o.id
LEFT JOIN users u ON tb.user_id = u.local_id

${orgFilter ? `WHERE tb.${orgFilter}` : ""}
${log_type!='error_logs' ? `WHERE tb.log_type = ${db.escape(log_type)}` : ""}
ORDER BY ${orderBy} ${sortDir}
LIMIT ${limit} OFFSET ${offset};`;
  }

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

            <th>Time Ago</th>
              <th>Tab Ses ID</th>
              <th>ip_address</th>
              <th>location</th>
              <th>log_type</th>
              <th>message</th>
              <th>stack</th>
              <th>system_info</th>
                ${selectedOrg == "0" ? `<th>Organization</th>` : ""}
              <th>Username</th>
              <th>ID</th>
              <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) => /*html*/ `
                <tr class="table-${logColors[row.log_type]?logColors[row.log_type]:"dark"}">
                  <td>${i + 1 + offset}</td>
                 
                  <td>${showTimeAgo(row.created_at)}</td>

                  <td><a href="/api/superadmin/command/0/${row.org_id}/${row.user_id}/${row.tab_ses_id}/tab_ses_id/" class='btn btn-link'>${row.tab_ses_id}</a></td>

                  <td>${row.ip_address}</td>
                  <td>${row.location?truncate(row.location.slice(19)):"N/A"}</td>
                  <td>${row.log_type}</td>
                  <td>${truncate(row.message)}</td>
                  <td>${truncate(row.stack)}</td>
                  <td>${truncate(row.system_info)}</td>


                  ${selectedOrg == "0" ? `<td>${row.org_name}</td>` : ""}
                  <td>${row.user_name}</td>
                 
                  <td>${row.id}</td>
                  <td>
                    <a href="/api/superadmin/view-error-log/${tableName}/${row.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> View</a>  
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
