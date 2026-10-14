const express = require("express");
const crypto = require("node:crypto");

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password, "utf8")
    .digest("hex");
}

module.exports = function createSmartSuperAdminAuth(pool) {
  const router = express.Router();

  const loginErrors = {
    invalid: "Invalid username or password. Please try again.",
    admin: "This account cannot access Smart Super Admin.",
    unavailable: "Login is temporarily unavailable. Please try again.",
  };

  const superAdminPasswordHash =
    process.env.SUPERADMIN_PASSWORD_HASH;

  router.get("/login", (req, res) => {
    if (
      req.session?.user?.username === "superadmin" &&
      Number(req.session.user.id) === 0 &&
      Number(req.session.user.org_id) === 0
    ) {
      return res.redirect(303, "/smart-super-admin");
    }

    res.render("login", {
      layout: false,
      title: "Smart Super Admin Login",
      loginError: loginErrors[req.query.error] || "",
    });
  });

  router.post("/login", async (req, res) => {
    const { username, password } = req.body || {};

    try {
      // Authenticate the dedicated Smart Super Admin account.
      if (
        username === "superadmin" &&
        typeof password === "string" &&
        password.length > 0 &&
        typeof superAdminPasswordHash === "string" &&
        /^[a-f0-9]{64}$/i.test(superAdminPasswordHash)
      ) {
        const submittedHash = hashPassword(password);

        const submittedBuffer = Buffer.from(submittedHash, "hex");
        const storedBuffer = Buffer.from(
          superAdminPasswordHash,
          "hex",
        );

        if (crypto.timingSafeEqual(submittedBuffer, storedBuffer)) {
          return req.session.regenerate((error) => {
            if (error) {
              console.error(
                "Smart Super Admin session creation failed:",
                error.message,
              );

              return res.redirect(
                303,
                "/smart-super-admin/login?error=unavailable",
              );
            }

            req.session.user = {
              id: 0,
              org_id: 0,
              username: "superadmin",
            };

            req.session.save((saveError) => {
              if (saveError) {
                console.error(
                  "Smart Super Admin session save failed:",
                  saveError.message,
                );

                return res.redirect(
                  303,
                  "/smart-super-admin/login?error=unavailable",
                );
              }

              return res.redirect(303, "/smart-super-admin");
            });
          });
        }
      }

      // Check ordinary ERP users, but do not allow them to access
      // the dedicated Smart Super Admin panel.
      if (typeof username === "string" && username.length > 0) {
        const [rows] = await pool.execute(
          "SELECT password_hash FROM users WHERE username = ?",
          [username],
        );

        if (
          typeof password === "string" &&
          rows.length === 1 &&
          typeof rows[0].password_hash === "string" &&
          rows[0].password_hash === hashPassword(password)
        ) {
          return res.redirect(
            303,
            "/smart-super-admin/login?error=admin",
          );
        }
      }

      return res.redirect(
        303,
        "/smart-super-admin/login?error=invalid",
      );
    } catch (error) {
      console.error(
        "Smart Super Admin login failed:",
        error.message,
      );

      return res.redirect(
        303,
        "/smart-super-admin/login?error=unavailable",
      );
    }
  });

  router.post("/logout", (req, res) => {
    if (!req.session) {
      return res.status(503).render("error", {
        title: "Unavailable",
        message: "Could not end the session.",
      });
    }

    req.session.destroy((error) => {
      if (error) {
        console.error(
          "Smart Super Admin logout failed:",
          error.message,
        );

        return res.status(503).render("error", {
          title: "Unavailable",
          message: "Could not end the session. Please try again.",
        });
      }

      res.clearCookie("connect.sid");
      return res.redirect(303, "/smart-super-admin/login");
    });
  });

  return router;
};