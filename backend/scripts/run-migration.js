/**
 * Migration runner for the additive migrations in backend/migrations.
 *
 * Usage:
 *   node scripts/run-migration.js                       # list what is pending
 *   node scripts/run-migration.js <file.sql>            # apply one migration
 *   node scripts/run-migration.js --all                 # apply every pending one
 *   node scripts/run-migration.js <file.sql> --dry-run  # print, change nothing
 *
 * Safety rules, matching how the Step 0-5 migrations were written:
 *   * a migration may only CREATE missing structures — a statement that is not
 *     CREATE TABLE / CREATE INDEX / ADD COLUMN is refused outright, so this
 *     runner can never rewrite financial or historical data;
 *   * `CREATE TABLE` is skipped when the table already exists, which makes a
 *     re-run safe and keeps the runner idempotent;
 *   * statements run one at a time on a single connection, outside any
 *     application transaction, and the process exits non-zero on the first
 *     failure.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const pool = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const ALLOWED_STATEMENT = /^\s*(?:CREATE\s+(?:TABLE|INDEX|UNIQUE\s+INDEX|VIEW)|ALTER\s+TABLE\s+[A-Za-z0-9_`]+\s+ADD\s+COLUMN)/i;

/**
 * Splits a migration file into single statements. `--` comments are dropped
 * first so a comment can never be mistaken for part of a statement, and the
 * remaining text is split on `;` at end of line. The project's migrations are
 * plain DDL and contain no semicolons inside string literals.
 */
function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function createdTableName(statement) {
  const match = statement.match(
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?/i,
  );

  return match ? match[1] : null;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName],
  );

  return Number(rows[0]?.total || 0) > 0;
}

function addedColumn(statement) {
  const match = statement.match(/^\s*ALTER\s+TABLE\s+`?([\w]+)`?\s+ADD\s+COLUMN\s+`?([\w]+)`?/i);
  return match ? { table: match[1], column: match[2] } : null;
}

function createdIndex(statement) {
  const match = statement.match(/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?([\w]+)`?\s+ON\s+`?([\w]+)`?/i);
  return match ? { index: match[1], table: match[2] } : null;
}

async function schemaItemExists(connection, item) {
  if (item.column) {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
      [item.table, item.column],
    );
    return Number(rows[0]?.total || 0) > 0;
  }
  const [rows] = await connection.execute(
    `SELECT COUNT(*) total FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=?`,
    [item.table, item.index],
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function applyMigration(fileName, { dryRun = false } = {}) {
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration not found: ${fileName}`);
  }

  const statements = splitStatements(fs.readFileSync(filePath, 'utf8'));

  console.log(`\n=== ${fileName} (${statements.length} statement(s)) ===`);

  for (const statement of statements) {
    if (!ALLOWED_STATEMENT.test(statement)) {
      throw new Error(
        `Refusing to run a non-additive statement in ${fileName}:\n${statement.slice(0, 200)}`,
      );
    }
  }

  if (dryRun) {
    for (const statement of statements) {
      console.log(`-- would run:\n${statement}\n`);
    }

    return { applied: 0, skipped: statements.length };
  }

  const connection = await pool.getConnection();
  let applied = 0;
  let skipped = 0;

  try {
    for (const statement of statements) {
      const tableName = createdTableName(statement);
      const schemaItem = addedColumn(statement) || createdIndex(statement);

      if (tableName && (await tableExists(connection, tableName))) {
        console.log(`SKIP  ${tableName} already exists`);
        skipped += 1;
        continue;
      }

      if (schemaItem && (await schemaItemExists(connection, schemaItem))) {
        console.log(`SKIP  ${schemaItem.column || schemaItem.index} already exists`);
        skipped += 1;
        continue;
      }

      await connection.query(statement);
      console.log(`OK    ${tableName || statement.slice(0, 60)}`);
      applied += 1;
    }
  } finally {
    connection.release();
  }

  return { applied, skipped };
}

function pendingMigrationNames() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const applyAll = args.includes('--all');
  const files = args.filter((arg) => !arg.startsWith('--'));

  if (applyAll) {
    for (const fileName of pendingMigrationNames()) {
      await applyMigration(fileName, { dryRun });
    }

    return;
  }

  if (files.length === 0) {
    console.log('Migrations found:');

    for (const fileName of pendingMigrationNames()) {
      console.log(`  ${fileName}`);
    }

    console.log('\nRun one with: node scripts/run-migration.js <file.sql>');

    return;
  }

  for (const fileName of files) {
    await applyMigration(fileName, { dryRun });
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(`\nFAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
