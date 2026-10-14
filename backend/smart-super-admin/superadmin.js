const express = require("express");
const handleSuperadminLogin = require("../routes/components/superadmin-login");

module.exports = function createSmartSuperAdminAuth(pool) {
  const router = express.Router();
  const loginErrors = {
    invalid: "Invalid username or password. Please try again.",
    admin: "This account cannot access Smart Super Admin.",
    unavailable: "Login is temporarily unavailable. Please try again.",
  };

  router.get("/login", (req, res) => {
    if (
      req.session?.user?.username === "superadmin" &&
      Number(req.session.user.id) === 0 &&
      Number(req.session.user.org_id) === 0
    )
      return res.redirect(303, "/smart-super-admin");
    res.render("login", {
      layout: false,
      title: "Smart Super Admin Login",
      loginError: loginErrors[req.query.error] || "",
    });
  });

  router.post("/login", (req, res) =>
    handleSuperadminLogin(req, res, pool, true),
  );

  router.post("/logout", (req, res) => {
    if (!req.session)
      return res.status(503).render("error", {
        title: "Unavailable",
        message: "Could not end the session.",
      });
    req.session.destroy((error) => {
      if (error) {
        console.error("Smart Super Admin logout failed:", error.message);
        return res.status(503).render("error", {
          title: "Unavailable",
          message: "Could not end the session. Please try again.",
        });
      }
      res.redirect(303, "/smart-super-admin/login");
    });
  });

  return router;
};
