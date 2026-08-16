const { z } = require('zod');

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 200;

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Resolve optional pagination from a validated query.
 * When page/limit/offset are omitted, returns null (no LIMIT — for dropdowns).
 * When any is present, defaults limit to 15.
 */
function resolvePagination(query = {}) {
  const hasPage = query.page != null;
  const hasLimit = query.limit != null;
  const hasOffset = query.offset != null;

  if (!hasPage && !hasLimit && !hasOffset) {
    return null;
  }

  const limit = hasLimit ? Number(query.limit) : DEFAULT_LIMIT;
  let page = hasPage ? Number(query.page) : 1;
  let offset = hasOffset
    ? Number(query.offset)
    : (page - 1) * limit;

  if (!hasPage && hasOffset) {
    page = Math.floor(offset / limit) + 1;
  }

  return {
    page,
    limit,
    offset,
  };
}

function buildMeta({ total, page, limit }) {
  const safeLimit = Number(limit) || DEFAULT_LIMIT;
  const safeTotal = Number(total) || 0;

  return {
    total: safeTotal,
    page: Number(page) || 1,
    limit: safeLimit,
    totalPages: safeLimit > 0
      ? Math.ceil(safeTotal / safeLimit)
      : 0,
  };
}

/**
 * Run a count + data query with optional LIMIT/OFFSET.
 * @returns {{ data: any[], meta: object|null }}
 */
async function paginateSelect(
  executor,
  {
    tableSql,
    whereSql,
    values = [],
    orderBySql = '',
    columnsSql = '*',
    pagination = null,
    skipCount = false,
  },
) {
  const whereClause = whereSql
    ? `WHERE ${whereSql}`
    : '';

  if (!pagination) {
    const [rows] = await executor.execute(
      `
        SELECT ${columnsSql}
        FROM ${tableSql}
        ${whereClause}
        ${orderBySql}
      `,
      values,
    );

    return {
      data: rows,
      meta: null,
    };
  }

  if (skipCount) {
    const fetchLimit = Number(pagination.limit) + 1;

    const [rows] = await executor.execute(
      `
        SELECT ${columnsSql}
        FROM ${tableSql}
        ${whereClause}
        ${orderBySql}
        LIMIT ?
        OFFSET ?
      `,
      [
        ...values,
        /*
         * MySQL 8.0.22+ rejects DOUBLE-typed bind params for integer-only
         * positions such as LIMIT/OFFSET (mysql2 sends JS numbers as DOUBLE),
         * throwing ER_WRONG_ARGUMENTS: "Incorrect arguments to
         * mysqld_stmt_execute". Send them as strings instead.
         */
        String(fetchLimit),
        String(Number(pagination.offset)),
      ],
    );

    const hasMore = rows.length > Number(pagination.limit);
    const data = hasMore
      ? rows.slice(0, Number(pagination.limit))
      : rows;
    const estimatedTotal =
      Number(pagination.offset) +
      data.length +
      (hasMore ? 1 : 0);

    return {
      data,
      meta: {
        ...buildMeta({
          total: estimatedTotal,
          page: pagination.page,
          limit: pagination.limit,
        }),
        hasMore,
        approximate: true,
      },
    };
  }

  const [countRows] = await executor.execute(
    `
      SELECT COUNT(*) AS total
      FROM ${tableSql}
      ${whereClause}
    `,
    values,
  );

  const total = Number(countRows[0]?.total || 0);

  const [rows] = await executor.execute(
    `
      SELECT ${columnsSql}
      FROM ${tableSql}
      ${whereClause}
      ${orderBySql}
      LIMIT ?
      OFFSET ?
    `,
    [
      ...values,
      /* LIMIT/OFFSET as strings — see note above about MySQL 8.0.22+. */
      String(Number(pagination.limit)),
      String(Number(pagination.offset)),
    ],
  );

  return {
    data: rows,
    meta: buildMeta({
      total,
      page: pagination.page,
      limit: pagination.limit,
    }),
  };
}

function listResponse(data, meta = null) {
  if (meta) {
    return {
      data,
      meta,
    };
  }

  return {
    data,
    meta: null,
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  paginationQuerySchema,
  resolvePagination,
  buildMeta,
  paginateSelect,
  listResponse,
};
