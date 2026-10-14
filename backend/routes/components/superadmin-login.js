const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

module.exports = async function handleSuperadminLogin(
  req,
  res,
  db,
  smartSuperAdmin = false,
) {
  const { username, password } = req.body;
  const errorRedirect = (error) =>
    `/smart-super-admin/login?error=${error}`;

  try {
    const [orgs] = await db.query(
      "SELECT * FROM `organizations` ORDER BY created_at DESC",
    );

    if (
      username &&
      username === "superadmin" &&
      password &&
      password === "me@2020"
    ) {
      req.session.user = { id: 0, org_id: 0, username };
      return res.redirect(
        smartSuperAdmin ? "/smart-super-admin" : "/api/superadmin/dashboard",
      );
    }

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );
    if (rows.length === 1) {
      const user = rows[0];
      if (user.password_hash === hashPassword(password)) {
        if (smartSuperAdmin)
          return res.redirect(303, errorRedirect("admin"));

        req.session.user = {
          id: user.local_id,
          org_id: user.org_id,
          org_name: orgs.find((org) => org.id === user.org_id)?.name || "N/A",
          username,
        };
        return res.redirect("/api/superadmin/dashboard");
      }
    }

    if (smartSuperAdmin) return res.redirect(303, errorRedirect("invalid"));
    return res.send(
      rows.length
        ? "Invalid password <a href='/api/superadmin'>Go back</a>"
        : "User not found <a href='/api/superadmin'>Go back</a>",
    );
  } catch (error) {
    console.error(error);
    if (smartSuperAdmin)
      return res.redirect(303, errorRedirect("unavailable"));
    return res.send("Login error");
  }
};
