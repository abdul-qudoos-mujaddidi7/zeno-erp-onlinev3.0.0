const db = require("../database/pool");

const IMAGE_TABLES = [
  "account_images",
  "product_images",
  "user_images",
  "documents",
];

async function pingDatabase() {
  const [rows] = await db.execute(
    "SELECT 1 AS database_ok, UTC_TIMESTAMP() AS database_time",
  );

  return rows[0];
}

async function getRegistrationInfo() {
  const [org_types] = await db.query("SELECT * FROM `org_types`");
  const [subscription_plans] = await db.query(
    "SELECT * FROM `subscription_plans`",
  );
  const [subscription_plan_features] = await db.query(
    "SELECT * FROM `subscription_plan_features`",
  );
  const [features] = await db.query("SELECT * FROM `features`");

  return {
    org_types,
    subscription_plans,
    subscription_plan_features,
    features,
  };
}

async function getOrganizationInventoryMethod(orgId) {
  const [rows] = await db.execute(
    "SELECT inventory_method FROM organizations WHERE id = ? LIMIT 1",
    [orgId],
  );

  const method = String(rows[0]?.inventory_method || "CLASSIC")
    .trim()
    .toUpperCase();

  return method || "CLASSIC";
}

async function loadImage({
  table,
  fieldName,
  serveId,
  token,
}) {
  if (!IMAGE_TABLES.includes(table)) {
    const error = new Error("Invalid table name");
    error.statusCode = 400;
    error.code = "INVALID_IMAGE_TABLE";
    throw error;
  }

  const [rows] = await db.execute(
    `
      SELECT u.*, t.token
      FROM auth_tokens t
      JOIN users u ON u.local_id = t.user_id
      WHERE t.token = ?
        AND t.expires_at > NOW()
    `,
    [token],
  );

  if (!rows.length) {
    const error = new Error("Not authorized or expired session.");
    error.statusCode = 401;
    error.code = "UNAUTHORIZED";
    throw error;
  }

  const [images] = await db.execute(
    `SELECT * FROM \`${table}\` WHERE id = ?`,
    [serveId],
  );

  if (!images.length) {
    const error = new Error("Image not found.");
    error.statusCode = 404;
    error.code = "IMAGE_NOT_FOUND";
    throw error;
  }

  if (Number(images[0].org_id) !== Number(rows[0].org_id)) {
    const error = new Error("Not authorized to view this image.");
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  const base64Data = images[0][fieldName];

  if (!base64Data) {
    const error = new Error("Image not found.");
    error.statusCode = 404;
    error.code = "IMAGE_NOT_FOUND";
    throw error;
  }

  const matches = String(base64Data).match(/^data:(.+);base64,(.+)$/);

  if (!matches) {
    const error = new Error("Invalid base64 format.");
    error.statusCode = 400;
    error.code = "INVALID_IMAGE_DATA";
    throw error;
  }

  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], "base64"),
  };
}

module.exports = {
  pingDatabase,
  getRegistrationInfo,
  getOrganizationInventoryMethod,
  loadImage,
};
