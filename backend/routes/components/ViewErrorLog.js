const DashLayout = require("./DashLayout");

function getDiff(oldObj, newObj) {
  const diff = {};
  for (const key in newObj) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      diff[key] = newObj[key];
    }
  }
  return diff;
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
module.exports = async function ViewItem(req, res, db) {
  const tableName = req.params.tableName;
  const pageName = tableName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const address = `/api/superadmin/list-error-logs/${tableName}/`;

  const [orgs] = await db.query(`SELECT * FROM \`organizations\``);

  const [result] = await db.query(
    `
      SELECT * FROM ${tableName}
    WHERE id = ${db.escape(req.params.id)}
    ${req.session.user.username != "superadmin" ? ` AND org_id = ${db.escape(req.session.user.org_id)}` : ""}
    ;`,
  );

  if (result && result.length == 0) {
    return res.send(
      DashLayout(
        pageName,
        req /*html*/,
        `
    <div class="card-body p-4">
      
      <h1>${tableName}</h1>
      <p>${tableName.toLowerCase()} not found.</p>
      <a href="${address}created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
      ),
    );
  }

  const row = result[0];

  let allItems = [];
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h3 class="fw-bold mb-0">${tableName
        .split("_")
        .join(" ")
        .replace(/\b\w/g, (l) => l.toUpperCase())} Details</h3>
    </div>
    <a href="${address}created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
      <i class="bi bi-arrow-left me-1"></i> Back
    </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm bg-${logColors[row.log_type]?logColors[row.log_type]:"dark"}-subtle">
    <div class="card-body">
      <div class="row">
        <div class="col-md-4 mb-3">
          <small class="text-muted">ID</small>
          <div class="fw-bold">${row.id}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Log Type</small>
          <div class="fw-bold">${row.log_type || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Organization</small>
          <div class="fw-bold">${orgs.find((org) => org.id === row.org_id)?.name || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">User ID</small>
          <div class="fw-bold">${row.user_id}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">User Name</small>
          <div class="fw-bold">${row.user_name || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Ip Address</small>
          <div class="fw-bold">${row.ip_address || "N/A"}</div>
        </div>


        <div class="col-md-12 mb-3">
          <small class="text-muted">Location</small>
          <div class="fw-bold">${row.location || "N/A"}</div>
        </div>
      </div>
      <hr>
      
      <div class="row">
        <div class="col-md-4 mb-4">
          <h6 class="fw-bold">message</h6>

          <div class='' style='max-height:500px;overflow:auto;border:1px solid #888;padding:10px'>${row.message}</div>
        </div>
        <div class="col-md-4 mb-4">
          <h6 class="fw-bold">stack</h6>
          <div style='max-height:500px;overflow:auto;border:1px solid #888;padding:10px'>${row.stack}</div>
        </div>
        <div class="col-md-4 mb-4">
          <h6 class="fw-bold">System Info</h6>

          <pre class="bg-body p-3 rounded small border" style="background:none !important;border:1px solid #888  !important;">${JSON.stringify(JSON.parse(row.system_info), null, 4) || row.system_info}</pre>
        </div>
      </div>
        `,
    ),
  );
};
