const express = require("express");
const router = express.Router();
const db = require("../../db");
const handleSuperadminLogin = require("./superadmin-login");
const DashLayout = require("./DashLayout");
const ListItems = require("./ListItems");
const ViewItem = require("./ViewItem");
const ViewErrorLog = require("./ViewErrorLog");
const Login = require("./Login");
const Organizations = require("./Organizations");
const OrganizationList = require("./OrganizationList");
const {
  requireSameOriginForChanges,
  requireSuperAdminSession,
} = require("../../smart-super-admin/middleware/access-control");
const {
  getOrganizationSubscription,
  markExpired,
  revokeOrganizationTokens,
} = require("../../services/subscription-access");

router.use(requireSameOriginForChanges);

const ListErrorLogs = require("./ListErrorLogs");
const ListCommands = require("./ListCommands");
const ListOrgTypes = require("./ListOrgTypes");
const Command = require("./Command");
const OrgType = require("./OrgType");
const SubscriptionPlan = require("./SubscriptionPlan");
const Subscription = require("./Subscription");
const ListSubscriptionPlans = require("./ListSubscriptionPlans");
const ListSubscriptions = require("./ListSubscriptions");
const ListFeatures = require("./ListFeatures");
const Feature = require("./Feature");

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/api/superadmin");
  }
  next();
}

/*
 * Several of these pages are async functions that were called without being
 * awaited: a rejected promise (a bad sort column reaching SQL, for instance)
 * then escaped Express and terminated the whole server. Handing the rejection
 * to the error handler keeps one broken page from taking the ERP offline.
 */
const safe = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, db);
  } catch (error) {
    next(error);
  }
};

router.get("/", async (req, res) => {
  Login(req, res, db);
});

// Handle login
router.post("/", express.urlencoded({ extended: true }), (req, res) =>
  handleSuperadminLogin(req, res, db),
);

// Update user preferences (language/theme)
router.get("/dashboard", requireAuth, (req, res) => {
  let query = `SELECT * FROM \`organizations\` ORDER BY created_at DESC`;
  let orgs = [];
  db.query(query)
    .then(([rows]) => {
      orgs = rows;
      console.log("ORGS:", orgs);

      res.send(
        DashLayout(
          "Dashboard",
          req,
          /*html*/ `
            <div class="container-fluid">
              <h1>Welcome, Superadmin!</h1>
              <p>This is your dashboard where you can manage organizations, projects, and more.</p>


              <p>Selected Organization: </p>
              <h3>${orgs.find((org) => org.id === req.session.user.org_id)?.name || "N/A"}</h3>
            </div>
      `,
        ),
      );
    })
    .catch((err) => {
      console.error("Failed to fetch organizations", err);
      res.status(500).send("Error fetching organizations");
    });
});

router.get("/organizations", requireAuth, (req, res) => {
  if (req.session.user.username !== "superadmin") {
    return res.status(403).send("Only superadmin can see orgs");
  }
  Organizations(req, res, db);
});

router.get(
  "/select_org/:org_id",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (req.session.user.username !== "superadmin") {
      return res.status(403).send("Only superadmin can switch orgs");
    }
    const org_id = req.params.org_id;
    if (isNaN(org_id)) {
      return res.status(400).send("Organization ID is required");
    }
    if (org_id == 0) {
      req.session.user.org_id = 0;
      req.session.user.org_name = "All Organizations";
      return res.redirect("/api/superadmin/dashboard");
    }

    const [orgs] = await db.query(
      `SELECT * FROM \`organizations\` ORDER BY created_at DESC`,
    ); // <-- await here
    console.log("ORGS:", orgs);

    req.session.user.org_id = Number(org_id);
    req.session.user.org_name =
      orgs.find((org) => org.id === Number(org_id))?.name || "N/A";
    res.redirect("/api/superadmin/dashboard");
  },
);

