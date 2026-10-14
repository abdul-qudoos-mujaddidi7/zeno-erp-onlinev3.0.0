const express = require("express");
module.exports = (db, pool) => {
  const router = express.Router(),
    controllers = {};
  router.use(require("./superadmin")(pool));
  for (const name of [
    "dashboard",
    "organizations",
    "items",
    "org-types",
    "features",
    "subscription-plans",
    "subscriptions",
    "invoices",
  ])
    controllers[name] = require("./controllers/" + name + ".controller")(
      require("./services/" + name + ".service")(db),
    );
  const d = controllers.dashboard,
    o = controllers.organizations,
    i = controllers.items,
    t = controllers["org-types"],
    f = controllers.features,
    p = controllers["subscription-plans"],
    s = controllers.subscriptions,
    v = controllers.invoices;
  router.get("/", d.index);
  router.get("/organizations", o.grid);
  router.get("/organization-options", d.options);
  router.get(
    "/organization-list/:sortcolumn/:sortdir/:org/:limit/:page",
    o.list,
  );
  router.get("/select-org/:orgId", d.selectOrg);
  router.get("/list/:tableName/:sortcolumn/:sortdir/:org/:limit/:page", i.list);
  router.get("/view/:tableName/:id", i.detail);
  router.get("/download/:tableName/:id", i.download);
  router.get("/edit/:tableName/:id", i.editForm);
  router.post("/edit/:tableName/:id", i.saveEdit);
  router.get("/list-org-types/:sortcolumn/:sortdir/:org/:limit/:page", t.list);
  router.get(["/org-type", "/org-type/:id"], t.form);
  router.post("/org-type", t.save);
  router.get("/list-features/:sortcolumn/:sortdir/:org/:limit/:page", f.list);
  router.get(["/feature", "/feature/:id"], f.form);
  router.post("/feature", f.save);
  router.get(
    "/list-subscription-plans/:sortcolumn/:sortdir/:org/:limit/:page",
    p.list,
  );
  router.get(["/subscription-plan", "/subscription-plan/:id"], p.form);
  router.post("/subscription-plan", p.save);
  router.get("/subscription-plan-features/:planId", p.features);
  router.get(
    "/list-subscriptions/:sortcolumn/:sortdir/:org/:limit/:page",
    s.list,
  );
  router.get("/subscription/:id/:orgId", s.form);
  router.post("/subscription", s.save);
  router.get("/invoices/:subscriptionId", v.list);
  router.get("/invoice/new/:subscriptionId", v.form);
  router.get("/invoice/edit/:invoiceId", v.editForm);
  router.get("/invoice/view/:invoiceId", v.view);
  router.post("/invoice/save", v.save);
  router.post("/payment/save", v.savePayment);
  router.post("/language", (req, res) => {
    if (!req.session) db.fail("Host session middleware is required", 503);
    if (!["en", "fa", "ps"].includes(req.body.language))
      db.fail("Unsupported language");
    req.session.smartSuperAdminLanguage = req.body.language;
    req.session.save((error) => {
      if (error)
        return res.status(503).render("error", {
          title: "Unavailable",
          message: "Could not save language.",
        });
      res.redirect(303, "/smart-super-admin");
    });
  });
  return router;
};
