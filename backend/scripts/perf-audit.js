#!/usr/bin/env node
/**
 * Read-only performance audit.
 *
 * Reports table sizes, indexes on hot tables and the wall-clock cost of the
 * queries the ERP runs on every list/dashboard render. It never writes: only
 * SELECT / SHOW / EXPLAIN statements are issued.
 *
 * Usage: node scripts/perf-audit.js
 */
require('dotenv').config();
const pool = require('../db');

const HOT_TABLES = [
  'journals',
  'sales',
  'sale_items',
  'sale_payments',
  'sale_returns',
  'accounts',
  'account_images',
  'warehouse_products',
  'products',
  'purchases',
  'purchase_items',
];

function ms(start) {
  return Date.now() - start;
}

async function tableSizes() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS name,
            TABLE_ROWS AS approx_rows,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 1) AS mb
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${HOT_TABLES.map(() => '?').join(',')})
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`,
    HOT_TABLES,
  );
  return rows;
}

async function indexesFor(table) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME AS name, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols,
            NON_UNIQUE AS non_unique
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME`,
    [table],
  );
  return rows;
}

async function timeQuery(label, sql, params = []) {
  const start = Date.now();
  const [rows] = await pool.query(sql, params);
  return { label, ms: ms(start), rows: Array.isArray(rows) ? rows.length : 0 };
}

async function explain(sql, params = []) {
  const [rows] = await pool.query(`EXPLAIN ${sql}`, params);
  return rows.map((r) => `${r.table} | key=${r.key || 'NULL'} | rows=${r.rows} | ${r.type}`);
}

async function main() {
  console.log('\n=== TABLE SIZES (approx) ===');
  for (const row of await tableSizes()) {
    console.log(`${String(row.name).padEnd(22)} rows=${String(row.approx_rows).padStart(10)}  ${row.mb} MB`);
  }

  for (const table of ['journals', 'sales', 'sale_items', 'accounts', 'warehouse_products']) {
    console.log(`\n=== INDEXES: ${table} ===`);
    for (const idx of await indexesFor(table)) {
      console.log(`${idx.name.padEnd(40)} (${idx.cols})${idx.non_unique ? '' : '  UNIQUE'}`);
    }
  }

  const [orgRow] = await pool.query('SELECT org_id, COUNT(*) c FROM sales GROUP BY org_id ORDER BY c DESC LIMIT 1');
  const orgId = orgRow.length ? orgRow[0].org_id : 1;
  const [jOrgRow] = await pool.query('SELECT org_id, COUNT(*) c FROM journals GROUP BY org_id ORDER BY c DESC LIMIT 1');
  const jOrg = jOrgRow.length ? jOrgRow[0].org_id : orgId;
  console.log(`\n=== TIMINGS (org sales=${orgId}, journals=${jOrg}) ===`);

  const [saleRows] = await pool.query(
    'SELECT id, local_id FROM sales WHERE org_id = ? ORDER BY id DESC LIMIT 15',
    [orgId],
  );
  const saleIds = saleRows.map((row) => row.local_id ?? row.id);
  const salePlaceholders = saleIds.map(() => '?').join(',');

  const queries = [
    ['accounts list', 'SELECT * FROM accounts WHERE org_id = ? AND status = 1 ORDER BY created_at ASC', [orgId]],
    ['accounts count', 'SELECT COUNT(*) AS total FROM accounts WHERE org_id = ? AND status = 1', [orgId]],
    ['sales list page', 'SELECT * FROM sales WHERE org_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 20', [orgId]],
    ['sales count', 'SELECT COUNT(*) AS total FROM sales WHERE org_id = ? AND status = 1', [orgId]],
    ['journals all(org)', 'SELECT * FROM journals WHERE org_id = ? AND status = 1', [jOrg]],
    ['journal balance agg', `SELECT first_entry_account AS account_id, currency,
              SUM(first_entry_credit) - SUM(first_entry_debit) AS bal
         FROM journals WHERE org_id = ? AND status = 1 GROUP BY first_entry_account, currency`, [jOrg]],
    ['products list', 'SELECT * FROM products WHERE org_id = ? AND status = 1', [orgId]],
    ['warehouse_products', 'SELECT * FROM warehouse_products WHERE org_id = ? AND status = 1', [orgId]],
    ['sale_items all', 'SELECT * FROM sale_items WHERE org_id = ? AND status = 1', [orgId]],
    ['sale_items by sale ids', `SELECT * FROM sale_items WHERE org_id = ? AND sale_id IN (${salePlaceholders})`, [orgId, ...saleIds]],
    ['sale_payments by ids', `SELECT * FROM sale_payments WHERE org_id = ? AND sale_id IN (${salePlaceholders})`, [orgId, ...saleIds]],
    ['sale_returns by ids', `SELECT * FROM sale_returns WHERE org_id = ? AND sale_id IN (${salePlaceholders})`, [orgId, ...saleIds]],
    ['purchases list page', 'SELECT * FROM purchases WHERE org_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 20', [orgId]],
    ['purchases count', 'SELECT COUNT(*) AS total FROM purchases WHERE org_id = ? AND status = 1', [orgId]],
    ['journal by reference', `SELECT * FROM journals WHERE org_id = ? AND status = 1 AND reference_type = ? AND reference_id = ?`, [jOrg, 'sale', saleIds[0] ?? 1]],
    ['sales by ids', `SELECT * FROM sales WHERE org_id = ? AND local_id IN (${salePlaceholders})`, [orgId, ...saleIds]],
  ];

  for (const [label, sql, params] of queries) {
    try {
      const r = await timeQuery(label, sql, params);
      console.log(`${label.padEnd(24)} ${String(r.ms).padStart(6)} ms  rows=${r.rows}`);
    } catch (error) {
      console.log(`${label.padEnd(24)} FAILED: ${error.message}`);
    }
  }

  console.log('\n=== EXPLAIN: journal by reference ===');
  try {
    for (const line of await explain(
      'SELECT * FROM journals WHERE org_id = ? AND status = 1 AND reference_type = ? AND reference_id = ?',
      [jOrg, 'sale', saleIds[0] ?? 1],
    )) {
      console.log('  ' + line);
    }
  } catch (error) {
    console.log('  FAILED: ' + error.message);
  }

  console.log('\n=== EXPLAIN: sale_items by sale ids ===');
  try {
    for (const line of await explain(
      `SELECT * FROM sale_items WHERE org_id = ? AND sale_id IN (${salePlaceholders})`,
      [orgId, ...saleIds],
    )) {
      console.log('  ' + line);
    }
  } catch (error) {
    console.log('  FAILED: ' + error.message);
  }

  console.log('\n=== EXPLAIN: journal balance aggregate (second_entry side) ===');
  try {
    for (const line of await explain(
      `SELECT second_entry_account AS account_id, currency,
              SUM(second_entry_credit) - SUM(second_entry_debit) AS bal
         FROM journals WHERE org_id = ? AND status = 1 GROUP BY second_entry_account, currency`,
      [jOrg],
    )) {
      console.log('  ' + line);
    }
  } catch (error) {
    console.log('  FAILED: ' + error.message);
  }

  console.log('\n=== EXPLAIN: sales list ===');
  try {
    for (const line of await explain(
      'SELECT * FROM sales WHERE org_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 20',
      [orgId],
    )) {
      console.log('  ' + line);
    }
  } catch (error) {
    console.log('  FAILED: ' + error.message);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pool.end();
  } catch {}
  process.exitCode = 1;
});