router.post(
  "/list/sync_logs/",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const { action } = req.body;
    const page = parseInt(req.params.page) || 1;

    if (action === "clear_logs") {
      try {
        let query = `TRUNCATE TABLE \`sync_logs\``;

        await db.query(query); // <-- looks sync, but non-blocking

        res.redirect(
          `/api/superadmin/list/sync_logs/created_at/DESC/${req.session.user.org_id}/20/1/`,
        );
      } catch (err) {
        console.error("Failed to clear sync logs", err);
        res.status(500).send("Error clearing sync logs");
      }
    }
  },
);

router.post(
  "/list/error_logs/",
  requireAuth,
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const { action } = req.body;
    const page = parseInt(req.params.page) || 1;

    if (action === "clear_all_logs") {
      try {
        let query = `TRUNCATE TABLE \`error_logs\``;

        await db.query(query); // <-- looks sync, but non-blocking

        res.redirect(
          `/api/superadmin/list-error-logs/error_logs/created_at/DESC/${req.session.user.org_id}/20/1/`,
        );
      } catch (err) {
        console.error("Failed to clear error logs", err);
        res.status(500).send("Error clearing error logs");
      }
    } else if (action === "clear_only_logs") {
      try {
        let query = `DELETE FROM \`error_logs\` WHERE log_type = 'log'`;

        await db.query(query); // <-- looks sync, but non-blocking

        res.redirect(
          `/api/superadmin/list-error-logs/error_logs/created_at/DESC/${req.session.user.org_id}/20/1/`,
        );
      } catch (err) {
        console.error("Failed to clear error logs", err);
        res.status(500).send("Error clearing error logs");
      }
    }
  },
);

router.get(
  "/list/:tableName/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListItems),
);

router.get(
  "/list-error-logs/:logtype/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListErrorLogs),
);

const formatMySQLDate = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

router.get(
  "/list-commands/:command_status/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListCommands),
);

router.get(
  "/command/:command_id/:org_id/:user_id/:tab_ses_id/:selector/",
  requireAuth,
  safe(Command),
);

router.get(
  "/list-subscription-plans/:plan_type/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListSubscriptionPlans),
);


router.get(
  "/list-subscriptions/:subscription_status/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListSubscriptions),
);

router.get(
  "/subscription-plan/:subscription_plan_id/",
  requireAuth,
  safe(SubscriptionPlan),
);

router.get(
  "/subscription-plan-features/:subscription_plan_id/",
  requireAuth,
  (req, res) => {
    db.execute(
      `SELECT spf.*, f.name AS feature_name, f.feature_key, f.type AS feature_type FROM subscription_plan_features spf JOIN features f ON spf.feature_id = f.id WHERE spf.plan_id=?`,
      [req.params.subscription_plan_id],
    )
      .then(([rows]) => {
        res.json(rows);
      })
      .catch((err) => {
        console.error("Failed to fetch subscription plan features", err);
        res.status(500).json({ error: "Failed to fetch subscription plan features" });
      });
  },
);


router.get(
  "/subscription/:subscription_id/:org_id",
  requireAuth,
  safe(Subscription),
);


