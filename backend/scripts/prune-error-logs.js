#!/usr/bin/env node
/**
 * Retention for the client diagnostics table (`error_logs`).
 *
 * The beacon writes a row per console line, from every open tab, for every
 * user: on the beta database that table reached ~930 MB for ~56k rows. Without
 * a retention policy it only grows, and every byte of it competes with the
 * financial data for the server's buffer pool.
 *
 * Nothing here is destructive by default. The script REPORTS unless you ask it
 * to delete, and it refuses to guess a window:
 *
 *   node scripts/prune-error-logs.js                        # report only
 *   node scripts/prune-error-logs.js --days=30 --dry-run    # same, explicit
 *   node scripts/prune-error-logs.js --days=30 --apply      # delete
 *
 * Safety rules:
 *   * `--days` is required to delete, and must be at least 1, so there is no
 *     way to empty the table by omission;
 *   * deletes are bounded batches (oldest rows first, by primary key), so the
 *     statement never locks the table for the length of the whole prune and can
 *     be stopped at any point without leaving the table in a broken state;
 *   * `--max-batches` caps one run, and a run that finds nothing left to delete
 *     stops;
 *   * only `error_logs` is ever written, and only rows older than the window.
 *
 * Suggested schedule (see backend/README.txt): once a day, keeping 30 days.
 */
require('dotenv').config();

const pool = require('../db');

const DEFAULT_BATCH = 2000;
const DEFAULT_MAX_BATCHES = 50;

function parseArgs(argv) {
  const options = {
    days: null,
    apply: false,
    batch: DEFAULT_BATCH,
    maxBatches: DEFAULT_MAX_BATCHES,
  };

  for (const arg of argv) {
    const [name, value] = arg.split('=');

    if (name === '--apply') options.apply = true;
    else if (name === '--dry-run') options.apply = false;
    else if (name === '--days') options.days = Number(value);
    else if (name === '--batch') options.batch = Number(value);
    else if (name === '--max-batches') options.maxBatches = Number(value);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function validate(options) {
  if (options.apply) {
    if (!Number.isFinite(options.days) || options.days < 1) {
      throw new Error(
        'Refusing to delete without --days=<n> (n >= 1). The window has to be a deliberate choice.',
      );
    }
  }

  if (!Number.isFinite(options.batch) || options.batch < 1) {
    throw new Error('--batch must be a positive number.');
  }

  if (!Number.isFinite(options.maxBatches) || options.maxBatches < 1) {
    throw new Error('--max-batches must be a positive number.');
  }
}

async function tableSize() {
  const [[row]] = await pool.query(
    `SELECT TABLE_ROWS AS approx_rows,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1048576, 1) AS mb
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'error_logs'`,
  );

  return {
    approxRows: Number(row?.approx_rows || 0),
    mb: Number(row?.mb || 0),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  validate(options);

  const before = await tableSize();

  console.log('error_logs retention');
  console.log(
    `  table ............ ~${before.approxRows} rows, ${before.mb} MB`,
  );

  if (options.days == null) {
    console.log(
      '  mode ............. report only (pass --days=<n> --apply to delete)',
    );
  } else {
    console.log(
      `  keeps ............ the last ${options.days} day(s) of logs`,
    );
    console.log(
      `  mode ............. ${options.apply ? 'APPLY (deleting)' : 'dry run (nothing deleted)'}`,
    );
  }

  const cutoffSql = 'DATE_SUB(NOW(), INTERVAL ? DAY)';

  if (options.days != null) {
    const [[older]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM error_logs WHERE created_at < ${cutoffSql}`,
      [options.days],
    );

    console.log(`  older than window  ${Number(older.n)} row(s)`);
  }

  if (!options.apply) {
    console.log('  result ........... nothing was deleted.');
    return;
  }

  let deleted = 0;

  for (let batch = 1; batch <= options.maxBatches; batch += 1) {
    const [result] = await pool.execute(
      `DELETE FROM error_logs
        WHERE created_at < ${cutoffSql}
        ORDER BY id ASC
        LIMIT ${Number(options.batch)}`,
      [options.days],
    );

    deleted += result.affectedRows;

    if (result.affectedRows < options.batch) break;
  }

  const after = await tableSize();

  console.log(`  deleted .......... ${deleted} row(s)`);
  console.log(
    `  table now ........ ~${after.approxRows} rows, ${after.mb} MB`,
  );
  console.log(
    '  note ............. InnoDB does not return the freed space to the filesystem until',
  );
  console.log(
    '                     the table is optimised; the rows are gone either way.',
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
