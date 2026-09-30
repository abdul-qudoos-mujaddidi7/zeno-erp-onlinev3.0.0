/**
 * Backfills the visitor benefit share for sales that were saved before the
 * share was computed from the sale's OWN benefit.
 *
 * Background: the share used to be calculated from `sale_items.profit`, a
 * column only the FIFO/LIFO batch ledger ever writes. In an organization that
 * does not use inventory layers that column stays 0, so a sale with a real
 * benefit posted a share of 0 and its visitor was paid nothing. Those sales
 * are already stored with `visitor_benefit = 0` and no 'sale_visitor' journal;
 * this script re-runs the (idempotent) posting for exactly them, so they do
 * not have to be re-saved one by one.
 *
 * It only touches sales that ARE confirmed, HAVE a visitor and HAVE a positive
 * benefit but NO posted share. Re-running is harmless: the posting drops any
 * previous visitor journal for the sale before writing the current one.
 *
 * Usage:
 *   node scripts/backfill-visitor-benefit.js --dry-run   # rehearse, roll back
 *   node scripts/backfill-visitor-benefit.js             # apply
 */
require('dotenv').config();
const pool = require('../db');
const saleService = require('../services/sale.service');

const dryRun = process.argv.includes('--dry-run');

const REQUEST_CONTEXT = {
  ipAddress: null,
  sessionId: null,
  deviceInfo: 'scripts/backfill-visitor-benefit.js',
};

async function main() {
  const [candidates] = await pool.execute(
    `
      SELECT id, local_id, org_id, invoice_number, benefit, created_by
        FROM sales
       WHERE status = 1
         AND invoice_status = 'confirmed'
         AND visitor_account_id IS NOT NULL
         AND benefit IS NOT NULL
         AND benefit > 0
         AND (visitor_benefit IS NULL OR visitor_benefit = 0)
       ORDER BY id
    `,
  );

  console.log(
    `Found ${candidates.length} confirmed sale(s) with a visitor and no posted share.`,
  );

  let posted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await saleService.syncVisitorBenefit(
        connection,
        {
          orgId: Number(candidate.org_id),
          userId: Number(candidate.created_by) || 0,
          requestContext: REQUEST_CONTEXT,
          saleId: candidate.local_id,
        },
      );

      if (dryRun) {
        await connection.rollback();
      } else {
        await connection.commit();
      }

      posted += 1;
      console.log(
        `  ${dryRun ? 'would post' : 'posted'} ${
          result?.share ?? 0
        } of benefit ${candidate.benefit} for ${
          candidate.invoice_number || `sale ${candidate.id}`
        }`,
      );
    } catch (error) {
      /*
       * One sale that cannot be posted (a closed fiscal year, an account that
       * is no longer a visitor, a missing rate) must not stop the rest.
       */
      await connection.rollback();
      skipped += 1;
      console.log(
        `  skipped ${candidate.invoice_number || `sale ${candidate.id}`}: ${error.message}`,
      );
    } finally {
      connection.release();
    }
  }

  console.log(
    `${
      dryRun
        ? 'DRY RUN -- nothing was written. Would post'
        : 'Posted'
    } ${posted} share(s); ${skipped} skipped.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
