/**
 * Idempotently creates the VISITOR account type for existing organizations.
 * Run only after 20261001_sale_visitor.sql.
 *
 * The type itself is configuration, not data, which is why it lives in a
 * separate script instead of the migration: scripts/run-migration.js refuses
 * anything but additive DDL. Nothing here reads or changes an account, a sale
 * or a journal -- it only adds one account_types row per organization that
 * does not have it yet, and existing visitors keep working because the lookup
 * is by `code`.
 *
 * Safe to re-run: organizations that already have a VISITOR row are skipped.
 *
 * Usage:
 *   node scripts/seed-visitor-account-type.js --dry-run   # rehearse, roll back
 *   node scripts/seed-visitor-account-type.js             # apply
 */
require('dotenv').config();
const pool = require('../db');
const { generateLocalId } = require('../utils/generateLocalId');

const VISITOR_ACCOUNT_TYPE_CODE = 'VISITOR';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [organizations] = await connection.execute('SELECT id FROM organizations FOR UPDATE');
    let created = 0;
    for (const organization of organizations) {
      const orgId = Number(organization.id);
      const [existing] = await connection.execute(
        'SELECT local_id FROM account_types WHERE org_id = ? AND code = ? LIMIT 1',
        [orgId, VISITOR_ACCOUNT_TYPE_CODE],
      );
      if (existing.length) continue;

      /* local_id must be unique per organization, same as every seeded type. */
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
         VALUES (?, ?, 'VISITOR', 0, 0, 'Visitor', 'ویزیتور', 'ویزیتور',
          'Receives an agreed percentage of a sale''s benefit', 1, 1, NOW(3), NOW(3))`,
        [orgId, localId],
      );
      created += 1;
    }
    if (dryRun) {
      /*
       * A rehearsal inside a discarded transaction: it proves the connection,
       * the permissions and the table are all fine, and reports the exact
       * number of organizations that would be changed, while changing nothing.
       */
      await connection.rollback();
      console.log(
        `DRY RUN -- rolled back. Would create the VISITOR account type for ${created} organization(s).`,
      );
      return;
    }

    await connection.commit();
    console.log(`Created VISITOR account type for ${created} organization(s).`);
    console.log('Assign it to an account, then set that account\'s percentage.');
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
