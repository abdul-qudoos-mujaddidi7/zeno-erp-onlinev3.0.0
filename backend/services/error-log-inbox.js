/**
 * Diagnostics log ingest for the client beacon (`POST /logs`).
 *
 * The beacon mirrors every console line of every open tab. It used to be
 * written one INSERT at a time, inside a loop, on a connection the request kept
 * until after a ten-second command poll: one round trip and one commit per
 * console line, on a table that reached ~930 MB for ~56k rows on the beta
 * database.
 *
 * Two things follow from that, and this module is the first of them:
 *
 *   1. one multi-row INSERT per request instead of one per line, so a batch of
 *      20 console lines costs one statement instead of twenty;
 *   2. a ceiling on how much of a single line is stored. `message` and `stack`
 *      are MEDIUMTEXT, and a client that logs a large object - which this app
 *      does - turned one console line into kilobytes of storage. The limits
 *      below keep the diagnostic value (the start of the message, and the fact
 *      that it was truncated) while bounding the row.
 *
 * The second half of the problem, holding a pooled connection for the ten
 * second command poll, lives in the /logs handler itself.
 */

/* Columns of error_logs, in the order the insert binds them. */
const LOG_COLUMNS = [
  'org_id',
  'user_id',
  'user_name',
  'token',
  'ip_address',
  'tab_ses_id',
  'location',
  'log_type',
  'message',
  'stack',
  'system_info',
  'created_at',
];

const MAX_MESSAGE_CHARS = 4000;
const MAX_STACK_CHARS = 4000;
const MAX_LOCATION_CHARS = 2000;
const MAX_SYSTEM_INFO_CHARS = 4000;

/*
 * Rows per statement and per request. A batch larger than the per-request
 * ceiling keeps its newest lines: the tail of the queue is the part that
 * describes what the tab was doing when it reported.
 */
const ROWS_PER_STATEMENT = 200;
const MAX_LOGS_PER_REQUEST = 1000;

function truncate(value, maxChars) {
  if (typeof value !== 'string' || value.length === 0) return null;

  if (value.length <= maxChars) return value;

  return `${value.slice(0, maxChars)}…[truncated ${
    value.length - maxChars
  } chars]`;
}

/*
 * The client sends its user agent, platform, language and screen size with
 * every batch. It is stored per row, so a bounded size keeps a chatty browser
 * from writing the same kilobyte a hundred times over.
 */
function stringifySystemInfo(system) {
  if (system === undefined || system === null) return null;

  try {
    return truncate(JSON.stringify(system), MAX_SYSTEM_INFO_CHARS);
  } catch (error) {
    return null;
  }
}

function stringifyMessage(message) {
  if (typeof message === 'string') return message;

  try {
    return JSON.stringify(message ?? '');
  } catch (error) {
    /* A console.log of a circular object must not break the beacon. */
    return String(message);
  }
}

/**
 * Turn one client entry into a bindable row, or null when it is not usable.
 * Every value is coerced to something mysql2 accepts: the driver rejects
 * `undefined` outright.
 */
function normaliseEntry(raw, context) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    org_id: context.orgId || null,
    user_id: context.userId || null,
    user_name: context.userName || null,
    token: context.token || null,
    ip_address: context.ip || null,
    tab_ses_id: context.tabSesId || null,
    location: truncate(raw.location, MAX_LOCATION_CHARS),
    log_type: truncate(
      typeof raw.type === 'string' && raw.type ? raw.type : 'log',
      50,
    ),
    message: truncate(stringifyMessage(raw.message), MAX_MESSAGE_CHARS),
    stack: truncate(raw.stack, MAX_STACK_CHARS),
    system_info: stringifySystemInfo(context.system),
    created_at: context.createdAt || null,
  };
}

/**
 * Normalise a whole batch.
 *
 * @returns {{ rows: object[], dropped: number }}
 */
function normaliseBatch(logs, context) {
  if (!Array.isArray(logs)) return { rows: [], dropped: 0 };

  const kept =
    logs.length > MAX_LOGS_PER_REQUEST
      ? logs.slice(logs.length - MAX_LOGS_PER_REQUEST)
      : logs;

  const rows = [];

  for (const raw of kept) {
    const row = normaliseEntry(raw, context);

    if (row) rows.push(row);
  }

  return {
    rows,
    dropped: logs.length - kept.length,
  };
}

/**
 * One statement for a whole batch of rows. Kept separate from the write so its
 * shape - and the placeholder/bind ratio - can be asserted without a database.
 */
function buildInsert(rows) {
  const rowPlaceholders = `(${LOG_COLUMNS.map(() => '?').join(', ')})`;

  return {
    sql: `INSERT INTO error_logs (${LOG_COLUMNS.join(', ')})
      VALUES ${rows.map(() => rowPlaceholders).join(', ')}`,
    values: rows.flatMap((row) =>
      LOG_COLUMNS.map((column) => row[column] ?? null),
    ),
  };
}

/**
 * Write a batch through the given pool or connection.
 *
 * Long batches are split so one statement never grows without bound; each
 * statement is still a single round trip and a single commit.
 *
 * @returns {Promise<number>} rows written
 */
async function insertLogs(executor, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let inserted = 0;

  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(start, start + ROWS_PER_STATEMENT);
    const { sql, values } = buildInsert(chunk);

    await executor.execute(sql, values);

    inserted += chunk.length;
  }

  return inserted;
}

module.exports = {
  LOG_COLUMNS,
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  MAX_LOCATION_CHARS,
  MAX_SYSTEM_INFO_CHARS,
  ROWS_PER_STATEMENT,
  MAX_LOGS_PER_REQUEST,
  truncate,
  stringifySystemInfo,
  normaliseEntry,
  normaliseBatch,
  buildInsert,
  insertLogs,
};