router.post(
  "/subscription-plan/",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (req.session.user.username !== "superadmin") {
      return res
        .status(403)
        .send("Forbidden: Only superadmin can save subscription-plans");
    }
    try {
      const myData = req.body;





      const org_type_id = myData.org_type_id ? Number(myData.org_type_id) : null;
      const billing_cycle_count = myData.billing_cycle_count ? Number(myData.billing_cycle_count) : null;
      const trial_days = myData.trial_days ? Number(myData.trial_days) : null;
      const grace_period_days = myData.grace_period_days ? Number(myData.grace_period_days) : null;
      const price = myData.price ? Number(myData.price) : null;
      const recurring_price = myData.recurring_price ? Number(myData.recurring_price) : null;
      if (myData.subscription_plan_id != 0) {
        await db.execute(
          `UPDATE subscription_plans SET org_type_id=?, code=?, color=?, plan_type=?, is_active=?, name=?, name_fa=?,name_ps=?,description=?,description_fa=?,description_ps=?,price=?,recurring_price=?,currency=?,billing_cycle_unit=?,billing_cycle_count=?,trial_days=?,grace_period_days=? WHERE id=?`,
          [
            org_type_id,
            myData.code,
            myData.color,
            myData.plan_type,
            myData.is_active,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
            price,
            recurring_price,
            myData.currency,
            myData.billing_cycle_unit,
            billing_cycle_count,
            trial_days,
            grace_period_days,
            myData.subscription_plan_id,
          ],
        );
      } else {
        const [subscriptionPlanResult] = await db.execute(
          "INSERT INTO subscription_plans (org_type_id, code, color, plan_type, is_active, name, name_fa, name_ps, description, description_fa, description_ps, price, recurring_price, currency, billing_cycle_unit, billing_cycle_count, trial_days, grace_period_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            org_type_id,
            myData.code,
            myData.color,
            myData.plan_type,
            myData.is_active,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
            price,
            recurring_price,
            myData.currency,
            myData.billing_cycle_unit,
            billing_cycle_count,
            trial_days,
            grace_period_days,
          ],
        );

        myData.subscription_plan_id = subscriptionPlanResult.insertId;


      }



      const feature_ids = Array.isArray(req.body.feature_id)
        ? req.body.feature_id
        : req.body.feature_id
          ? [req.body.feature_id]
          : [];

      const feature_values = Array.isArray(req.body.feature_value)
        ? req.body.feature_value
        : req.body.feature_value
          ? [req.body.feature_value]
          : [];
      const feature_units = Array.isArray(req.body.feature_unit)
        ? req.body.feature_unit
        : req.body.feature_unit
          ? [req.body.feature_unit]
          : [];

      await db.execute(
        `DELETE FROM subscription_plan_features WHERE plan_id=?`,
        [myData.subscription_plan_id]
      );

      for (let i = 0; i < feature_ids.length; i++) {
        if (!feature_ids[i]) continue;

        await db.execute(
          `INSERT INTO subscription_plan_features (plan_id, feature_id, value,unit)
          VALUES (?, ?, ?, ?)`,
          [myData.subscription_plan_id, feature_ids[i], feature_values[i] || null, feature_units[i] || null]
        );
      }
        // redirect to list
      res.redirect(
        `/api/superadmin/list-subscription-plans/all/id/ASC/0/20/1/`,
      );


    } catch (err) {
      console.error("Error saving:", err);
      res.status(500).send("Failed to save");
    }
  },
);


function formatMySQLDateKabulToUTC(dateString) {
  if (!dateString) return null;

  // interpret input as Asia/Kabul time
  const dateInKabul = new Date(dateString + ":00"); 
  // add seconds so JS parses it safely

  // convert to UTC ISO
  const utc = new Date(dateInKabul.toISOString());

  // MySQL DATETIME(3) format
  return utc
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 23);
}

