/** Default page size for index lists (server + UI). */
export const DEFAULT_PAGE_SIZE = 15;

export const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

/**
 * Append page/limit to URLSearchParams when pagination is requested.
 * Pass paginate:false (or omit page+limit) to fetch all rows (dropdowns).
 */
export function appendPaginationParams(params, {
  page,
  limit,
  paginate = true,
} = {}) {
  if (!paginate) return params;

  const safeLimit = Number(limit) > 0
    ? Number(limit)
    : DEFAULT_PAGE_SIZE;
  const safePage = Number(page) > 0
    ? Number(page)
    : 1;

  params.set('page', String(safePage));
  params.set('limit', String(safeLimit));
  return params;
}

export function readListMeta(response, fallbackLength = 0) {
  const meta = response?.meta;
  if (meta && meta.total != null) {
    return {
      total: Number(meta.total) || 0,
      page: Number(meta.page) || 1,
      limit: Number(meta.limit) || DEFAULT_PAGE_SIZE,
      totalPages: Number(meta.totalPages) || 0,
    };
  }

  return {
    total: fallbackLength,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalPages: Math.ceil(fallbackLength / DEFAULT_PAGE_SIZE) || 0,
  };
}
