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

module.exports = async function ViewItem(req, res, db) {
  const tableName = req.params.tableName;
  const pageName = tableName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const address = `/api/superadmin/list/${tableName}/`;

  const [orgs] = await db.query(`SELECT * FROM \`organizations\``);

  const [result] = await db.query(
    `
      SELECT 
      tb.*,
      cu.username AS created_by_name,
      uu.username AS updated_by_name,
      au.username AS approved_by_name
    FROM ${tableName} tb
    LEFT JOIN users cu ON tb.created_by = cu.local_id
    LEFT JOIN users uu ON tb.updated_by = uu.local_id
    LEFT JOIN users au ON tb.approved_by = au.local_id
    WHERE tb.id = ${db.escape(req.params.id)}
    ${req.session.user.username != "superadmin" ? ` AND tb.org_id = ${db.escape(req.session.user.org_id)}` : ""}
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
  if (tableName == "sales") {
    [allItems] = await db.query(`
  SELECT si.*, 
         p.name AS product_name,
         pu.name AS unit_name
  FROM sale_items si 
  LEFT JOIN products p 
    ON si.product_id = p.local_id 
   AND si.org_id = p.org_id
  LEFT JOIN product_units pu 
    ON si.product_unit_id = pu.local_id 
   AND si.org_id = pu.org_id
  WHERE si.sale_id = ? AND si.org_id = ? 
    AND si.status = 1
`, [row.local_id,row.org_id]);
  } else if (tableName == "purchases") {
    [allItems] = await db.query(`
  SELECT pi.*, 
         p.name AS product_name,
         pu.name AS unit_name
  FROM purchase_items pi 
  LEFT JOIN products p 
    ON pi.product_id = p.local_id 
   AND pi.org_id = p.org_id
  LEFT JOIN product_units pu 
    ON pi.product_unit_id = pu.local_id 
   AND pi.org_id = pu.org_id
  WHERE pi.purchase_id = ? AND pi.org_id = ? 
    AND pi.status = 1
`, [row.local_id,row.org_id]);
  } else if (tableName == "wastes") {
    [allItems] = await db.query(`
  SELECT wi.*, 
         p.name AS product_name,
         pu.name AS unit_name
  FROM waste_items wi 
  LEFT JOIN products p 
    ON wi.product_id = p.local_id 
   AND wi.org_id = p.org_id
  LEFT JOIN product_units pu 
    ON wi.product_unit_id = pu.local_id 
   AND wi.org_id = pu.org_id
  WHERE wi.waste_id = ? AND wi.org_id = ? 
    AND wi.status = 1
`, [row.local_id,row.org_id]);
  } else if (tableName == "stock_transfers") {
    [allItems] = await db.query(`
  SELECT sti.*, 
         p.name AS product_name,
         pu.name AS unit_name
  FROM stock_transfer_items sti 
  LEFT JOIN products p 
    ON sti.product_id = p.local_id 
   AND sti.org_id = p.org_id
  LEFT JOIN product_units pu 
    ON sti.product_unit_id = pu.local_id 
   AND sti.org_id = pu.org_id
  WHERE sti.stock_transfer_id = ? AND sti.org_id = ?
    AND sti.status = 1
`, [row.local_id,row.org_id]);
  }



  let salePayments = [];
  if (tableName == "sales") {
    [salePayments] = await db.query(`
  SELECT sp.*, 
         a.name AS account_name
  FROM sale_payments sp 
  LEFT JOIN accounts a 
    ON sp.account_id = a.local_id 
   AND sp.org_id = a.org_id
  WHERE sp.sale_id = ? AND sp.org_id = ? 
    AND sp.status = 1
`, [row.local_id,row.org_id]);
  }



  let purchasePayments = [];
  if (tableName == "purchases") {
    [purchasePayments] = await db.query(`
  SELECT pp.*, 
         a.name AS account_name
  FROM purchase_payments pp 
  LEFT JOIN accounts a 
    ON pp.account_id = a.local_id 
   AND pp.org_id = a.org_id
  WHERE pp.purchase_id = ? AND pp.org_id = ? 
    AND pp.status = 1
`, [row.local_id,row.org_id]);
  }



  console.log("ITEMS:", allItems.length);
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
    <a href="${address}created_at/DESC/${req.session.user.org_id}/20/1/" class="btn btn-outline-secondary btn-sm">
      <i class="bi bi-arrow-left me-1"></i> Back
    </a>
  </div>

  <!-- Main Card -->
  <div class="card shadow-sm">
    <div class="card-body">
  ${
    tableName == "products" ||
    tableName == "product_categories" ||
    tableName == "product_units" ||
    tableName == "product_brands" ||
    tableName == "product_generics" ||
    tableName == "currencies"
      ? /*html*/ `
               
                <div class="row">
                    <div class="col-md-6 mb-3">
                      <small class="text-muted">Name</small>
                      <h4 class="fw-bold">${row.name}</h4>
                    </div>
                    <div class="col-md-6 mb-3">
                      <small class="text-muted">Code</small>
                      <h4 class="fw-bold">${row.code || "N/A"}</h4>
                    </div>
                </div>
                <hr>
              `
      : ""
  }

               ${
                 tableName == "sales"
                   ? /*html*/ `
               
                <div class="row">
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Invoice Number</small>
                      <h5 class="fw-bold">${row.invoice_number}</h5>
                    </div>
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Invoice Date</small>
                      <h5 class="fw-bold">${new Date(row.invoice_date).toLocaleString("en-US", { timeZone: "Asia/Kabul" }) || "N/A"}</h5>
                    </div>
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Invoice Status</small>
                      <h5 class="fw-bold">${row.invoice_status || "N/A"}</h5>
                    </div>
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Discount Type</small>
                      <h5 class="fw-bold">${row.discount_type || "N/A"}</h5>
                    </div>
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Discount Amount</small>
                      <h5 class="fw-bold">${Number(row.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) || "N/A"} ${row.currency || ""}</h5>
                    </div>
                    <div class="col-md-4 mb-3">
                      <small class="text-muted">Total Amount</small>
                      <h5 class="fw-bold">${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) || "N/A"} ${row.currency || ""}</h5>
                    </div>
                </div>
                <hr>
              `
                   : ""
               }


               ${
                 tableName == "purchases"
                   ? /*html*/ `
               
                <div class="row">
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Bill Number</small>
                      <h5 class="fw-bold">${row.bill_number}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Bill Date</small>
                      <h5 class="fw-bold">${new Date(row.bill_date).toLocaleString("en-US", { timeZone: "Asia/Kabul" }) || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Bill Status</small>
                      <h5 class="fw-bold">${row.bill_status || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Total Amount</small>
                      <h5 class="fw-bold">${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) || "N/A"} ${row.currency || ""}</h5>
                    </div>
                </div>
                <hr>
              `
                   : ""
               }


               ${
                 tableName == "wastes"
                   ? /*html*/ `
               
                <div class="row">
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Reference Number</small>
                      <h5 class="fw-bold">${row.reference_number}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Waste Date</small>
                      <h5 class="fw-bold">${new Date(row.date).toLocaleString("en-US", { timeZone: "Asia/Kabul" }) || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Waste Status</small>
                      <h5 class="fw-bold">${row.waste_status || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Total Amount</small>
                      <h5 class="fw-bold">${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) || "N/A"} ${row.currency || ""}</h5>
                    </div>
                </div>
                <hr>
              `
                   : ""
               }


               ${
                 tableName == "stock_transfers"
                   ? /*html*/ `
               
                <div class="row">
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Transfer Number</small>
                      <h5 class="fw-bold">${row.transfer_number}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Transfer Date</small>
                      <h5 class="fw-bold">${new Date(row.transfer_date).toLocaleString("en-US", { timeZone: "Asia/Kabul" }) || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Transfer Status</small>
                      <h5 class="fw-bold">${row.transfer_status || "N/A"}</h5>
                    </div>
                    <div class="col-md-3 mb-3">
                      <small class="text-muted">Total Amount</small>
                      <h5 class="fw-bold">${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) || "N/A"} ${row.currency || ""}</h5>
                    </div>
                </div>
                <hr>
              `
                   : ""
               }

      <!-- Top Info -->
      <div class="row">
        <div class="col-md-4 mb-3">
          <small class="text-muted">ID</small>
          <div class="fw-bold">${row.id}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Local ID</small>
          <div class="fw-bold">${row.local_id || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Organization</small>
          <div class="fw-bold">${orgs.find((org) => org.id === row.org_id)?.name || "N/A"}</div>
        </div>
        

        <div class="col-md-4 mb-2">
          <small class="text-muted">Created By</small>
          <div class="fw-bold">${row.created_by_name || "N/A"}</div>
        </div>

        <div class="col-md-4 mb-2">
          <small class="text-muted">Updated By</small>
          <div class="fw-bold">${row.updated_by_name || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-2">
          <small class="text-muted">Approved By</small>
          <div class="fw-bold">${row.approved_by_name || "N/A"}</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Created At</small>
          <div class="fw-bold">${
            row.created_at
              ? new Date(row.created_at).toLocaleString("en-US", {
                  timeZone: "Asia/Kabul",
                })
              : "N/A"
          }</div>
        </div>

        <div class="col-md-4 mb-3">
          <small class="text-muted">Updated At</small>
          <div class="fw-bold">${
            row.updated_at
              ? new Date(row.updated_at).toLocaleString("en-US", {
                  timeZone: "Asia/Kabul",
                })
              : "N/A"
          }</div>
        </div>
        <div class="col-md-4 mb-3">
          <small class="text-muted">Approved At</small>
          <div class="fw-bold">${
            row.approved_at
              ? new Date(row.approved_at).toLocaleString("en-US", {
                  timeZone: "Asia/Kabul",
                })
              : "N/A"
          }</div>
        </div>
        <div class="col-md-8 mb-3">
          <small class="text-muted">Description</small><br>
          <div class="">${row.description || "N/A"}</div>
        </div>



        <div class="col-md-4 mb-3">
          <small class="text-muted">Status</small><br>
          <div class="fw-bold">${row.status || "N/A"}</div>
        </div>
      </div>

     

      ${
        tableName == "activity_logs"
          ? /*html*/ `
      <hr>
      <!-- Action Info -->
      <div class="row mb-3">
        <div class="col-md-4">
          <small class="text-muted">Action</small>
          <div><span class="badge badge-${row.action == "create" ? "success" : row.action == "update" ? "warning" : "danger"}">${row.action || "N/A"}</span></div>
        </div>
        <div class="col-md-4">
          <small class="text-muted">Table</small>
          <div class="fw-bold">${row.table_name || "N/A"}</div>
        </div>
        <div class="col-md-4">
          <small class="text-muted">Entity ID</small>
          <div class="fw-bold">${row.entity_id || "N/A"}</div>
        </div>
      </div>
      
      <hr>

      <!-- JSON Changes -->
      <div class="row">
        <div class="col-md-4 mb-3">
          <h6 class="fw-bold">Old Values</h6>
          <pre class="bg-body p-3 rounded small border">${JSON.stringify(JSON.parse(row.old_values), null, 4) || "N/A"}</pre>
        </div>
        <div class="col-md-4 mb-3">
          <h6 class="fw-bold">New Values</h6>
          <pre class="bg-body p-3 rounded small border">${JSON.stringify(JSON.parse(row.new_values), null, 4) || "N/A"}</pre>
        </div>
        <div class="col-md-4 mb-3">
          <h6 class="fw-bold">Changed Values</h6>
          <pre class="bg-body p-3 rounded small border">${JSON.stringify(getDiff(JSON.parse(row.old_values) || {}, JSON.parse(row.new_values) || {}), null, 4) || "N/A"}</pre>
        </div>
      </div>`
          : ""
      }


      ${
        allItems.length > 0
          ? /*html*/ `
      <hr>
      <h5 class="fw-bold mb-3">Items</h5>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Cost</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${allItems
              .map(
                (item, index) => /*html*/ `
              <tr>
                <td>${index + 1}</td>
                <td>${item.product_name || "N/A"}</td>
                <td>${Number(item.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>${item.unit_name || "N/A"}</td>
                <td>${Number(item.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.currency || ""}</td>
                <td>${Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.currency || ""}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      `
          : ""
      }

       ${
        salePayments.length > 0
          ? /*html*/ `
      <hr>
      <h5 class="fw-bold mb-3">Sale Payments</h5>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>To Account</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${salePayments
              .map(
                (item, index) => /*html*/ `
              <tr>
                <td>${index + 1}</td>
                <td>${new Date(item.payment_date).toLocaleDateString() || "N/A"}</td>
                <td>${item.account_name || "N/A"}</td>
                <td>${item.description || ""}</td>
                <td>${Number(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.currency || ""}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      `
          : ""
      }


       ${
        purchasePayments.length > 0
          ? /*html*/ `
      <hr>
      <h5 class="fw-bold mb-3">Purchase Payments</h5>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>From Account</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${purchasePayments
              .map(
                (item, index) => /*html*/ `
              <tr>
                <td>${index + 1}</td>
                <td>${new Date(item.payment_date).toLocaleDateString() || "N/A"}</td>
                <td>${item.account_name || "N/A"}</td>
                <td>${item.description || ""}</td>
                <td>${Number(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.currency || ""}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      `
          : ""
      }



    </div>
  </div>

</div>

        
        
        `,
    ),
  );
};
