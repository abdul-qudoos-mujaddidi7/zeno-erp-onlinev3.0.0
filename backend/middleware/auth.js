const db = require("../db");

module.exports = async function auth(req, res, next) {
  try {
    let token = req.headers.authorization;

    if (typeof token === "string") {
      token = token.replace(/^Bearer\s+/i, "").trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        code: "UNAUTHORIZED",
      });
    }

    const [rows] = await db.execute(
      `SELECT u.*, t.token
       FROM auth_tokens t
       JOIN users u ON u.local_id = t.user_id
       WHERE t.token = ?
         AND t.expires_at > NOW()
       LIMIT 1`,
      [token],
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        code: "INVALID_TOKEN",
      });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
};