router.post(
  "/subscription/",
  express.urlencoded({ extended: true }),
  requireAuth,
  requireSuperAdminSession,
  async (req, res) => {
    try {
      const myData = req.body;

      const org_id = myData.org_id ? Number(myData.org_id) : null;
      const plan_id = myData.plan_id ? Number(myData.plan_id) : null;
      const start_date = myData.start_date ? formatMySQLDateKabulToUTC(myData.start_date) : null;
      const end_date = myData.end_date ? formatMySQLDateKabulToUTC(myData.end_date) : null;
      const next_billing_date = myData.next_billing_date ? formatMySQLDateKabulToUTC(myData.next_billing_date) : null;
      const trial_end_date = myData.trial_end_date ? formatMySQLDateKabulToUTC(myData.trial_end_date) : null;
      const cancelled_at = myData.cancelled_at ? formatMySQLDateKabulToUTC(myData.cancelled_at) : null;
      const price_override = myData.price_override ? Number(myData.price_override) : null;
      const previousRecord =
        myData.subscription_id != 0
          ? (await db.execute(
              "SELECT org_id FROM subscriptions WHERE id = ?",
              [myData.subscription_id],
            ))[0][0]
          : null;
      const affectedOrganizations = [
        ...new Set(
          [previousRecord?.org_id, org_id]
            .filter(Boolean)
            .map(Number),
        ),
      ];
      const previousAccess = new Map();
      for (const affectedOrgId of affectedOrganizations) {
        const subscription = await getOrganizationSubscription(db, affectedOrgId);
        previousAccess.set(affectedOrgId, subscription?.access_status);
      }

      if (myData.subscription_id != 0) {
        await db.execute(
          `UPDATE subscriptions SET org_id=?, plan_id=?, start_date=?, end_date=?, next_billing_date=?, subscription_status=?, auto_renew=?, trial_end_date=?, cancelled_at=?, price_override=?,description=?,currency=? WHERE id=?`,
          [
            org_id,
            plan_id,
            start_date,
            end_date,
            next_billing_date,
            myData.subscription_status,
            myData.auto_renew,
            trial_end_date,
            cancelled_at,
            price_override,
            myData.description,
            myData.currency,
            myData.subscription_id,
          ],
        );
      } else {
        const [subscriptionResult] = await db.execute(
          "INSERT INTO subscriptions (org_id, plan_id, start_date, end_date, next_billing_date, subscription_status, auto_renew, trial_end_date, cancelled_at, price_override, description, currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            org_id,
            plan_id,
            start_date,
            end_date,
            next_billing_date,
            myData.subscription_status,
            myData.auto_renew,
            trial_end_date,
            cancelled_at,
            price_override,
            myData.description,
            myData.currency
          ],
        );
        myData.subscription_id = subscriptionResult.insertId;
      }



      const feature_ids = Array.isArray(req.body.feature_id)
        ? req.body.feature_id
        : req.body.feature_id
          ? [req.body.feature_id]
          : [];
      const feature_values = Array.isArray(req.body.feature_value)
        ? req.body.feature_value
        : req.body.feature_value
          ? [req.body.feature_value]
          : [];
      const feature_units = Array.isArray(req.body.feature_unit)
        ? req.body.feature_unit
        : req.body.feature_unit
          ? [req.body.feature_unit]
          : [];

      await db.execute(
        `DELETE FROM subscription_features WHERE subscription_id=?`,
        [myData.subscription_id]
      );

      for (let i = 0; i < feature_ids.length; i++) {
        if (!feature_ids[i]) continue;

        await db.execute(
          `INSERT INTO subscription_features (subscription_id, feature_id, value, unit)
          VALUES (?, ?, ?, ?)`,
          [myData.subscription_id, feature_ids[i], feature_values[i] || null, feature_units[i] || null]
        );
      }

      for (const affectedOrgId of affectedOrganizations) {
        const current = await getOrganizationSubscription(db, affectedOrgId);
        const currentlyAllowed = ["active", "trial"].includes(
          current?.access_status,
        );
        const previouslyAllowed = ["active", "trial"].includes(
          previousAccess.get(affectedOrgId),
        );
        await markExpired(db, current);
        if (!currentlyAllowed || !previouslyAllowed) {
          await revokeOrganizationTokens(db, affectedOrgId);
        }
      }

        // redirect to list
      res.redirect(
        `/api/superadmin/list-subscriptions/all/id/DESC/0/20/1/`,
      );


    } catch (err) {
      console.error("Error saving:", err);
      res.status(500).send("Failed to save");
    }
  },
);


const Invoice = require('./Invoice');

// Invoice routes
router.get('/invoices/:subscription_id', async (req, res) => {
  await Invoice.listInvoices(req, res, db);
});

router.get('/invoice/new/:subscription_id', async (req, res) => {
  await Invoice.invoiceForm(req, res, db);
});

router.get('/invoice/edit/:invoice_id', async (req, res) => {
  await Invoice.invoiceForm(req, res, db);
});

