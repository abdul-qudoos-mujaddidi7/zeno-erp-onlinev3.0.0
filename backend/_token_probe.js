require('dotenv').config();
const db = require('./database/pool');
const crypto = require('crypto');
(async () => {
  const token = 'probe-' + crypto.randomBytes(16).toString('hex');
  const [rows] = await db.query('SELECT id, org_id, local_id FROM users WHERE org_id = 21 LIMIT 1');
  const u = rows[0];
  await db.execute(
    "INSERT INTO auth_tokens (user_id, user_pk, token, expires_at, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())",
    [String(u.local_id), u.id, token],
  );
  console.log(token);
  await db.end();
})();
