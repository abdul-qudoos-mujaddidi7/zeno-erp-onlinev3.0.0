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

module.exports = async function SubscriptionPlan(req, res, db) {
  const subscription_plan_id = req.params.subscription_plan_id;

  const [all_features] = await db.query(`SELECT * FROM features WHERE status = 1`);

  const [org_types] = await db.query(`SELECT * FROM \`org_types\``);
  let subscription_plan_features = [];
  let subscription_planData = null;
  if (subscription_plan_id != 0) {
    const [result] = await db.query(
      `
      SELECT * FROM subscription_plans
    WHERE id = ${db.escape(subscription_plan_id)};`,
    );
    
    if (result && result.length == 0) {
      return res.send(
        DashLayout(
          "Subscription Plan",
          req /*html*/,
          `
    <div class="card-body p-4">
      
      <h1>Subscription Plan</h1>
      <p>Subscription Plan not found.</p>
      <a href="/api/superadmin/list-subscription_plans/all/created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
        ),
      );
    }
    subscription_planData = result[0];
  }
  if (!subscription_planData) {
    subscription_planData = {};
    subscription_planData.org_type_id = '';
    subscription_planData.code = '';
    subscription_planData.color = '';
    subscription_planData.plan_type = '';
    subscription_planData.is_active = '';
    subscription_planData.name = '';
    subscription_planData.name_fa = '';
    subscription_planData.name_ps = '';
    subscription_planData.description = '';
    subscription_planData.description_fa = '';
    subscription_planData.description_ps = '';
    subscription_planData.price = '';
    subscription_planData.currency = 'USD';
    subscription_planData.billing_cycle_unit = '';
    subscription_planData.billing_cycle_count = '';
    subscription_planData.trial_days = '';
    subscription_planData.grace_period_days = '';
  } else {
    const [features_result] = await db.query(`
      SELECT spf.*, f.name , f.type 
      FROM subscription_plan_features spf
      JOIN features f ON f.id = spf.feature_id
      WHERE spf.plan_id = ${db.escape(subscription_plan_id)}
    `);
    subscription_plan_features = features_result;
  }

  console.log(subscription_planData);
  const pageName = subscription_plan_id != 0 ? "Subscription Plan Details of "+subscription_plan_id : "New Subscription Plan";
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="fw-bold mb-0">${pageName}</h3>
      <a href="/api/superadmin/list-subscription-plans/all/created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i> Back to List
      </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
    <form action='/api/superadmin/subscription-plan' method='post'>
      <input type="hidden" value="${subscription_plan_id}" name="subscription_plan_id">
      <div class="row">

        <div class="col-md-4 mb-3">
          <small class="text-muted">org_type_id</small>
          <div class="fw-bold">
          
          <select class="form-control" value="${subscription_planData.org_type_id}" name="org_type_id" id="org_type_id">
                <option value="">Select Org Type</option>
                ${org_types.map(
                  (ot) => /*html*/ `
                    <option value="${ot.id}" ${subscription_planData.org_type_id == ot.id ? "SELECTED" : ""}>${ot.name} ${ot.name_fa}</option>
                  `,
                ).join("")}
              </select>
          
          </div>


          
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">Code</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.code}" name="code" id="code"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">plan_type</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.plan_type}" name="plan_type" id="plan_type"></div>
        </div>




        <div class="col-md-4 mb-3">
          <small class="text-muted">Name</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.name}" name="name" id="name"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Fa)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.name_fa}" dir='rtl' name="name_fa" id="name_fa"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Ps)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.name_ps}" dir='rtl' name="name_ps" id="name_ps"></div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">Description</small>
          <div class="fw-bold"><textarea type="text" class="form-control" name="description" id="description">${subscription_planData.description || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Fa)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_fa" id="description_fa">${subscription_planData.description_fa || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Ps)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_ps" id="description_ps">${subscription_planData.description_ps || ''}</textarea></div>
        </div>


        
        <div class="col-md-4 mb-3">
          <small class="text-muted">is_active</small>
          <div class="fw-bold">
          <select class="form-control" value="${subscription_planData.is_active}" name="is_active" id="is_active">
               <option value="true" ${subscription_planData.is_active == 'true'?"SELECTED":""}>Active</option>
               <option value="false" ${subscription_planData.is_active == 'false'?"SELECTED":""}>In Active</option>
          </select>
          </div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">trial_days</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.trial_days}" name="trial_days" id="trial_days"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">grace_period_days</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.grace_period_days}" name="grace_period_days" id="grace_period_days"></div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">price</small>
          <div class="fw-bold"><input type="number" class="form-control" value="${subscription_planData.price}" name="price" id="price"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">recurring price</small>
          <div class="fw-bold"><input type="number" class="form-control" value="${subscription_planData.recurring_price}" name="recurring_price" id="recurring_price"></div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">currency</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.currency}" name="currency" id="currency"></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">billing_cycle_count</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.billing_cycle_count}" name="billing_cycle_count" id="billing_cycle_count"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">billing_cycle_unit</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.billing_cycle_unit}" name="billing_cycle_unit" id="billing_cycle_unit"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">color</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${subscription_planData.color}" name="color" id="color"></div>
        </div>

      </div>


      
      <hr>
      <h5 class="mt-4">Features</h5>

      <div id="features-container">
  ${subscription_plan_features.map(f => `
    <div class="row mb-2 feature-row">
      <input type="hidden" name="feature_id[]" value="${f.feature_id}">
      
      <div class="col-md-3">
        <input type="text" class="form-control" value="${f.name} (${f.type})" disabled>
      </div>

      <div class="col-md-3">
        <input type="text" name="feature_value[]" class="form-control" value="${f.value || ''}">
      </div>

      <div class="col-md-3">
        <input type="text" name="feature_unit[]" class="form-control" value="${f.unit || ''}">
      </div>
      <div class="col-md-3">
        <button type="button" class="btn btn-info btn-sm move-up"><i class='bi bi-arrow-up'></i></button>
        <button type="button" class="btn btn-warning btn-sm move-down"><i class='bi bi-arrow-down'></i></button>
        <button type="button" class="btn btn-danger btn-sm remove-feature">Remove</button>
      </div>
    </div>
  `).join("")}
</div>


        <div class="row mt-3">
          <div class="col-md-6">
            <select id="add-feature-select" class="form-control">
              <option value="">Add Feature</option>
              ${all_features.map(f => `
                <option value="${f.id}">${f.name}</option>
              `).join("")}
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
</script>



</form>
    </div>
        `,
    ),
  );
};
