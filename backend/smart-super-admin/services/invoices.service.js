const dates = require("../helpers/date-helpers");
module.exports = (db) => {
  async function subscription(identifier, executor = db.pool) {
    const record = await db.one("subscriptions", identifier, executor);
    const organization = await db.one("organizations", record.org_id, executor),
      plan = await db.one("subscription_plans", record.plan_id, executor);
    return {
      ...record,
      org_name: organization.name,
      plan_name: plan.name,
      plan_price: plan.price,
      plan_currency: plan.currency,
    };
  }
  async function features(subscriptionId) {
    const [rows] = await db.pool.execute(
      "SELECT f.name,f.type,sf.value,sf.unit FROM subscription_features sf JOIN features f ON f.id=sf.feature_id WHERE sf.subscription_id=? ORDER BY sf.id",
      [subscriptionId],
    );
    return rows;
  }
  async function payments(invoiceId) {
    const [rows] = await db.pool.execute(
      "SELECT id,amount,currency,payment_date,payment_method,description FROM subscription_payments WHERE subscription_invoice_id=? AND status=1 ORDER BY payment_date DESC,id DESC",
      [invoiceId],
    );
    return rows;
  }
  async function invoice(identifier) {
    const record = await db.one("subscription_invoices", identifier);
    const [balance] = await db.pool.execute(
      "SELECT total_amount-paid_amount AS balance FROM subscription_invoices WHERE id=?",
      [record.id],
    );
    return {
      record: { ...record, balance: balance[0].balance },
      subscription: await subscription(record.subscription_id),
      payments: await payments(record.id),
      features: await features(record.subscription_id),
    };
  }
  async function list(subscriptionId, query = {}) {
    const owner = await subscription(subscriptionId);
    const result = await db.list(
      "subscription_invoices",
      {
        sortcolumn: query.sort || "invoice_date",
        sortdir: query.dir || "DESC",
        org: 0,
        limit: query.limit || 20,
        page: query.page || 1,
      },
      { subscription_id: String(owner.id), status: "1", $search: query.q },
      {
        total_paid:
          "(SELECT COALESCE(SUM(amount),0) FROM subscription_payments WHERE subscription_invoice_id=subscription_invoices.id AND status=1)",
        balance: "(total_amount-paid_amount)",
      },
    );
    return { ...result, subscription: owner };
  }
  async function form(subscriptionId, invoiceId) {
    if (invoiceId) return invoice(invoiceId);
    const owner = await subscription(subscriptionId),
      now = new Date(),
      due = new Date(now.getTime() + 14 * 86400000);
    return {
      record: {
        id: 0,
        subscription_id: owner.id,
        currency: owner.currency || owner.plan_currency || "USD",
        invoice_status: "draft",
        invoice_date: now,
        due_date: due,
        total_amount: owner.price_override ?? owner.plan_price ?? "0",
        paid_amount: "0",
      },
      subscription: owner,
      payments: [],
      features: await features(owner.id),
    };
  }
  async function save(body) {
    const invoiceId = db.id(body.invoice_id || 0, true),
      ownerId = db.id(body.subscription_id),
      currency = db.text(body.currency || "USD", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) db.fail("Invalid currency");
    const state = db.text(body.invoice_status || "draft", 50);
    if (
      !["draft", "sent", "paid", "partial", "overdue", "cancelled"].includes(
        state,
      )
    )
      db.fail("Invalid invoice status");
    const data = {
      subscription_id: ownerId,
      invoice_number: db.text(body.invoice_number, 255),
      total_amount: db.money(body.total_amount || "0"),
      paid_amount: db.money(body.paid_amount || "0"),
      currency,
      invoice_status: state,
      description: db.text(body.description, 20000),
      status: 1,
      updated_at: new Date(),
    };
    for (const field of [
      "billing_start_date",
      "billing_end_date",
      "invoice_date",
      "due_date",
    ])
      data[field] = dates.formatMySQLDateKabulToUTC(body[field]);
    if (!data.invoice_date) data.invoice_date = new Date();
    if (
      data.billing_start_date &&
      data.billing_end_date &&
      data.billing_start_date > data.billing_end_date
    )
      db.fail("Billing end precedes billing start");
    return db.transaction(async (connection) => {
      const owner = await subscription(ownerId, connection);
      if (invoiceId) {
        const old = await db.one(
          "subscription_invoices",
          invoiceId,
          connection,
        );
        if (Number(old.subscription_id) !== ownerId)
          db.fail("Cannot change invoice subscription");
      } else data.created_at = new Date();
      const saved = await db.save(
        "subscription_invoices",
        data,
        invoiceId,
        connection,
      );
      if (!data.invoice_number)
        await connection.execute(
          "UPDATE subscription_invoices SET invoice_number=? WHERE id=?",
          [
            dates.generateInvoiceNumber(owner.org_id, saved, data.invoice_date),
            saved,
          ],
        );
      return saved;
    });
  }
  async function savePayment(body) {
    const invoiceId = db.id(body.subscription_invoice_id),
      amount = db.money(body.amount, true),
      currency = db.text(body.currency || "USD", 3).toUpperCase();
    const method = db.text(body.payment_method || "other", 255);
    if (
      ![
        "cash",
        "exchange_transfer",
        "bank_transfer",
        "credit_card",
        "other",
      ].includes(method)
    )
      db.fail("Invalid payment method");
    return db.transaction(async (connection) => {
      const [invoices] = await connection.execute(
        "SELECT id,currency,invoice_status FROM subscription_invoices WHERE id=? FOR UPDATE",
        [invoiceId],
      );
      if (!invoices.length) db.fail("Invoice not found", 404);
      if (invoices[0].currency !== currency)
        db.fail("Payment currency must match invoice");
      if (invoices[0].invoice_status === "cancelled")
        db.fail("Cannot pay a cancelled invoice");
      await db.save(
        "subscription_payments",
        {
          subscription_invoice_id: invoiceId,
          amount,
          currency,
          payment_date:
            dates.formatMySQLDateKabulToUTC(body.payment_date) || new Date(),
          payment_method: method,
          description: db.text(body.description, 20000),
          status: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        0,
        connection,
      );
      const [sum] = await connection.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM subscription_payments WHERE subscription_invoice_id=? AND status=1",
        [invoiceId],
      );
      await connection.execute(
        `UPDATE subscription_invoices SET paid_amount=?,invoice_status=CASE WHEN ? >= total_amount THEN 'paid' WHEN ? > 0 THEN 'partial' ELSE 'draft' END,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [sum[0].total, sum[0].total, sum[0].total, invoiceId],
      );
      return invoiceId;
    });
  }
  return { list, form, invoice, save, savePayment };
};
