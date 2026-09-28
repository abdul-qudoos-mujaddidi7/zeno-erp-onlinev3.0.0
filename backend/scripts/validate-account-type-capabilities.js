/** Read-only readiness/collision check for the account-role migration. */
require('dotenv').config();
const db = require('../db');

async function main() {
  const [columns] = await db.execute(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='account_types'
        AND column_name IN ('code','can_be_customer','can_be_supplier')
      ORDER BY column_name`,
  );
  const [duplicates] = await db.execute(
    `SELECT org_id, local_id, COUNT(*) total FROM account_types
      GROUP BY org_id, local_id HAVING COUNT(*) > 1`,
  );
  const [reservedNine] = await db.execute(
    'SELECT org_id, local_id, name FROM account_types WHERE local_id = 9',
  );
  console.log(JSON.stringify({
    capability_columns: columns.map((row) => row.column_name),
    duplicate_local_ids: duplicates,
    local_id_9_rows: reservedNine,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.end());
