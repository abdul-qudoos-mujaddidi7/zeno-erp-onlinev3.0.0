const DashLayout = require("./DashLayout");
const org_typeColors = {
  new: "primary", // neutral
  pending: "danger", // neutral
  sent: "warning", // red
  answered: "info", // yellow
  executed: "success", // light blue
};



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

module.exports = async function OrgType(req, res, db) {
  const org_type_id = req.params.org_type_id;



  let org_typeData = null;
  if (org_type_id != 0) {
    const [result] = await db.query(
      `
      SELECT * FROM org_types
    WHERE id = ${db.escape(org_type_id)};`,
    );
    
    if (result && result.length == 0) {
      return res.send(
        DashLayout(
          "OrgType",
          req /*html*/,
          `
    <div class="card-body p-4">
      
      <h1>OrgType</h1>
      <p>OrgType not found.</p>
      <a href="/api/superadmin/list-org_types/all/created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
        ),
      );
    }
    org_typeData = result[0];
  }

  if (!org_typeData) {
    org_typeData = {};
    org_typeData.type_status = 'active';
    org_typeData.code = '';
    org_typeData.icon = '';
    org_typeData.name = '';
    org_typeData.name_fa = '';
    org_typeData.name_ps = '';
    org_typeData.summary = '';
    org_typeData.summary_fa = '';
    org_typeData.summary_ps = '';
    org_typeData.description = '';
    org_typeData.description_fa = '';
    org_typeData.description_ps = '';
  }

  console.log(org_typeData);
  const pageName = org_type_id != 0 ? "OrgType Details of "+org_type_id : "New OrgType";
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="fw-bold mb-0">${pageName}</h3>
      <a href="/api/superadmin/list-org-types/all/created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i> Back to List
      </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
    <form action='/api/superadmin/org-type' method='post'>
      <input type="hidden" value="${org_type_id}" name="org_type_id">
      <div class="row">

        <div class="col-md-4 mb-3">
          <small class="text-muted">Code</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_typeData.code}" name="code" id="code"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Icon</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_typeData.icon}" name="icon" id="icon"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Org Type Status</small>
          <div class="fw-bold">
          
          
          <select class="form-control" value="${org_typeData.type_status}" name="type_status" id="type_status">
               <option value="active" ${org_typeData.type_status == 'active'?"SELECTED":""}>Active</option>
               <option value="coming_soon" ${org_typeData.type_status == 'coming_soon'?"SELECTED":""}>Coming Soon</option>
               <option value="inactive" ${org_typeData.type_status == 'inactive'?"SELECTED":""}>inactive</option>
          </select>
          
          </div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Name</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_typeData.name}" name="name" id="name"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Fa)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_typeData.name_fa}" dir='rtl' name="name_fa" id="name_fa"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Ps)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${org_typeData.name_ps}" dir='rtl' name="name_ps" id="name_ps"></div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">Summary</small>
          <div class="fw-bold"><textarea type="text" class="form-control" name="summary" id="summary">${org_typeData.summary || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Summary (Fa)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="summary_fa" id="summary_fa">${org_typeData.summary_fa || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Summary (Ps)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="summary_ps" id="summary_ps">${org_typeData.summary_ps || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description</small>
          <div class="fw-bold"><textarea type="text" class="form-control" name="description" id="description">${org_typeData.description || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Fa)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_fa" id="description_fa">${org_typeData.description_fa || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Ps)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_ps" id="description_ps">${org_typeData.description_fa || ''}</textarea></div>
        </div>

        <div class="col-md-12 mb-3">
          <button class='btn btn-primary' type='submit'>Save</button>  
        </div>

      </div>
      

      </div>

        `,
    ),
  );
};
