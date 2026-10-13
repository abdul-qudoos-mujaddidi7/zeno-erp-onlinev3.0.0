const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");

test(
  "full anonymous Smart Super Admin workflow against isolated copies of the ERP schema",
  {
    skip: process.env.SMART_SUPER_ADMIN_TEST_MYSQL !== "1",
    timeout: 90000,
  },
  async () => {
    require("dotenv").config({ quiet: true });
    const mysql = require("mysql2/promise"),
      express = require("express"),
      session = require("express-session");
    const name = "zeno_smart_test_" + randomBytes(8).toString("hex");
    const options = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectTimeout: 5000,
    };
    let source,
      pool,
      server,
      created = false;
    try {
      source = await mysql.createConnection({
        ...options,
        database: process.env.DB_NAME,
      });
      await source.query(
        "CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        [name],
      );
      created = true;
      pool = mysql.createPool({
        ...options,
        database: name,
        timezone: "Z",
        connectionLimit: 6,
      });
      for (const table of require("../smart-super-admin/services/database")
        .TABLES) {
        try {
          const [ddl] = await source.query("SHOW CREATE TABLE ??", [table]);
          await pool.query(ddl[0]["Create Table"]);
        } catch (error) {
          if (error.code !== "ER_NO_SUCH_TABLE") throw error;
        }
      }
      const [org] = await pool.execute(
        "INSERT INTO organizations (name,code,type,inventory_method,status) VALUES (?,?,?,?,1)",
        [
          "Fixture <script>organization</script>",
          "SMARTFIX",
          "general",
          "CLASSIC",
        ],
      );
      const orgId = org.insertId;
      await pool.execute(
        "INSERT INTO users (org_id,local_id,username,password_hash,status) VALUES (?,?,?, ?,1)",
        [orgId, 777, "Fixture user", "PRIVATE_FIXTURE_HASH"],
      );
      const parent = express();
      parent.use(
        session({
          secret: randomBytes(32).toString("hex"),
          resave: false,
          saveUninitialized: false,
        }),
      );
      parent.use(
        "/smart-super-admin",
        require("../smart-super-admin/app")({
          pool,
          skipAccessControl: true,
        }),
      );
      server = parent.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}/smart-super-admin`;
      let cookie;
      async function request(url, body, json = false) {
        const data = new URLSearchParams();
        if (body && !json)
          for (const [key, value] of Object.entries(body)) {
            if (Array.isArray(value))
              for (const item of value) data.append(key + "[]", item);
            else data.append(key, value);
          }
        const response = await fetch(base + url, {
          redirect: "manual",
          method: body ? "POST" : "GET",
          headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body
              ? {
                  "Content-Type": json
                    ? "application/json"
                    : "application/x-www-form-urlencoded",
                }
              : {}),
          },
          ...(body ? { body: json ? JSON.stringify(body) : data } : {}),
        });
        if (response.headers.get("set-cookie"))
          cookie = response.headers.get("set-cookie").split(";")[0];
        return response;
      }
      const [bad] = await Promise.all([request("/list/users/id/DESC/0/251/1")]);
      assert.equal(bad.status, 400);
      let response = await request("/");
      assert.equal(response.status, 200);
      assert.match(await response.text(), /&lt;script&gt;organization/);
      response = await request("/list/users/id/DESC/0/20/1");
      assert.equal(response.status, 200);
      assert.doesNotMatch(
        await response.text(),
        /PRIVATE_FIXTURE_HASH|password_hash/,
      );
      assert.equal((await request("/select-org/" + orgId)).status, 303);
      assert.equal((await request("/select-org/999999999")).status, 404);
      response = await request("/?lang=ps");
      assert.match(await response.text(), /lang="ps-AF" dir="rtl"/);
      const type = {
        org_type_id: "0",
        name: "Fixture type",
        code: "smart-type",
        type_status: "active",
      };
      assert.equal((await request("/org-type", type)).status, 303);
      const [types] = await pool.query("SELECT id FROM org_types");
      const typeId = types[0].id;
      assert.equal((await request("/org-type/" + typeId)).status, 200);
      assert.equal(
        (
          await request("/org-type", {
            ...type,
            org_type_id: String(typeId),
            name: "Updated type",
          })
        ).status,
        303,
      );
      assert.equal(
        (
          await request("/feature", {
            feature_id: "0",
            name: "Fixture feature",
            feature_key: "smart-feature",
            type: "number",
            status: "1",
          })
        ).status,
        303,
      );
      const [features] = await pool.query("SELECT id FROM features");
      const featureId = features[0].id;
      const plan = {
        subscription_plan_id: "0",
        org_type_id: String(typeId),
        name: "Fixture plan",
        code: "smart-plan",
        is_active: "true",
        price: "0.3",
        recurring_price: "0.3",
        currency: "USD",
        billing_cycle_unit: "month",
        billing_cycle_count: "1",
        trial_days: "14",
        grace_period_days: "3",
        feature_id: [String(featureId)],
        feature_value: ["12"],
        feature_unit: ["units"],
      };
      assert.equal((await request("/subscription-plan", plan)).status, 303);
      const [plans] = await pool.query("SELECT id FROM subscription_plans");
      const planId = plans[0].id;
      response = await request("/subscription-plan-features/" + planId);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).length, 1);
      const subscription = {
        subscription_id: "0",
        org_id: String(orgId),
        plan_id: String(planId),
        subscription_status: "active",
        auto_renew: "true",
        currency: "USD",
        price_override: "",
        start_date: "2026-10-12T00:05",
        feature_id: [String(featureId)],
        feature_value: ["12"],
        feature_unit: ["units"],
      };
      assert.equal((await request("/subscription", subscription)).status, 303);
      const [subscriptions] = await pool.query("SELECT id FROM subscriptions");
      const subscriptionId = subscriptions[0].id;
      await pool.query("UPDATE subscription_features SET used_value=?", ["8"]);
      assert.equal(
        (
          await request("/subscription", {
            ...subscription,
            subscription_id: String(subscriptionId),
            feature_value: ["20"],
          })
        ).status,
        303,
      );
      const [usage] = await pool.query(
        "SELECT used_value FROM subscription_features",
      );
      assert.equal(usage[0].used_value, "8");
      assert.equal(
        (await request("/invoice/new/" + subscriptionId)).status,
        200,
      );
      const invoice = {
        invoice_id: "0",
        subscription_id: String(subscriptionId),
        invoice_number: "",
        invoice_status: "sent",
        total_amount: "0.3",
        paid_amount: "0",
        currency: "USD",
        invoice_date: "2026-10-12T00:05",
        due_date: "2026-10-26T00:05",
      };
      assert.equal((await request("/invoice/save", invoice)).status, 303);
      const [invoices] = await pool.query(
        "SELECT id,invoice_number FROM subscription_invoices",
      );
      const invoiceId = invoices[0].id;
      assert.match(invoices[0].invoice_number, /^INV-\d+-202610-/);
      assert.equal(
        (
          await request("/payment/save", {
            subscription_invoice_id: String(invoiceId),
            amount: "0.1",
            currency: "USD",
            payment_method: "cash",
          })
        ).status,
        303,
      );
      assert.equal(
        (
          await request("/payment/save", {
            subscription_invoice_id: String(invoiceId),
            amount: "0.2",
            currency: "USD",
            payment_method: "bank_transfer",
          })
        ).status,
        303,
      );
      const [paid] = await pool.query(
        "SELECT paid_amount,invoice_status FROM subscription_invoices",
      );
      assert.equal(paid[0].paid_amount, "0.300000");
      assert.equal(paid[0].invoice_status, "paid");
      assert.equal(
        (
          await request("/payment/save", {
            subscription_invoice_id: String(invoiceId),
            amount: "1",
            currency: "AFN",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/invoice/save", {
            ...invoice,
            invoice_id: String(invoiceId),
            invoice_date: "2026-02-30T00:00",
          })
        ).status,
        400,
      );
      const urls = [
        "/organizations",
        "/organization-list/products_count/DESC/0/20/1",
        "/view/users/" + 777,
        "/list-org-types/id/DESC/0/20/1",
        "/feature/" + featureId,
        "/list-features/id/DESC/0/20/1",
        "/list-subscription-plans/id/DESC/0/20/1",
        "/subscription-plan/" + planId,
        "/list-subscriptions/id/DESC/" + orgId + "/20/1",
        "/subscription/" + subscriptionId + "/" + orgId,
        "/invoices/" + subscriptionId,
        "/invoice/edit/" + invoiceId,
        "/invoice/view/" + invoiceId,
      ];
      const [users] = await pool.query("SELECT id FROM users");
      urls[2] = "/view/users/" + users[0].id;
      for (const url of urls) {
        response = await request(url);
        const html = await response.text();
        assert.equal(response.status, 200, url);
        assert.doesNotMatch(
          html,
          /\/api\/superadmin|PRIVATE_FIXTURE_HASH/,
          url,
        );
      }
      for (const url of [
        "/list-error-logs/id/DESC/" + orgId + "/20/1",
        "/view-error-log/error_logs/1",
        "/list-commands/id/DESC/0/20/1",
        "/command/1",
        "/command-result/1",
        "/list/error_logs/id/DESC/0/20/1",
        "/list/commands/id/DESC/0/20/1",
      ]) {
        assert.equal((await request(url)).status, 404, url);
      }
      assert.equal(
        (
          await request(
            "/command/execute",
            {
              org_id: 0,
              user_id: 0,
              tab_ses_id: "fixture-tab",
              selector: "tab_ses_id",
              script: 'return "fixture";',
            },
            true,
          )
        ).status,
        404,
      );
      assert.equal(
        (await request("/error-logs/clear", { action: "clear_all_logs" }))
          .status,
        404,
      );
      const [before] = await pool.query(
        "SELECT COUNT(*) count FROM subscription_plans",
      );
      assert.equal(
        (
          await request("/subscription-plan", {
            ...plan,
            code: "invalid-plan",
            feature_id: ["999999999"],
          })
        ).status,
        404,
      );
      const [after] = await pool.query(
        "SELECT COUNT(*) count FROM subscription_plans",
      );
      assert.equal(before[0].count, after[0].count);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (pool) await pool.end();
      if (source) {
        if (
          created &&
          /^zeno_smart_test_[a-f0-9]{16}$/.test(name) &&
          name !== process.env.DB_NAME
        )
          await source.query("DROP DATABASE ??", [name]);
        await source.end();
      }
    }
  },
);
