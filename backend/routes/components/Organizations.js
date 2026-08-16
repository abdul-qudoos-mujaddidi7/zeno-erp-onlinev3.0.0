const DashLayout = require("./DashLayout");

module.exports = function Organizations(req, res, db) {
  let query = `SELECT * FROM \`organizations\` ORDER BY id DESC`;
  let orgs = [];
  db.query(query)
    .then(([rows]) => {
      orgs = rows;
      console.log("ORGS:", orgs);
      res.send(
        DashLayout(
          "Organizations",
          req,
          /*html*/ `

          <div class='row'>
          ${orgs
            .map(
              (org) => /*html*/ `
                    <div class='col-md-4 mb-3'>
                    <div class="card text-center">
  <div class="card-header">ID: ${org.id} - Type: ${org.type || "No Type"}</div>
  <div class="card-body">
    <h5 class="card-title">${org.name || "No Name"}</h5>
    <p class="card-text"></p>
    <a href="/api/superadmin/select_org/${org.id}" class="btn btn-primary btn-sm px-2 mx-1" data-mdb-ripple-init><i class='bi bi-check-circle'></i> Select</a>
    <a href="/api/superadmin/list/users/${org.id}/20/1/" class="btn btn-success btn-sm px-2 mx-1" data-mdb-ripple-init><i class='bi bi-people'></i> Users</a>
  </div>
  <div class="card-footer text-muted">Created At: ${new Date(
    org.created_at,
  ).toLocaleString("en-US", {
    timeZone: "Asia/Kabul",
  })}</div>
</div>
                    
                    </div>
                  `,
            )
            .join("")}

          </div>


      `,
        ),
      );
    })
    .catch((err) => {
      console.error("Failed to fetch organizations", err);
      res.status(500).send("Error fetching organizations");
    });
};
