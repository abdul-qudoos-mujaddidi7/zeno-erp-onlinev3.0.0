const DashLayout = require("./DashLayout");
module.exports = async function Feature(req, res, db) {
  const feature_id = req.params.feature_id;



  let featureData = null;
  if (feature_id != 0) {
    const [result] = await db.query(
      `
      SELECT * FROM features
    WHERE id = ${db.escape(feature_id)};`,
    );
    
    if (result && result.length == 0) {
      return res.send(
        DashLayout(
          "Feature",
          req /*html*/,
          `
    <div class="card-body p-4">
      
      <h1>Feature</h1>
      <p>Feature not found.</p>
      <a href="/api/superadmin/list-features/all/created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-sm btn-primary"><i class="bi bi-arrow-left"></i> Back to List</a>
      </div>
      </div>
      
    </div>

  `,
        ),
      );
    }
    featureData = result[0];
  }

  if (!featureData) {
    featureData = {};
    featureData.feature_key = '';
    featureData.type = '';
    featureData.icon = '';
    featureData.name = '';
    featureData.name_fa = '';
    featureData.name_ps = '';
    featureData.description = '';
    featureData.description_fa = '';
    featureData.description_ps = '';
  }

  console.log(featureData);
  const pageName = feature_id != 0 ? "Feature Details of "+feature_id : "New Feature";
  res.send(
    DashLayout(
      pageName,
      req,
      /*html*/ `
        
<div class="">

  <!-- Header -->
  <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="fw-bold mb-0">${pageName}</h3>
      <a href="/api/superadmin/list-features/all/created_at/DESC/${req.session.user.org_id}/20/1" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i> Back to List
      </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
    <form action='/api/superadmin/feature' method='post'>
      <input type="hidden" value="${feature_id}" name="feature_id">
      <div class="row">

        <div class="col-md-12 mb-3">
          <small class="text-muted">Feature Key</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.feature_key}" name="feature_key" id="feature_key"></div>
        </div>


        <div class="col-md-12 mb-3">
          <small class="text-muted">Feature Type</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.type}" name="type" id="type"></div>
        </div>


        <div class="col-md-12 mb-3">
          <small class="text-muted">Feature Icon</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.icon}" name="icon" id="icon"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.name}" name="name" id="name"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Fa)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.name_fa}" dir='rtl' name="name_fa" id="name_fa"></div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Name (Ps)</small>
          <div class="fw-bold"><input type="text" class="form-control" value="${featureData.name_ps}" dir='rtl' name="name_ps" id="name_ps"></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description</small>
          <div class="fw-bold"><textarea type="text" class="form-control" name="description" id="description">${featureData.description || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Fa)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_fa" id="description_fa">${featureData.description_fa || ''}</textarea></div>
        </div>


        <div class="col-md-4 mb-3">
          <small class="text-muted">Description (Ps)</small>
          <div class="fw-bold"><textarea type="text" class="form-control" dir='rtl' name="description_ps" id="description_ps">${featureData.description_fa || ''}</textarea></div>
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
