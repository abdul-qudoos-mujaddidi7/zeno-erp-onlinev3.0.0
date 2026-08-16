const DashLayout = require("./DashLayout");

const accountTypeNames = [
  "",
  "Asset",
  "Expense",
  "Company",
  "Customer",
  "Bank",
  "Income",
  "Shareholder",
];

  function humanSizeFormat(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  }

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

module.exports = async function ListItems(req, res, db) {
  let startTime = Date.now();

  const sortColumn = req.params.sortcolumn || "id";
  const sortDir = req.params.sortdir === "ASC" ? "ASC" : "DESC";
  const tableName = req.params.tableName;
  const pageName = tableName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const address = `/api/superadmin/list/${tableName}/${sortColumn}/${sortDir}/`;
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
  const [users] = await db.query(`SELECT * FROM \`users\``);
  let accounts = [];

  const myHead = /*html*/ `
    <div class="">
      <div class="card shadow-sm">
        <!-- Toolbar -->
        <div class="card-header bg-body-tertiary border-bottom p-3">
          <div class="row g-3 align-items-center">

            <div class="col-md-4">
            <h3>${orgs.find((org) => org.id == selectedOrg)?orgs.find((org) => org.id == selectedOrg)?.name + " (z"+selectedOrg+")" : "All Organizations"}</h3>
            </div>


            <div class='col-md-4'>
              ${
              req.session.user.username == "superadmin"
                ? /*html*/ `
              <div class="position-relative">
                <div class="input-group input-group-sm w-100">

                  <div class="form-outline" data-mdb-input-init>
                    <input
                type="text"
                class="form-control form-control-sm"
                id="form_org_search"
                oninput="handleSearchInput()"
                onfocus="handleSearchInput()"
                autocomplete="off" />
                    <label class="form-label" for="form_org_search">Select Organization</label>
                  </div>
                  ${selectedOrg != "0" ? `<button type="button" class="btn btn-sm btn-success w-25" onclick="selectOrg(0)"><i class="bi bi-list"></i> All</button>`:""}
                </div>
              </div>
              <ul class="list-group position-absolute z-3" style="max-height:180px;overflow:auto;" id="orgSearchResults">

              </ul>
              
              <script>
                let allOrgs = ${JSON.stringify(orgs)};



                function selectOrg(orgId) {
                  window.location.href = '${address}' + orgId + '/${limit}/${page}';
                }
                function handleSearchInput() {
                  const query = document.getElementById('form_org_search').value.toLowerCase();

                  const orgSearchResults = document.getElementById('orgSearchResults');

                  if (!orgSearchResults) return;

                  if (query.length === 0) {
                    orgSearchResults.innerHTML = '';
                    orgSearchResults.style.display = 'none';
                    return;
                  }

                  const filteredOrgs = allOrgs.filter(org => org.name.toLowerCase().includes(query) || ("z"+org.id).includes(query));

                  orgSearchResults.innerHTML = \`
                    <li class="list-group-item list-group-item-action bg-body px-2 py-2" style="cursor:pointer" onclick="selectOrg(0)"><i class='bi bi-building'></i> All Organizations</li>
                  \`+filteredOrgs.map(org => \`
                    <li class="list-group-item list-group-item-action bg-body px-2 py-2" style="cursor:pointer" onclick="selectOrg(\${org.id})">\${org.name} (z\${org.id})</li>
                  \`).join('');

                  orgSearchResults.style.display = 'block';

                }

                // Close dropdown when losing focus
                document.addEventListener('click', (e) => {
                  const orgSelect = document.querySelector('select.form-select');
                  const searchInput = document.getElementById('searchInput');

                  if (
                    orgSelect &&
                    !orgSelect.contains(e.target) &&
                    e.target !== searchInput
                  ) {
                    orgSelect.size = 1;
                  }
                });

                
              </script>
               `
                : ""
            }
            </div>

            
            <div class="col-md-4 text-end">
            
            Query Time: ${Date.now() - startTime}
              <select class="form-select d-inline-block w-auto" onchange="location = '${address}' + '${selectedOrg}/' + this.value + '/${page}'">
                <option value='5' ${limit == 5 ? "selected" : ""}>5 per page</option>
                <option value='10' ${limit == 10 ? "selected" : ""}>10 per page</option>
                <option value='20' ${limit == 20 ? "selected" : ""}>20 per page</option>
                <option value='50' ${limit == 50 ? "selected" : ""}>50 per page</option>
                <option value='100' ${limit == 100 ? "selected" : ""}>100 per page</option>
                <option value='250' ${limit == 250 ? "selected" : ""}>250 per page</option>
              </select>
              
              

                
            ${
              tableName === "sync_logs"
                ? `<form method="post" action="/api/superadmin/list/sync_logs/" style="display:inline;" onsubmit="return confirm('Are you sure you want to clear all ' + '${pageName}'.toLowerCase() + '? This action cannot be undone.')">
              <input type="hidden" name="action" value="clear_logs" />
              <button type="submit" class="btn btn-danger ms-2"><i class="bi bi-trash"></i> Empty</button>
            </form>`
                : ""
            }
        
        </div>
      </div>
    </div>`;

  const [totalPagesQueryResult] = await db.query(
    `SELECT COUNT(*) AS count FROM ${tableName} ${orgFilter ? `WHERE ${orgFilter}` : ""}`,
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
  const sortableCounts = [
    "u.user_name",
    "o.name",
  ];

  let orderBy;

  if (sortableCounts.includes(sortColumn)) {
    orderBy = sortColumn; // computed column
  } else {
    orderBy = `tb.${sortColumn}`; // normal column
  }
  const pages = getPaginationPages(page, totalPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  let query = `SELECT 
  tb.*
FROM ${tableName} tb
${orgFilter ? `WHERE tb.${orgFilter}` : ""}
ORDER BY ${orderBy} ${sortDir}
LIMIT ${limit} OFFSET ${offset};`;

  if (tableName == "sync_logs") {
    query = `SELECT 
  tb.*
FROM ${tableName} tb
${orgFilter ? `WHERE tb.${orgFilter}` : ""}
ORDER BY ${orderBy} ${sortDir}
LIMIT ${limit} OFFSET ${offset};`;
  }

  if (tableName == "journals") {
    
    [accounts] = await db.query(`SELECT * FROM \`accounts\` ${orgFilter ? `WHERE ${orgFilter}` : ""}`);
    query = `SELECT 
  tb.*
FROM ${tableName} tb
${orgFilter ? `WHERE tb.${orgFilter}` : ""}
ORDER BY ${orderBy} ${sortDir}
LIMIT ${limit} OFFSET ${offset};`;
  }

  console.log(query);
  let [rows] = await db.query(query);

  console.log("SYNC LOGS:", rows.length);
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
            ${
              tableName == "product_categories" ||
              tableName == "product_units" ||
              tableName == "product_brands" ||
              tableName == "product_generics" ||
              tableName == "currencies"
                ? `
              <th>Name</th>
              <th>Code</th>
              `
                : ""
            }



             ${
               tableName == "journals"
                 ? `
              <th>First Account</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Second Account</th>
              <th>Reference Type</th>
              `
                 : ""
             }

             ${
               tableName == "stock_transactions"
                 ? `
              <th>Product ID</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Total Amount</th>
              `
                 : ""
             }
             ${
               tableName == "product_images"
                 ? `
              <th>Product</th>
              <th>Thumbnail</th>
              `
                 : ""
             }
             ${
               tableName == "wastes"
                 ? `
              <th>Total Amount</th>
              <th>Waste Status</th>
              `
                 : ""
             }


             ${
               tableName == "stock_transfers"
                 ? `
              <th>Transfer Number</th>
              <th>Total Amount</th>
              <th>Transfer Status</th>
              `
                 : ""
             }
             ${
               tableName == "settings"
                 ? `
              <th>Key</th>
              <th>Value</th>
              <th>Category</th>
              <th>Type</th>
              `
                 : ""
             }
             ${
               tableName == "users"
                 ? `
              <th>User Name</th>
              <th>Email</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Phone</th>
              <th>Role ID</th>
              <th>Latest Sync</th>
              `
                 : ""
             }
            ${
              tableName == "sync_logs"
                ? `
              <th>Sync Status</th>
              <th>Tab Ses ID</th>
              <th>Time</th>
              <th>records_received</th>
              <th>records_applied</th>
              <th>records_sent</th>
              <th>Request Size</th>
              <th>Response Size</th>
              <th>Error Message</th>
              <th>App Version</th>
              <th>IP Address</th>
              `
                : ""
            }
              ${
                tableName == "sales"
                  ? `

              <th>Invoice Number</th>
              <th>Total Amount</th>

            `
                  : ""
              }

              ${
                tableName == "purchases"
                  ? `

              <th>Bill Number</th>
              <th>Total Amount</th>

            `
                  : ""
              }

             ${
               tableName == "accounts"
                 ? `

              <th>Account Name</th>

              <th>Account Type</th>
            `
                 : ""
             }
             
             ${
               tableName == "account_groups"
                 ? `

              <th>Group Name</th>

            `
                 : ""
             }


             ${
               tableName == "warehouses"
                 ? `

              <th>Warehouse Name</th>

              <th>Location</th>
            `
                 : ""
             }


              ${
                tableName == "products"
                  ? `

              <th>Product Name</th>

              <th>Code</th>

              <th>Buy Price</th>

              <th>Sell Price</th>


            `
                  : ""
              }

              ${
                tableName == "activity_logs"
                  ? `

              <th>Action</th>

              <th>Table Name</th>

              <th>Entity ID</th>

              <th>Description</th>


            `
                  : ""
              }

           

            ${tableName !== "sync_logs" ? "<th>Local ID</th>" : ""}
            ${selectedOrg == "0" ? `<th>Organization</th>` : ""}


                  ${
                    tableName == "sync_logs"
                      ? /*html*/ `
                  <th>Username</th>`
                      : /*html*/ `<th>Created By</th>`
                  }
            

            <th>ID</th>
             ${
               tableName != "sync_logs"
                 ? `
              
            <th>ST</th>
            <th>Actions</th>
              `
                 : ""
             }
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, i) => /*html*/ `
                <tr>
                  <td>${i + 1 + offset}</td>
                 
                  <td>${showTimeAgo(row.created_at)}</td>
${
  tableName == "product_images"
    ? `
              <td>${row.product_id}</td>
              <td><img src="${row.thumbnail}" /></td>
              `
    : ""
}
                  ${
                    tableName == "wastes"
                      ? `
              <td>${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>
              <td>${row.waste_status || ""}</td>
              `
                      : ""
                  }


             ${
               tableName == "stock_transfers"
                 ? `
              <td>${row.transfer_number || ""}</td>
              <td>${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>
              <td>${row.transfer_status || ""}</td>
              `
                 : ""
             }

                  ${
                    tableName == "stock_transactions"
                      ? `
              <td>${row.product_id || ""}</td>
              <td>${row.transaction_type || ""}</td>
              <td>${Number(row.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td>${Number(row.unit_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>
              <td>${Number(row.total_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>
              `
                      : ""
                  }


                  ${
                    tableName == "product_categories" ||
                    tableName == "product_units" ||
                    tableName == "product_brands" ||
                    tableName == "product_generics" ||
                    tableName == "currencies"
                      ? `
              <td>${row.name || ""}</td>
              <td>${row.code || ""}</td>
              `
                      : ""
                  }


             ${
               tableName == "journals"
                 ? `
                  <td>${row.first_entry_account ? accounts.find(a=>a.local_id==row.first_entry_account&&a.org_id==row.org_id)?.name || "" : ""}</td>
              <td>${row.first_entry_debit != 0 ? Number(row.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + (row.currency || "") : ""}</td>
              <td>${row.first_entry_credit != 0 ? Number(row.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + (row.currency || "") : ""}</td>
              <td>${row.second_entry_account ? accounts.find(a=>a.local_id==row.second_entry_account&&a.org_id==row.org_id)?.name || "" : ""}</td>
              <td>${row.reference_type || ""}</td>
              `
                 : ""
             }

                  ${
                    tableName == "sync_logs"
                      ? /*html*/ `
                  <td>${row.sync_status}</td>
                  <td><a href="/api/superadmin/command/0/${row.org_id}/${row.user_id}/${row.tab_ses_id}/tab_ses_id/" class='btn btn-link'>${row.tab_ses_id}</a></td>
                  <td>${row.finished_at ? row.finished_at - row.started_at + " ms" : "In Progress"}</td>
                  <td>${row.records_received || 0}</td>
                  <td>${row.records_applied || 0}</td>
                  <td>${row.records_sent || 0}</td>
                  <td>${humanSizeFormat(row.request_size || 0)}</td>
                  <td>${humanSizeFormat(row.response_size || 0)}</td>
                  <td>${row.error_message || ""}</td>
                  <td>${row.app_version || ""}</td>
                  <td>${JSON.parse(row.client_info)?.ip || ""}</td>
                  `
                      : ""
                  }

                  ${
                    tableName == "sales"
                      ? /*html*/ `


                  <td>${row.invoice_number || ""}</td>
                  <td>${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>`
                      : ""
                  }

                  ${
                    tableName == "purchases"
                      ? /*html*/ `


                  <td>${row.bill_number || ""}</td>
                  <td>${Number(row.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ""}</td>`
                      : ""
                  }

                  ${
                    tableName == "accounts"
                      ? /*html*/ `

               <td>${row.name || 0} </td>

                  <td>${row.account_type_id ? accountTypeNames[Number(row.account_type_id)] || "" : ""}</td>`
                      : ""
                  }
${
  tableName == "account_groups"
    ? `

              <td>${row.name}</td>

            `
    : ""
}
                  ${
                    tableName == "warehouses"
                      ? /*html*/ `

               <td>${row.name || 0} </td>

                  <td>${row.location || 0} </td>`
                      : ""
                  }

                  ${
                    tableName == "products"
                      ? /*html*/ `

               <td>${row.name || 0} </td>

                  <td>${row.code || 0} </td>
                  <td>${Number(row.buy_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.buy_currency || ""} </td>
                  <td>${Number(row.sell_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.sell_currency || ""} </td>`
                      : ""
                  }
 ${
   tableName == "users"
     ? /*html*/ `
              <td>${row.username || ""}</td>
              <td>${row.email || ""}</td>
              <td>${row.first_name || ""}</td>
              <td>${row.last_name || ""}</td>
              <td>${row.phone || ""}</td>
              <td>${row.role_id || ""}</td>
              <td><span class="${Date.now() - new Date(row.latest_sync || 0).getTime() > 60000 ? "badge badge-secondary" : "badge bg-success text-white"}">${showTimeAgo(row.latest_sync) || ""}</span></td>
              `
     : ""
 }

               ${
                 tableName == "settings"
                   ? /*html*/ `
              <td>${row.key || ""}</td>
              <td>${row.value.startsWith ? (row.value.startsWith("data:") ? "<img src='" + row.value + "' alt='Value' style='max-width:100px'>" : row.value) : ""}</td>
              <td>${row.category || ""}</td>
              <td>${row.type || ""}</td>
              `
                   : ""
               }

                   ${
                     tableName == "activity_logs"
                       ? /*html*/ `


                  <td>${row.action || 0} </td>

                  <td>${row.table_name || 0} </td>

                  <td>${row.entity_id || 0} </td>

                  <td>${row.description || 0} </td>`
                       : ""
                   }
                      
                  ${tableName !== "sync_logs" ? `<td>${row.local_id || ""}</td>` : ""}

                  ${selectedOrg == "0" ? `<td><button class="btn btn-sm btn-outline-secondary" onclick="selectOrg(${row.org_id})">${orgs.find(o=>o.id==row.org_id)?.name||""} (z${row.org_id})</button></td>` : ""}
                  
                  <td>${row.created_by ? users.find(u=>u.local_id==row.created_by)?.username||"":""}</td>
                 
                  <td>${row.id}</td>


                  ${
                    tableName !== "sync_logs"
                      ? /*html*/ `
                    <td>${row.status}</td>
                    <td>
                    <a href="/api/superadmin/view/${tableName}/${row.id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-eye"></i> View</a>  


                        ${
                          tableName == "users"
                            ? /*html*/ `
                          
                    <button class="btn btn-sm btn-success" onclick="loginAsUser('${row.username}')"><i class="bi bi-box-arrow-in-right"></i> Login</a>  

                          `
                            : ""
                        }
                    </td>`
                      : ""
                  }


                  
                
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