router.get('/invoice/view/:invoice_id', async (req, res) => {
  await Invoice.viewInvoice(req, res, db);
});

router.post('/invoice/save', express.urlencoded({ extended: true }), async (req, res) => {
  await Invoice.saveInvoice(req, res, db);
});

router.post("/payment/save",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    await Invoice.savePayment(req, res, db);
  }
);


router.get(
  "/list-org-types/:type_status/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListOrgTypes),
);

router.get("/org-type/:org_type_id/", requireAuth, safe(OrgType));

router.post(
  "/org-type/",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (req.session.user.username !== "superadmin") {
      return res
        .status(403)
        .send("Forbidden: Only superadmin can save orgtypes");
    }
    try {
      const myData = req.body;

      if (myData.org_type_id != 0) {
        await db.execute(
          `UPDATE org_types SET type_status=?,icon=?,code=?, name=?, name_fa=?,name_ps=?,summary=?,summary_fa=?,summary_ps=?,description=?,description_fa=?,description_ps=? WHERE id=?`,
          [
            myData.type_status,
            myData.icon,
            myData.code,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.summary,
            myData.summary_fa,
            myData.summary_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
            myData.org_type_id,
          ],
        );
        res.redirect(`/api/superadmin/list-org-types/all/id/DESC/0/20/1/`);
      } else {
        const [orgResult] = await db.execute(
          "INSERT INTO org_types (type_status,icon,code, name, name_fa,name_ps,summary,summary_fa,summary_ps,description,description_fa,description_ps) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            myData.type_status,
            myData.icon,
            myData.code,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.summary,
            myData.summary_fa,
            myData.summary_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
          ],
        );

        const org_type_id = orgResult.insertId;

        // redirect to list
        res.redirect(`/api/superadmin/list-org-types/all/id/DESC/0/20/1/`);
      }
    } catch (err) {
      console.error("Error saving:", err);
      res.status(500).send("Failed to save");
    }
  },
);

router.get(
  "/list-features/:type_status/:sortcolumn/:sortdir/:org/:limit/:page/",
  requireAuth,
  safe(ListFeatures),
);

router.get("/feature/:feature_id/", requireAuth, safe(Feature));

router.post(
  "/feature/",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    if (req.session.user.username !== "superadmin") {
      return res
        .status(403)
        .send("Forbidden: Only superadmin can save features");
    }
    try {
      const myData = req.body;

      if (myData.feature_id != 0) {
        await db.execute(
          `UPDATE features SET feature_key=?, type=?,icon=?, name=?, name_fa=?,name_ps=?,description=?,description_fa=?,description_ps=? WHERE id=?`,
          [
            myData.feature_key,
            myData.type,
            myData.icon,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
            myData.feature_id,
          ],
        );
        res.redirect(`/api/superadmin/list-features/all/id/DESC/0/20/1/`);
      } else {
        const [featureResult] = await db.execute(
          "INSERT INTO features (feature_key, type, icon, name, name_fa, name_ps, description, description_fa, description_ps) VALUES (?,?,?,?,?,?,?,?,?)",
          [
            myData.feature_key,
            myData.type,
            myData.icon,
            myData.name,
            myData.name_fa,
            myData.name_ps,
            myData.description,
            myData.description_fa,
            myData.description_ps,
          ],
        );

        const feature_id = featureResult.insertId;

        // redirect to list
        res.redirect(`/api/superadmin/list-features/all/id/DESC/0/20/1/`);
      }
    } catch (err) {
      console.error("Error saving:", err);
      res.status(500).send("Failed to save");
    }
  },
);

router.get(
  "/organization-list/:sortcolumn/:sortdir/:type/:limit/:page",
  requireAuth,
  safe(OrganizationList),
);

router.get("/view/:tableName/:id", requireAuth, safe(ViewItem));

router.get("/view-error-log/:tableName/:id", requireAuth, safe(ViewErrorLog));

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/api/superadmin"); // Redirect to login after logout
  });
});

module.exports = router;
