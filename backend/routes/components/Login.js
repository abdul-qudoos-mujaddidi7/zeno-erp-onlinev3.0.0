module.exports = function Login(req,res,db) {
    if (req.session.user) {
    return res.redirect("/api/superadmin/dashboard");
  } else {
    res.send(/*html*/ `
    <!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login - ZenoERP Superadmin Dashboard</title>
    <link id="mdb-css" href="/css/mdb.min.css" rel="stylesheet" />
    <link id="mdb-rtl-css" href="/css/mdb.rtl.min.css" rel="stylesheet" disabled />
    <link rel="stylesheet" href="/css/bootstrap-icons.min.css" />

    <link id="mdb-rtl-css" href="/css/mds.bs.datetimepicker.style.css" rel="stylesheet" />
    <style>
      /* Chrome, Safari, Edge, Opera */
      input[type='number']::-webkit-inner-spin-button,
      input[type='number']::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      /* Firefox */
      input[type='number'] {
        -moz-appearance: textfield;
      }
      .nav-divider {
        width: 1px;
        height: 24px;
        background-color: rgba(0, 0, 0, 0.05);
        margin: 0 10px;
      }
    </style>

    <link rel="stylesheet" href="/fonts/vazirmatn.css" />
  </head>

  <body>
 
    
    <div class="container-fluid p-0">
<div class="row g-0">
  <div class="col-md-6 d-none d-md-block p-0" style="height: 100vh;">
    <img src="/img/superadmin.jpg" alt="Auth Background" class="w-100 h-100 object-cover" />
  </div>

  <div
    class="col-md-6"
    style="height: 100vh;display: flex; align-items: center; justify-content: center;background: #f8f9fa;">
    <div class="card" style="max-width: 400px;">
      <div class="card-body">
        <div class="text-center mb-3">
          <h2 class="fw-bold mb-1">
            <i class="bi bi-rocket-takeoff me-2 text-primary"></i>
            ZENOERP
          </h2>
          <h3 class="text-muted mt-3">Superadmin Login</h3>
        </div>

  <form method='post'>
        <div data-mdb-input-init class="form-outline mb-3">
          <input type="text" id="form2Example1" class="form-control" name='username' />
          <label class="form-label" for="form2Example1">Username</label>
        </div>

        <!-- Password input -->
        <div data-mdb-input-init class="form-outline mb-3">
          <input type="password" id="form2Example2" class="form-control" name='password' />
          <label class="form-label" for="form2Example2">Password</label>
        </div>

        <!-- Submit button -->
        <button data-mdb-ripple-init type="submit" class="btn btn-primary btn-block mb-3"
          >Login</button>

    </form>
      </div>
    </div>
  </div>
</div>
</div>
<style>
  .object-cover {
    object-fit: cover;
  }
</style>
    <script src="/js/mdb.umd.min.js"></script>
    <script>
      window.bootstrap = mdb;
    </script>

    <script src="/js/mds.bs.datetimepicker.js"></script>

  </body>
</html>
  `);
  }
};