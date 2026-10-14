const express = require("express");
const path = require("node:path");
const { engine } = require("express-handlebars");
module.exports = function createSmartSuperAdmin({
  pool,
  skipAccessControl = false,
} = {}) {
  const app = express(),
    databasePool = pool || require("../db"),
    db = require("./services/database")(databasePool);
  app.disable("x-powered-by");
  const helpers = { ...require("./helpers/handlebars-helpers") };
  delete helpers.buildPagination;
  helpers.t = (value, options) => options.data.root.labels?.[value] || value;
  app.engine(
    "hbs",
    engine({
      extname: ".hbs",
      defaultLayout: "main",
      layoutsDir: path.join(__dirname, "../views/smart-super-admin/layouts"),
      partialsDir: path.join(__dirname, "../views/smart-super-admin/partials"),
      helpers,
    }),
  );
  app.set("view engine", "hbs");
  app.set("views", path.join(__dirname, "../views/smart-super-admin"));
  app.use(
    "/assets",
    express.static(path.join(__dirname, "../public/smart-super-admin"), {
      index: false,
      dotfiles: "deny",
    }),
  );
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  if (!skipAccessControl) {
    const {
      requireSameOriginForChanges,
      requireSuperAdminSession,
    } = require("./middleware/access-control");
    app.use((req, res, next) => {
      if (req.path === "/login") return next();
      return requireSuperAdminSession(req, res, next);
    });
    app.use(requireSameOriginForChanges);
  }
  app.use(
    express.urlencoded({ extended: true, limit: "2mb", parameterLimit: 1000 }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(require("./middleware/context")(db));
  app.use(require("./routes")(db, databasePool));
  app.use((req, res) =>
    res.status(404).render("error", {
      title: "Not found",
      message: "This page does not exist.",
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.code === "ER_DUP_ENTRY"
        ? 409
        : [400, 402, 403, 404, 409, 413, 503].includes(error.status)
          ? error.status
          : 503;
    const message =
      status === 409
        ? "A record with this key already exists."
        : status < 500
          ? error.message
          : "The database operation could not be completed. Please try again.";
    if (status >= 500)
      console.error(
        "Smart Super Admin operation failed:",
        error.code || "UNAVAILABLE",
      );
    if (
      req.path.startsWith("/subscription-plan-features/") ||
      req.path === "/organization-options" ||
      req.path === "/quick-search"
    )
      return res.status(status).json({ success: false, message });
    res.status(status).render("error", { title: "Request failed", message });
  });
  return app;
};
