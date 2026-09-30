/**
 * One-time backfill for unit categories.
 *
 * Run once, after 20260930_unit_categories.sql:
 *
 *   node scripts/backfill-unit-categories.js             # apply
 *   node scripts/backfill-unit-categories.js --dry-run   # report, change nothing
 *
 * What it does, per organization that already has units:
 *   1. makes sure a default "General" unit category exists (code GENERAL);
 *   2. points every unit that has no category yet at that category.
 *
 * Safety:
 *   * only `unit_category_id` is ever written — names, codes, subunits,
 *     quantities and every other column are left exactly as they were;
 *   * `WHERE unit_category_id IS NULL` means already-categorised units are
 *     never touched, so a re-run reports 0 units moved;
 *   * the whole thing runs in one transaction, and `--dry-run` rolls it back,
 *     so it can be rehearsed against production before being committed.
 */
require('dotenv').config();

const pool = require('../db');

const unitCategoryRepository = require('../repositories/unit-category.repository');
const { generateLocalId } = require('../utils/generateLocalId');

const dryRun = process.argv.slice(2).includes('--dry-run');

async function main() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [organizations] = await connection.execute(
      'SELECT DISTINCT org_id FROM product_units ORDER BY org_id',
    );

    let categoriesCreated = 0;
    let unitsMoved = 0;

    for (const organization of organizations) {
      const orgId = Number(organization.org_id);

      const existingDefault = await unitCategoryRepository.findDefault(
        connection,
        { orgId },
      );

      const defaultUnitCategory =
        existingDefault ||
        (await unitCategoryRepository.ensureDefault(connection, {
          orgId,
          userId: null,
          localId: generateLocalId(),
        }));

      if (!existingDefault) {
        categoriesCreated += 1;
      }

      const [result] = await connection.execute(
        `
          UPDATE product_units
          SET unit_category_id = ?
          WHERE org_id = ?
            AND unit_category_id IS NULL
        `,
        [defaultUnitCategory.local_id, orgId],
      );

      unitsMoved += Number(result.affectedRows || 0);

      console.log(
        `org ${orgId}: default category ${defaultUnitCategory.local_id} (${existingDefault ? 'existing' : 'created'}), ${Number(result.affectedRows || 0)} unit(s) moved`,
      );
    }

    if (dryRun) {
      await connection.rollback();

      console.log(
        `\nDRY RUN -- rolled back. Would create ${categoriesCreated} category(ies) and move ${unitsMoved} unit(s) across ${organizations.length} organization(s).`,
      );

      return;
    }

    await connection.commit();

    console.log(
      `\nDone. Created ${categoriesCreated} category(ies) and moved ${unitsMoved} unit(s) across ${organizations.length} organization(s).`,
    );
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
