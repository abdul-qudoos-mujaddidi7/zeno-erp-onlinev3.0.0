/**
 * Idempotently creates the BOTH account type for existing organizations.
 * Run only after 20260927_account_type_capabilities.sql.
 * This changes configuration rows only; it never touches accounts or history.
 */
require('dotenv').config();
const pool = require('../db');
const { generateLocalId } = require('../utils/generateLocalId');

async function main() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [organizations] = await connection.execute('SELECT id FROM organizations FOR UPDATE');
    let created = 0;
    for (const organization of organizations) {
      const orgId = Number(organization.id);
      const [existing] = await connection.execute(
        "SELECT local_id FROM account_types WHERE org_id = ? AND code = 'BOTH' LIMIT 1",
        [orgId],
      );
      if (existing.length) continue;

      let localId;
      for (;;) {
        localId = generateLocalId();
        const [collision] = await connection.execute(
          'SELECT 1 FROM account_types WHERE org_id = ? AND local_id = ? LIMIT 1',
          [orgId, localId],
        );
        if (!collision.length) break;
      }
      await connection.execute(
        `INSERT INTO account_types
          (org_id, local_id, code, can_be_customer, can_be_supplier, name, name_fa, name_ps, description, status, version, created_at, updated_at)
         VALUES (?, ?, 'BOTH', 1, 1, 'Both', 'مشتری و تأمین کننده', 'پېرودونکی او عرضه کوونکی',
          'Can be used as both customer and supplier', 1, 1, NOW(3), NOW(3))`,
        [orgId, localId],
      );
      created += 1;
    }
    await connection.commit();
    console.log(`Created BOTH account type for ${created} organization(s).`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
