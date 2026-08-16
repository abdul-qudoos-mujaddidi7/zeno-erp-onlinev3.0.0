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

  // Convert to Asia/Kabul timezone parts
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const values = {};
  parts.forEach(({ type, value }) => {
    values[type] = value;
  });

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
function getLocalDateTimeOneYearLater(mysqlDate) {
  if (!mysqlDate) return "";

  const date = new Date(mysqlDate);
  date.setFullYear(date.getFullYear() + 1); // Add one year

  // Convert to Asia/Kabul timezone parts
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const values = {};
  parts.forEach(({ type, value }) => {
    values[type] = value;
  });

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function getLocalDateTime14DaysLater(mysqlDate) {
  if (!mysqlDate) return "";

  const date = new Date(mysqlDate);
  date.setDate(date.getDate() + 14); // Add 14 days

  // Convert to Asia/Kabul timezone parts
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const values = {};
  parts.forEach(({ type, value }) => {
    values[type] = value;
  });

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

module.exports = async function Subscription(req, res, db) {
  const subscription_id = req.params.subscription_id;

  const [all_features] = await db.query(
    `SELECT * FROM features WHERE status = 1`,
  );

  const [orgs] = await db.query(`SELECT * FROM \`organizations\``);
  const [subscription_plans] = await db.query(
    `SELECT * FROM \`subscription_plans\``,
  );
  let subscription_features = [];
  let subscriptionData = null;
  if (subscription_id != 0) {
    const [result] = await db.query(
      `
      SELECT * FROM subscriptions
    WHERE id = ${db.escape(subscription_id)};`,
    );

    if (result && result.length == 0) {
      return res.send(
        DashLayout(
          "Subscription",
          req /*html*/,
          `
    <div class="card-body p-4">
      
      <h1>Subscription</h1>
      <p>Subscription not found.</p>
      <a href="/api/superadmin/list-subscriptions/all/created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
        ),
      );
    }
    subscriptionData = result[0];
  }
  if (!subscriptionData) {
    subscriptionData = {};
    subscriptionData.org_id = req.params.org_id?Number(req.params.org_id):"";
    subscriptionData.plan_id = "";
    subscriptionData.start_date = req.params.org_id?getLocalDateTime(orgs.find(o=>o.id==req.params.org_id)?.created_at||""):"";
    subscriptionData.end_date = req.params.org_id?getLocalDateTimeOneYearLater(orgs.find(o=>o.id==req.params.org_id)?.created_at||""):"";
    subscriptionData.next_billing_date =  req.params.org_id?getLocalDateTime14DaysLater(orgs.find(o=>o.id==req.params.org_id)?.created_at||""):"";
    subscriptionData.subscription_status = "trial";
    subscriptionData.auto_renew = "";
    subscriptionData.trial_end_date = req.params.org_id?getLocalDateTime14DaysLater(orgs.find(o=>o.id==req.params.org_id)?.created_at||""):"";
    subscriptionData.cancelled_at = "";
    subscriptionData.price_override = "";
    subscriptionData.description = "";
    subscriptionData.currency = "";
  } else {
    const [features_result] = await db.query(`
      SELECT spf.*, f.name , f.type 
      FROM subscription_features spf
      JOIN features f ON f.id = spf.feature_id
      WHERE spf.subscription_id = ${db.escape(subscription_id)}
    `);
    subscription_features = features_result;
  }

  console.log(subscriptionData);
  const pageName =
    subscription_id != 0
      ? "Subscription Details of " + subscription_id
      : "New Subscription";
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="fw-bold mb-0">${pageName}</h3>
      ${subscription_id != 0 ? `<a href="/api/superadmin/invoices/${subscription_id}" class="btn btn-outline-info btn-sm">
        <i class="bi bi-receipt me-1"></i> Invoices
      </a>` : ""}
      <a href="/api/superadmin/list-subscriptions/all/created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i> Back to List
      </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
    <form action='/api/superadmin/subscription' method='post'>
      <input type="hidden" value="${subscription_id}" name="subscription_id">
      <div class="row">

        <div class="col-md-4 mb-3">
          <small class="text-muted">org_id</small>
          <div class="fw-bold">
          <select class="form-control" value="${subscriptionData.org_id}" name="org_id" id="org_id">
                <option value="">Select Org</option>
                ${orgs
                  .map(
                    (ot) => /*html*/ `
                    <option value="${ot.id}" ${subscriptionData.org_id == ot.id ? "SELECTED" : ""}>${ot.name} (z${ot.id})</option>
                  `,
                  )
                  .join("")}
              </select>
          </div>
        </div>

        <div class="col-md-4 mb-3">

          <small class="text-muted">plan_id</small>
          <div class="input-group fw-bold">
            <select class="form-control" ${subscription_id == 0 ? "onchange=\"loadFeatures()\"" : ""} value="${subscriptionData.plan_id}" name="plan_id" id="plan_id">
                  <option value="">Select Plan</option>
                  ${subscription_plans
                    .map(
                      (pt) => /*html*/ `
                      <option value="${pt.id}" ${subscriptionData.plan_id == pt.id ? "SELECTED" : ""}>${pt.name} (Code: ${pt.code}) ${Number(pt.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pt.currency || ""}</option>
                    `,
                    )
                    .join("")}
            </select>
            <button type="button" class="btn btn-outline-secondary" onclick="loadFeatures()"><i class="bi bi-arrow-clockwise"></i> Load Features</button>
          </div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">Start Date</small>
          <div class="fw-bold"><input type="datetime-local" class="form-control" value="${getLocalDateTime(subscriptionData.start_date)}" name="start_date" id="start_date"></div>
        </div>

        

        <div class="col-md-4 mb-3">
          <small class="text-muted">End Date</small>
          <div class="fw-bold"><input type="datetime-local" class="form-control" value="${getLocalDateTime(subscriptionData.end_date)}" name="end_date" id="end_date"></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Next Billing Date</small>
          <div class="fw-bold"><input type="datetime-local" class="form-control" value="${getLocalDateTime(subscriptionData.next_billing_date)}" name="next_billing_date" id="next_billing_date"></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">subscription_status</small>
          <div class="fw-bold">
          <select class="form-control" value="${subscriptionData.subscription_status}" name="subscription_status" id="subscription_status">
               <option value="active" ${subscriptionData.subscription_status == "active" ? "SELECTED" : ""}>Active</option>
               <option value="trial" ${subscriptionData.subscription_status == "trial" ? "SELECTED" : ""}>Trial</option>
               <option value="cancelled" ${subscriptionData.subscription_status == "cancelled" ? "SELECTED" : ""}>Cancelled</option>
               <option value="suspended" ${subscriptionData.subscription_status == "suspended" ? "SELECTED" : ""}>Suspended</option>
               <option value="inactive" ${subscriptionData.subscription_status == "inactive" ? "SELECTED" : ""}>In Active</option>
          </select>
          </div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Auto Renew</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscriptionData.auto_renew}" name="auto_renew" id="auto_renew"></div>
        </div>

        
        <div class="col-md-4 mb-3">
          <small class="text-muted">Trial End Date</small>
          <div class="fw-bold"><input type="datetime-local" class="form-control" value="${getLocalDateTime(subscriptionData.trial_end_date)}" name="trial_end_date" id="trial_end_date"></div>
        </div>

        
        <div class="col-md-4 mb-3">
          <small class="text-muted">Cancelled At</small>
          <div class="fw-bold"><input type="datetime-local" class="form-control" value="${getLocalDateTime(subscriptionData.cancelled_at)}" name="cancelled_at" id="cancelled_at"></div>
        </div>

        
        
        <div class="col-md-4 mb-3">
          <small class="text-muted">Price Override</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscriptionData.price_override}" name="price_override" id="price_override"></div>
        </div>

        
        
        <div class="col-md-4 mb-3">
          <small class="text-muted">currency</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscriptionData.currency}" name="currency" id="currency"></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description</small>
          <div class="fw-bold"><textarea type="text" class="form-control" name="description" id="description">${subscriptionData.description || ""}</textarea></div>
        </div>
      </div>


      
      <hr>
      <h5 class="mt-4">Features</h5>

      <div id="features-container">
  ${subscription_features
    .map(
      (f) => `
    <div class="row mb-2 feature-row">
      <input type="hidden" name="feature_id[]" value="${f.feature_id}">
      
      <div class="col-md-3">
        <input type="text" class="form-control" value="${f.name} (${f.type})" disabled>
      </div>

      <div class="col-md-2">
        <input type="text" name="feature_value[]" class="form-control" value="${f.value || ""}">
      </div>

      <div class="col-md-2">
        <input type="text" name="feature_unit[]" class="form-control" value="${f.unit || ""}">
      </div>
      
      <div class="col-md-2">
        <input type="text" name="feature_used_value[]" class="form-control" readonly value="${f.used_value || ""}">
      </div>
      <div class="col-md-3">
        <button type="button" class="btn btn-info btn-sm move-up"><i class='bi bi-arrow-up'></i></button>
        <button type="button" class="btn btn-warning btn-sm move-down"><i class='bi bi-arrow-down'></i></button>
        <button type="button" class="btn btn-danger btn-sm remove-feature">Remove</button>
      </div>
    </div>
  `,
    )
    .join("")}
</div>


        <div class="row mt-3">
          <div class="col-md-6">
            <select id="add-feature-select" class="form-control">
              <option value="">Add Feature</option>
              ${all_features
                .map(
                  (f) => `
                <option value="${f.id}">${f.name}</option>
              `,
                )
                .join("")}
            </select>
          </div>
        </div>

          <button class='btn btn-primary' type='submit'>Save</button>  
        
          <script>
  const featureSelect = document.getElementById("add-feature-select");
  const container = document.getElementById("features-container");

  featureSelect.addEventListener("change", function () {
    const featureId = this.value;
    const featureName = this.options[this.selectedIndex].text;

    if (!featureId) return;

    // جلوگیری از تکرار
    //if (document.querySelector(\`input[value="\${featureId}"]\`)) {
    //  alert("Feature already added");
    //  this.value = "";
    //  return;
    //}

    const row = document.createElement("div");
    row.className = "row mb-2 feature-row";

    row.innerHTML = \`
      <input type="hidden" name="feature_id[]" value="\${featureId}">
      
      <div class="col-md-3">
        <input type="text" class="form-control" value="\${featureName}" disabled>
      </div>

      <div class="col-md-3">
        <input type="text" name="feature_value[]" class="form-control">
      </div>

      <div class="col-md-3">
        <input type="text" name="feature_unit[]" class="form-control">
      </div>


      <div class="col-md-3">
        <input type="text" name="feature_used_value[]" class="form-control" readonly>
      </div>

      <div class="col-md-3">
        <button type="button" class="btn btn-info btn-sm move-up"><i class='bi bi-arrow-up'></i></button>
        <button type="button" class="btn btn-warning btn-sm move-down"><i class='bi bi-arrow-down'></i></button>
        <button type="button" class="btn btn-danger btn-sm remove-feature">Remove</button>
      </div>
    \`;

    container.appendChild(row);

    this.value = "";
  });

  // remove feature
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-feature")) {
      e.target.closest(".feature-row").remove();
    }
    if (e.target.classList.contains("move-up")) {
      const row = e.target.closest(".feature-row");
      if (row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
      }
    }
    if (e.target.classList.contains("move-down")) {
      const row = e.target.closest(".feature-row");
      if (row.nextElementSibling) {
        row.parentNode.insertBefore(row.nextElementSibling, row);
      }
    }
  });

  function loadFeatures() {
    const planId = document.getElementById("plan_id").value;
    if (!planId) return;

    fetch(\`/api/superadmin/subscription-plan-features/\${planId}/\`)
      .then((res) => res.json())
      .then((data) => {
        // پاک کردن فیچرهای قبلی
        container.innerHTML = "";

        data.forEach((f) => {
          const row = document.createElement("div");
          row.className = "row mb-2 feature-row";

          row.innerHTML = \`
            <input type="hidden" name="feature_id[]" value="\${f.feature_id}">
            <div class="col-md-3">
              <input type="text" class="form-control" value="\${f.feature_name} (\${f.feature_type})" disabled>
            </div>
            <div class="col-md-2">
              <input type="text" name="feature_value[]" class="form-control" value="\${f.value || ""}">
            </div>
            <div class="col-md-2">
              <input type="text" name="feature_unit[]" class="form-control" value="\${f.unit || ""}">
            </div>
            <div class="col-md-2">
              <input type="text" name="feature_used_value[]" class="form-control" readonly value="">
            </div>
            <div class="col-md-3">
              <button type="button" class="btn btn-info btn-sm move-up"><i class='bi bi-arrow-up'></i></button>
              <button type="button" class="btn btn-warning btn-sm move-down"><i class='bi bi-arrow-down'></i></button>
              <button type="button" class="btn btn-danger btn-sm remove-feature">Remove</button>
            </div>
          \`;
          container.appendChild(row);
        });
      });
  }
</script>



</form>
    </div>
        `,
    ),
  );
};
