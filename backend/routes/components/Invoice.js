const DashLayout = require("./DashLayout");
// Helper: Format date to Asia/Kabul timezone
function getLocalDateTime(mysqlDate, format = "datetime-local") {
  if (!mysqlDate) return "";
  const date = new Date(mysqlDate);
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

  if (format === "display") {
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
  }
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function formatMySQLDateKabulToUTC(dateString) {
  if (!dateString) return null;

  // interpret input as Asia/Kabul time
  const dateInKabul = new Date(dateString + ":00");
  // add seconds so JS parses it safely

  // convert to UTC ISO
  const utc = new Date(dateInKabul.toISOString());

  // MySQL DATETIME(3) format
  return utc.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}
// Helper: Format currency
function formatCurrency(amount, currency = "USD") {
  if (!currency || currency == "null") currency = "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount || 0);
}

// Helper: Generate unique invoice number
function generateInvoiceNumber(orgId, invoiceId, date) {
  if (String(invoiceId).length > 6) invoiceId = String(Date.now()).slice(-6); // fallback for new invoices
  const year = new Date(date).getFullYear();
  const month = String(new Date(date).getMonth() + 1).padStart(2, "0");
  return `INV-${orgId}-${year}${month}-${String(invoiceId).padStart(6, "0")}`;
}

module.exports = {
  // 📄 List all invoices for a subscription
  async listInvoices(req, res, db) {
    const subscription_id = req.params.subscription_id;

    try {
      const [invoices] = await db.query(
        `
        SELECT 
          si.*,
          sp.name as plan_name,
          o.name as org_name,
          (SELECT COALESCE(SUM(amount), 0) FROM subscription_payments 
           WHERE subscription_invoice_id = si.id AND status = 1) as total_paid
        FROM subscription_invoices si
        LEFT JOIN subscriptions s ON si.subscription_id = s.id
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        LEFT JOIN organizations o ON s.org_id = o.id
        WHERE si.subscription_id = ? AND si.status = 1
        ORDER BY si.invoice_date DESC
      `,
        [subscription_id],
      );

      const [subscription] = await db.query(
        `SELECT * FROM subscriptions WHERE id = ?`,
        [subscription_id],
      );

      res.send(
        DashLayout(
          "Invoices",
          req,
          /*html*/ `
        <div class="container-fluid py-4">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="fw-bold mb-0">
              <i class="bi bi-receipt me-2 text-primary"></i>Invoices for Subscription #${subscription_id}
            </h3>
            <div>
              <a href="/api/superadmin/list-subscriptions/all/created_at/DESC/0/20/1" class="btn btn-outline-secondary btn-sm me-2">
                <i class="bi bi-arrow-left"></i> Back
              </a>
              <a href="/api/superadmin/invoice/new/${subscription_id}" class="btn btn-primary btn-sm">
                <i class="bi bi-plus-circle"></i> Create Invoice
              </a>
            </div>
          </div>

          <div class="card shadow-sm">
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-hover align-middle">
                  <thead class="table-light">
                    <tr>
                      <th>Invoice #</th>
                      <th>Period</th>
                      <th>Issue Date</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      invoices.length > 0
                        ? invoices
                            .map(
                              (inv) => `
                      <tr>
                        <td><strong class="text-primary">#${inv.invoice_number}</strong></td>
                        <td>
                          <small class="d-block">${getLocalDateTime(inv.billing_start_date, "display").split(" ")[0]}</small>
                          <small class="text-muted">to ${getLocalDateTime(inv.billing_end_date, "display").split(" ")[0]}</small>
                        </td>
                        <td>${getLocalDateTime(inv.invoice_date, "display")}</td>
                        <td>${getLocalDateTime(inv.due_date, "display")}</td>
                        <td><strong>${formatCurrency(inv.total_amount, inv.currency)}</strong></td>
                        <td class="text-success">${formatCurrency(inv.total_paid, inv.currency)}</td>
                        <td class="${inv.total_amount - inv.total_paid > 0 ? "text-danger" : "text-success"}">
                          <strong>${formatCurrency(inv.total_amount - inv.total_paid, inv.currency)}</strong>
                        </td>
                        <td>
                          <span class="badge bg-${
                            inv.invoice_status === "paid"
                              ? "success"
                              : inv.invoice_status === "partial"
                                ? "warning"
                                : inv.invoice_status === "overdue"
                                  ? "danger"
                                  : "secondary"
                          }">${inv.invoice_status?.toUpperCase()}</span>
                        </td>
                        <td>
                          <div class="btn-group btn-group-sm">
                            <a href="/api/superadmin/invoice/view/${inv.id}" class="btn btn-outline-primary" title="View">
                              <i class="bi bi-eye"></i>
                            </a>
                            <a href="/api/superadmin/invoice/edit/${inv.id}" class="btn btn-outline-warning" title="Edit">
                              <i class="bi bi-pencil"></i>
                            </a>
                          </div>
                        </td>
                      </tr>
                    `,
                            )
                            .join("")
                        : `
                      <tr><td colspan="9" class="text-center py-4 text-muted">No invoices found</td></tr>
                    `
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        `,
        ),
      );
    } catch (err) {
      console.error("Error listing invoices:", err);
      res.status(500).send("Failed to load invoices");
    }
  },

  // ✏️ Create/Edit Invoice Form
  async invoiceForm(req, res, db) {
    const invoice_id = req.params.invoice_id
      ? Number(req.params.invoice_id)
      : 0;
    let subscription_id = req.params.subscription_id
      ? Number(req.params.subscription_id)
      : null;

    try {
      // Fetch subscription data with features
      if (invoice_id != 0 && !subscription_id) {
        const [invLookup] = await db.query(
          `SELECT subscription_id FROM subscription_invoices WHERE id = ?`,
          [invoice_id],
        );
        if (invLookup.length) {
          subscription_id = invLookup[0].subscription_id;
        }
      }
      if (!subscription_id) {
        return res.status(400).send("Subscription ID is required");
      }
      const [subs] = await db.query(
        `
        SELECT s.*, sp.name as plan_name, sp.price as plan_price, sp.currency as plan_currency,
               o.name as org_name
        FROM subscriptions s
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        LEFT JOIN organizations o ON s.org_id = o.id
        WHERE s.id = ?
      `,
        [subscription_id],
      );

      if (!subs.length) return res.status(404).send("Subscription not found");
      const subscription = subs[0];

      // Fetch subscription features
      const [features] = await db.query(
        `
        SELECT f.name, f.type,f.icon, sf.value, sf.unit
        FROM subscription_features sf
        JOIN features f ON f.id = sf.feature_id
        WHERE sf.subscription_id = ?
      `,
        [subscription_id],
      );

      let invoice = {};
      if (invoice_id != 0) {
        const [inv] = await db.query(
          `SELECT * FROM subscription_invoices WHERE id = ?`,
          [invoice_id],
        );
        if (!inv.length) return res.status(404).send("Invoice not found");
        invoice = inv[0];
      } else {
        // Pre-fill new invoice defaults
        invoice = {
          subscription_id,
          invoice_number: "",
          billing_start_date: subscription.start_date,
          billing_end_date: subscription.end_date,
          invoice_date: new Date(),
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          total_amount:
            subscription.price_override == 0 ||
            subscription.price_override == null ||
            subscription.price_override == undefined
              ? Number(subscription.plan_price)
              : Number(subscription.price_override),
          paid_amount: 0,
          currency:
            subscription.currency || subscription.plan_currency || "USD",
          invoice_status: "draft",
          description: `Subscription: ${subscription.plan_name}`,
          status: 1,
        };
      }

      // Fetch payments for this invoice
      const [payments] = await db.query(
        `
        SELECT * FROM subscription_payments 
        WHERE subscription_invoice_id = ? AND status = 1
        ORDER BY payment_date DESC
      `,
        [invoice_id != 0 ? invoice_id : 0],
      );

      res.send(
        DashLayout(
          invoice_id != 0
            ? `Edit Invoice #${invoice.invoice_number}`
            : "Create New Invoice",
          req,
          /*html*/ `
        <div class="container-fluid py-4">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="fw-bold mb-0">
              <i class="bi bi-file-earmark-text me-2 text-primary"></i>
              ${invoice_id != 0 ? "Edit Invoice" : "Create Invoice"}
            </h3>
            <a href="/api/superadmin/invoices/${subscription_id}" class="btn btn-outline-secondary btn-sm">
              <i class="bi bi-arrow-left"></i> Back to List
            </a>
          </div>

          <form method="POST" action="/api/superadmin/invoice/save" id="invoiceForm">
            <input type="hidden" name="invoice_id" value="${invoice_id}">
            <input type="hidden" name="subscription_id" value="${subscription_id}">
            
            <div class="row g-4">
              <!-- Invoice Details Card -->
              <div class="col-lg-8">
                <div class="card shadow-sm mb-4">
                  <div class="card-header bg-primary text-white">
                    <h5 class="mb-0"><i class="bi bi-info-circle me-2"></i>Invoice Details</h5>
                  </div>
                  <div class="card-body">
                    <div class="row g-3">
                      <div class="col-md-6">
                        <label class="form-label small text-muted">Invoice Number <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" name="invoice_number" 
                               value="${invoice.invoice_number || generateInvoiceNumber(subscription.org_id, invoice_id || Date.now(), invoice.invoice_date)}"
                               placeholder="Auto-generated if empty" required>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label small text-muted">Status</label>
                        <select class="form-select" name="invoice_status">
                          <option value="draft" ${invoice.invoice_status === "draft" ? "selected" : ""}>Draft</option>
                          <option value="sent" ${invoice.invoice_status === "sent" ? "selected" : ""}>Sent</option>
                          <option value="paid" ${invoice.invoice_status === "paid" ? "selected" : ""}>Paid</option>
                          <option value="partial" ${invoice.invoice_status === "partial" ? "selected" : ""}>Partial</option>
                          <option value="overdue" ${invoice.invoice_status === "overdue" ? "selected" : ""}>Overdue</option>
                          <option value="cancelled" ${invoice.invoice_status === "cancelled" ? "selected" : ""}>Cancelled</option>
                        </select>
                      </div>
                      
                      <div class="col-md-4">
                        <label class="form-label small text-muted">Billing Start <span class="text-danger">*</span></label>
                        <input type="datetime-local" class="form-control" name="billing_start_date" 
                               value="${getLocalDateTime(invoice.billing_start_date)}" required>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label small text-muted">Billing End <span class="text-danger">*</span></label>
                        <input type="datetime-local" class="form-control" name="billing_end_date" 
                               value="${getLocalDateTime(invoice.billing_end_date)}" required>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label small text-muted">Currency</label>
                        <select class="form-select" name="currency">
                          <option value="USD" ${invoice.currency === "USD" ? "selected" : ""}>USD ($)</option>
                          <option value="EUR" ${invoice.currency === "EUR" ? "selected" : ""}>EUR (€)</option>
                          <option value="GBP" ${invoice.currency === "GBP" ? "selected" : ""}>GBP (£)</option>
                          <option value="AFN" ${invoice.currency === "AFN" ? "selected" : ""}>AFN (؋)</option>
                        </select>
                      </div>

                      <div class="col-md-4">
                        <label class="form-label small text-muted">Issue Date <span class="text-danger">*</span></label>
                        <input type="datetime-local" class="form-control" name="invoice_date" 
                               value="${getLocalDateTime(invoice.invoice_date)}" required>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label small text-muted">Due Date <span class="text-danger">*</span></label>
                        <input type="datetime-local" class="form-control" name="due_date" 
                               value="${getLocalDateTime(invoice.due_date)}" required>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label small text-muted">Total Amount <span class="text-danger">*</span></label>
                        <input type="number" step="0.000001" class="form-control" name="total_amount" 
                               value="${invoice.total_amount || 0}" required>
                      </div>

                      <div class="col-12">
                        <label class="form-label small text-muted">Description / Notes</label>
                        <textarea class="form-control" name="description" rows="3">${invoice.description || ""}</textarea>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Features Card -->
                <div class="card shadow-sm mb-4">
                  <div class="card-header bg-info text-white">
                    <h5 class="mb-0"><i class="bi bi-stars me-2"></i>Subscription Features</h5>
                  </div>
                  <div class="card-body">
                  <div class="row g-2">
          ${
            features.length > 0
              ? features
                  .map(
                    (f) => `
            <div class="col-md-3">
              <div class="small">
                <strong class="${f.value == "false" ? "text-muted" : ""}"><i class="${f.icon}"></i> ${f.name}</strong><br>
                <span class="badge badge-${f.value == "false" ? "danger" : "success"}">${f.value == "true" ? `<i class="bi bi-check-circle"></i>` : f.value == "false" ? `<i class="bi bi-x-circle"></i>` : f.value || ""} ${(f.unit != "null" && f.unit) || ""}</span>
              </div>
            </div>
          `,
                  )
                  .join("")
              : '<p class="text-muted mb-0">No features listed</p>'
          }
        </div>
                    
                  </div>
                </div>
              </div>

              <!-- Payments & Summary Card -->
              <div class="col-lg-4">
                <div class="card shadow-sm mb-4  ${invoice_id != 0 ? "" : "d-none"}">
                  <div class="card-header bg-success text-white">
                    <h5 class="mb-0"><i class="bi bi-wallet2 me-2"></i>Payments</h5>
                  </div>
                  <div class="card-body">
                    <div id="payments-list">
                      ${
                        payments.length > 0
                          ? payments
                              .map(
                                (p) => `
                        <div class="border rounded p-3 mb-2 bg-light">
                          <div class="d-flex justify-content-between">
                            <strong>${formatCurrency(p.amount, p.currency)}</strong>
                            <small class="text-muted">${getLocalDateTime(p.payment_date, "display").split(" ")[0]}</small>
                          </div>
                          <small class="text-muted d-block">${p.payment_method || "Unknown"}</small>
                          ${p.description ? `<small class="d-block text-secondary">${p.description}</small>` : ""}
                        </div>
                      `,
                              )
                              .join("")
                          : `<p class="text-muted small">No payments recorded yet.</p>`
                      }
                    </div>
                    
                    <hr>
                    <div class="d-grid">
                      <button type="button" class="btn btn-outline-success btn-sm" data-mdb-ripple-init data-mdb-modal-init data-mdb-target="#addPaymentModal">
                        <i class="bi bi-plus-circle"></i> Add Payment
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Summary Card -->
                <div class="card shadow-sm border-primary">
                  <div class="card-body">
                    <h6 class="fw-bold mb-3">Invoice Summary</h6>
                    <div class="d-flex justify-content-between mb-2">
                      <span>Subtotal:</span>
                      <span id="subtotal-display">${formatCurrency(invoice.total_amount || 0, invoice.currency)}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2 text-success">
                      <span>Paid:</span>
                      <span id="paid-display">${formatCurrency(invoice.paid_amount || 0, invoice.currency)}</span>
                    </div>
                    <div class="d-flex justify-content-between fw-bold border-top pt-2 ${(invoice.total_amount || 0) - (invoice.paid_amount || 0) > 0 ? "text-danger" : "text-success"}">
                      <span>Balance Due:</span>
                      <span id="balance-display">${formatCurrency((invoice.total_amount || 0) - (invoice.paid_amount || 0), invoice.currency)}</span>
                    </div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="d-grid gap-2 mt-4">
                  <button type="submit" class="btn btn-primary btn-lg">
                    <i class="bi bi-check-circle me-2"></i>Save Invoice
                  </button>
                  ${
                    invoice_id != 0
                      ? `
                    <button type="button" onclick="window.print()" class="btn btn-outline-secondary">
                      <i class="bi bi-printer me-2"></i>Print
                    </button>
                  `
                      : ""
                  }
                </div>
              </div>
            </div>
          </form>
        </div>

        <!-- Add Payment Modal -->
        <div class="modal fade" id="addPaymentModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <form action="/api/superadmin/payment/save" method="POST">
                <input type="hidden" name="subscription_invoice_id" value="${invoice_id != 0 ? invoice_id : ""}">
                <div class="modal-header">
                  <h5 class="modal-title">Record Payment</h5>
                  <button type="button" class="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <div class="mb-3">
                    <label class="form-label">Amount *</label>
                    <input type="number" step="0.000001" class="form-control" name="amount" required>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Currency</label>
                    <select class="form-select" name="currency">
                      <option value="USD" ${invoice.currency === "USD" ? "selected" : ""}>USD ($)</option>
                      <option value="EUR" ${invoice.currency === "EUR" ? "selected" : ""}>EUR (€)</option>
                      <option value="GBP" ${invoice.currency === "GBP" ? "selected" : ""}>GBP (£)</option>
                      <option value="AFN" ${invoice.currency === "AFN" ? "selected" : ""}>AFN (؋)</option>
                    </select>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Payment Date</label>
                    <input type="datetime-local" class="form-control" name="payment_date" 
                           value="${getLocalDateTime(new Date())}">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Payment Method</label>
                    <select class="form-select" name="payment_method">
                      <option value="cash">Cash</option>
                      <option value="exchange_transfer">Exchange Transfer</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Description</label>
                    <textarea class="form-control" name="description" rows="2"></textarea>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary"  data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close">Cancel</button>
                  <button type="submit" class="btn btn-success">Save Payment</button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <script>
          // Real-time balance calculation
          document.querySelectorAll('input[name="total_amount"], input[name="paid_amount"]').forEach(input => {
            input.addEventListener('change', updateSummary);
          });
          
          function updateSummary() {
            const total = parseFloat(document.querySelector('[name="total_amount"]').value) || 0;
            const paid = parseFloat(document.querySelector('[name="paid_amount"]')?.value) || 0;
            const currency = document.querySelector('[name="currency"]').value;
            
            const formatter = new Intl.NumberFormat("en-US", {
              style: "currency", currency: currency, minimumFractionDigits: 2
            });
            
            document.getElementById('subtotal-display').textContent = formatter.format(total);
            document.getElementById('paid-display').textContent = formatter.format(paid);
            document.getElementById('balance-display').textContent = formatter.format(total - paid);
          }
          
          // Auto-generate invoice number if empty
          document.querySelector('[name="invoice_number"]').addEventListener('blur', function() {
            if (!this.value.trim()) {
              const orgId = ${subscription.org_id};
              const date = new Date(document.querySelector('[name="invoice_date"]').value || Date.now());
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              this.value = \`INV-\${orgId}-\${year}\${month}-\${String(Date.now()).slice(-6)}\`;
            }
          });
        </script>
        `,
        ),
      );
    } catch (err) {
      console.error("Error loading invoice form:", err);
      res.status(500).send("Failed to load invoice form");
    }
  },

  // 💾 Save Invoice (Create/Update)
  async saveInvoice(req, res, db) {
    if (req.session.user?.username !== "superadmin") {
      return res.status(403).send("Forbidden");
    }

    try {
      const data = req.body;
      const invoice_id = data.invoice_id ? Number(data.invoice_id) : null;

      const invoiceData = {
        subscription_id: Number(data.subscription_id),
        invoice_number: data.invoice_number.trim(),
        billing_start_date: data.billing_start_date
          ? formatMySQLDateKabulToUTC(data.billing_start_date)
          : null,
        billing_end_date: data.billing_end_date
          ? formatMySQLDateKabulToUTC(data.billing_end_date)
          : null,
        invoice_date: data.invoice_date
          ? formatMySQLDateKabulToUTC(data.invoice_date)
          : new Date(),
        due_date: data.due_date
          ? formatMySQLDateKabulToUTC(data.due_date)
          : null,
        total_amount: parseFloat(data.total_amount) || 0,
        paid_amount: parseFloat(data.paid_amount) || 0,
        currency: data.currency || "USD",
        invoice_status: data.invoice_status || "draft",
        description: data.description || null,
        status: 1,
        updated_at: new Date(),
      };

      if (invoice_id) {
        // Update existing invoice
        await db.query(
          `
          UPDATE subscription_invoices SET 
            invoice_number=?, billing_start_date=?, billing_end_date=?, 
            invoice_date=?, due_date=?, total_amount=?, paid_amount=?,
            currency=?, invoice_status=?, description=?, updated_at=?
          WHERE id=?
        `,
          [
            invoiceData.invoice_number,
            invoiceData.billing_start_date,
            invoiceData.billing_end_date,
            invoiceData.invoice_date,
            invoiceData.due_date,
            invoiceData.total_amount,
            invoiceData.paid_amount,
            invoiceData.currency,
            invoiceData.invoice_status,
            invoiceData.description,
            new Date(),
            invoice_id,
          ],
        );
      } else {
        // Create new invoice
        invoiceData.created_at = new Date();
        const [result] = await db.query(
          `
          INSERT INTO subscription_invoices SET ?
        `,
          [invoiceData],
        );
        invoiceData.id = result.insertId;

        // Auto-generate invoice number if not provided
        if (!invoiceData.invoice_number.trim()) {
          const newNumber = generateInvoiceNumber(
            data.org_id || 1,
            result.insertId,
            invoiceData.invoice_date,
          );
          await db.query(
            `UPDATE subscription_invoices SET invoice_number=? WHERE id=?`,
            [newNumber, result.insertId],
          );
        }
      }

      res.redirect(
        `/api/superadmin/invoice/view/${invoice_id || invoiceData.id}`,
      );
    } catch (err) {
      console.error("Error saving invoice:", err);
      res.status(500).send("Failed to save invoice: " + err.message);
    }
  },

  // 👁️ View Invoice (Printable)
  async viewInvoice(req, res, db) {
    const invoice_id = req.params.invoice_id;

    try {
      const [invoice] = await db.query(
        `
        SELECT 
          si.*,
          s.org_id, s.plan_id, s.start_date, s.end_date,
          sp.name as plan_name, sp.code as plan_code,
          o.name as org_name, o.id as org_id,
          (SELECT COALESCE(SUM(amount), 0) FROM subscription_payments 
           WHERE subscription_invoice_id = si.id AND status = 1) as total_paid
        FROM subscription_invoices si
        JOIN subscriptions s ON si.subscription_id = s.id
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        LEFT JOIN organizations o ON s.org_id = o.id
        WHERE si.id = ?
      `,
        [invoice_id],
      );

      if (!invoice.length) return res.status(404).send("Invoice not found");
      const inv = invoice[0];

      const [payments] = await db.query(
        `
        SELECT * FROM subscription_payments 
        WHERE subscription_invoice_id = ? AND status = 1
        ORDER BY payment_date DESC
      `,
        [invoice_id],
      );

      const [features] = await db.query(
        `
        SELECT f.name, f.type,f.icon, sf.value, sf.unit
        FROM subscription_features sf
        JOIN features f ON f.id = sf.feature_id
        WHERE sf.subscription_id = ?
      `,
        [inv.subscription_id],
      );

      // Render printable invoice template
      res.send(
        DashLayout(
          `Invoice #${inv.invoice_number}`,
          req,
          /*html*/ `
        <div class="container-fluid py-4">
          <div class="d-flex justify-content-between align-items-center mb-4 no-print">
            <h3 class="fw-bold mb-0">
              <i class="bi bi-receipt me-2 text-primary"></i>Invoice #${inv.invoice_number}
            </h3>
            <div class="btn-group">
              <a href="/api/superadmin/invoice/edit/${inv.id}" class="btn btn-warning btn-sm">
                <i class="bi bi-pencil"></i> Edit
              </a>
              <button onclick="window.print()" class="btn btn-secondary btn-sm">
                <i class="bi bi-printer"></i> Print
              </button>
              <a href="/api/superadmin/invoices/${inv.subscription_id}" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-arrow-left"></i> Back
              </a>
            </div>
          </div>

          <!-- Printable Invoice Area -->
          <div id="invoice-print-area" class="card shadow-lg border-0">
            ${renderInvoiceHTML(inv, payments, features)}
          </div>
        </div>

        <style>
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            #invoice-print-area { 
              box-shadow: none !important; 
              border: none !important;
              width: 100% !important;
              max-width: none !important;
            }
            .card { border: none !important; }
            a { text-decoration: none !important; color: inherit !important; }
          }
        </style>
        `,
        ),
      );
    } catch (err) {
      console.error("Error viewing invoice:", err);
      res.status(500).send("Failed to load invoice");
    }
  },

    // 💰 Save Payment (Record a payment against an invoice)
  async savePayment(req, res, db) {
    if (req.session.user?.username !== "superadmin") {
      return res.status(403).send("Forbidden: Only superadmin can record payments");
    }

    try {
      const data = req.body;
      
      // Validate required fields
      if (!data.subscription_invoice_id || !data.amount) {
        return res.status(400).send("Invoice ID and Amount are required");
      }

      const paymentData = {
        subscription_invoice_id: Number(data.subscription_invoice_id),
        amount: parseFloat(data.amount) || 0,
        currency: data.currency || "USD",
        payment_date: data.payment_date 
          ? formatMySQLDateKabulToUTC(data.payment_date) 
          : new Date(),
        payment_method: data.payment_method || "other",
        description: data.description || null,
        status: 1,
        created_at: new Date(),
        updated_at: new Date()
      };

      // 1️⃣ Insert the payment record
      const [paymentResult] = await db.query(
        `INSERT INTO subscription_payments SET ?`,
        [paymentData]
      );
      const paymentId = paymentResult.insertId;

      // 2️⃣ Recalculate total paid amount for this invoice
      const [paidSum] = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total_paid 
         FROM subscription_payments 
         WHERE subscription_invoice_id = ? AND status = 1`,
        [paymentData.subscription_invoice_id]
      );
      const newTotalPaid = parseFloat(paidSum[0].total_paid) || 0;

      // 3️⃣ Fetch invoice to get total_amount and update status
      const [invoice] = await db.query(
        `SELECT id, total_amount, invoice_status, currency FROM subscription_invoices WHERE id = ?`,
        [paymentData.subscription_invoice_id]
      );

      if (invoice.length) {
        const inv = invoice[0];
        const totalAmount = parseFloat(inv.total_amount) || 0;
        
        // Determine new invoice status
        let newStatus = inv.invoice_status;
        if (newTotalPaid <= 0) {
          newStatus = 'draft';
        } else if (newTotalPaid >= totalAmount) {
          newStatus = 'paid';
        } else if (newTotalPaid > 0 && newTotalPaid < totalAmount) {
          newStatus = inv.invoice_status === 'paid' ? 'partial' : 'partial';
        }

        // 4️⃣ Update invoice with new paid_amount and status
        await db.query(
          `UPDATE subscription_invoices 
           SET paid_amount = ?, invoice_status = ?, updated_at = ? 
           WHERE id = ?`,
          [newTotalPaid, newStatus, new Date(), paymentData.subscription_invoice_id]
        );
      }

      // 5️⃣ Redirect back to invoice view
      res.redirect(`/api/superadmin/invoice/view/${paymentData.subscription_invoice_id}`);

    } catch (err) {
      console.error("Error saving payment:", err);
      res.status(500).send("Failed to save payment: " + err.message);
    }
  },
};

function renderInvoiceHTML(inv, payments, features) {
  const balance = (inv.total_amount || 0) - (inv.total_paid || 0);

  return /*html*/ `
  <div class="card-body p-4 p-md-5">
    <!-- Header -->
    <div class="row mb-4">
      <div class="col-6">
      <img src="/img/logo.png" alt="Logo" style="height: 40px;" class="mb-2">
        <h2 class="fw-bold text-primary mb-1">INVOICE</h2>
        <p class="text-muted mb-0">#${inv.invoice_number}</p>
      </div>
      <div class="col-6 text-end">
        <h4 class="fw-bold mb-1">${inv.org_name || "Organization"} z${inv.org_id}</h4>
        <p class="text-muted mb-0 small">${inv.org_address || ""}</p>
        <p class="mb-0 small">${inv.org_email || ""} ${inv.org_phone ? `• ${inv.org_phone}` : ""}</p>
      </div>
    </div>

    <!-- Dates & Status -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <small class="text-muted d-block">Issue Date</small>
        <strong>${getLocalDateTime(inv.invoice_date, "display")}</strong>
      </div>
      <div class="col-md-3">
        <small class="text-muted d-block">Due Date</small>
        <strong class="${new Date(inv.due_date) < new Date() && inv.invoice_status !== "paid" ? "text-danger" : ""}">
          ${getLocalDateTime(inv.due_date, "display")}
        </strong>
      </div>
      <div class="col-md-3">
        <small class="text-muted d-block">Billing Period</small>
        <strong>
          ${getLocalDateTime(inv.billing_start_date, "display").split(" ")[0]}<br>
          to ${getLocalDateTime(inv.billing_end_date, "display").split(" ")[0]}
        </strong>
      </div>
      <div class="col-md-3 text-end">
        <small class="text-muted d-block">Status</small>
        <span class="badge bg-${
          inv.invoice_status === "paid"
            ? "success"
            : inv.invoice_status === "partial"
              ? "warning"
              : inv.invoice_status === "overdue"
                ? "danger"
                : "secondary"
        } fs-6">${inv.invoice_status?.toUpperCase()}</span>
      </div>
    </div>

    <!-- Plan & Features -->
    <div class="card bg-light mb-4">
      <div class="card-body">
        <h6 class="fw-bold mb-3">Subscription Plan: ${inv.plan_name || "Custom"}</h6>
        <div class="row g-2">
          ${
            features.length > 0
              ? features
                  .map(
                    (f) => `
            <div class="col-md-3">
              <div class="small">
                <strong class="${f.value == "false" ? "text-muted" : ""}"><i class="${f.icon}"></i> ${f.name}</strong><br>
                <span class="badge badge-${f.value == "false" ? "danger" : "success"}">${f.value == "true" ? `<i class="bi bi-check-circle"></i>` : f.value == "false" ? `<i class="bi bi-x-circle"></i>` : f.value || ""} ${(f.unit != "null" && f.unit) || ""}</span>
              </div>
            </div>
          `,
                  )
                  .join("")
              : '<p class="text-muted mb-0">No features listed</p>'
          }
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="table table-bordered mb-4">
      <thead class="table-light">
        <tr>
          <th>Description</th>
          <th class="text-end">Period</th>
          <th class="text-end">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${inv.description || `Subscription: ${inv.plan_name}`}</strong>
            ${inv.description ? `<br><small class="text-muted">${inv.description}</small>` : ""}
          </td>
          <td class="text-end small">
            ${getLocalDateTime(inv.billing_start_date, "display").split(" ")[0]}<br>
            – ${getLocalDateTime(inv.billing_end_date, "display").split(" ")[0]}
          </td>
          <td class="text-end fw-bold">${formatCurrency(inv.total_amount, inv.currency)}</td>
        </tr>
      </tbody>
      <tfoot class="table-light">
        <tr>
          <th colspan="2" class="text-end">Subtotal:</th>
          <th class="text-end">${formatCurrency(inv.total_amount, inv.currency)}</th>
        </tr>
        <tr>
          <th colspan="2" class="text-end text-success">Total Paid:</th>
          <th class="text-end text-success">-${formatCurrency(inv.total_paid || 0, inv.currency)}</th>
        </tr>
        <tr class="fs-5">
          <th colspan="2" class="text-end ${balance > 0 ? "text-danger" : "text-success"}">Balance Due:</th>
          <th class="text-end ${balance > 0 ? "text-danger" : "text-success"}">
            ${formatCurrency(balance, inv.currency)}
          </th>
        </tr>
      </tfoot>
    </table>

    <!-- Payments History -->
    ${
      payments.length > 0
        ? `
    <div class="mb-4">
      <h6 class="fw-bold mb-3">Payment History</h6>
      <table class="table table-sm table-striped">
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th class="text-end">Amount</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${payments
            .map(
              (p) => `
            <tr>
              <td>${getLocalDateTime(p.payment_date, "display").split(" ")[0]}</td>
              <td>${p.payment_method || "-"}</td>
              <td class="text-end fw-bold">${formatCurrency(p.amount, p.currency)}</td>
              <td><small class="text-muted">${p.description || "-"}</small></td>
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

    <!-- Footer -->
    <div class="border-top pt-4 mt-4 text-center text-muted small">
      <p class="mb-1">Thank you for your business!</p>
      <p class="mb-0">Questions? Contact us at ${inv.org_email || "support@zenoerp.com"}</p>
      <p class="mt-3 mb-0">Generated on ${new Date().toLocaleDateString("en-US", { timeZone: "Asia/Kabul" })}</p>
    </div>
  </div>
  `;
}
