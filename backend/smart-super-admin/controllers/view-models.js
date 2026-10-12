const dates = require("../helpers/date-helpers");
const { buildPagination } = require("../helpers/handlebars-helpers");
const BASE = "/smart-super-admin";
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  )
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|token|secret/i.test(key))
        .map(([key, item]) => [key, clean(item)]),
    );
  return value;
}
function display(value) {
  if (value instanceof Date) return dates.getLocalDateTime(value, "display");
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && /^[\[{]/.test(value)) {
    try {
      return JSON.stringify(clean(JSON.parse(value)), null, 2);
    } catch {}
  }
  return typeof value === "object"
    ? JSON.stringify(clean(value), null, 2)
    : String(value);
}
function image(value) {
  const text = String(value ?? "");
  return /^(https?:\/\/|\/(uploads|img)\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(
    text,
  )
    ? text
    : null;
}
function formatField(name, value, table) {
  const helpers = require("../helpers/handlebars-helpers");
  if (["request_size", "response_size"].includes(name))
    return helpers.humanSizeFormat(value);
  if (table === "accounts" && name === "type")
    return helpers.accountTypeName(value);
  return display(value);
}
function recordModel(record, table) {
  return Object.entries(clean(record)).map(([name, value]) => ({
    name,
    label: name.replaceAll("_", " "),
    value: formatField(name, value, table),
    image: /image|photo/.test(name) ? image(value) : null,
  }));
}
function changes(record) {
  try {
    const old = clean(
        typeof record.old_values === "string"
          ? JSON.parse(record.old_values)
          : record.old_values,
      ),
      updated = clean(
        typeof record.new_values === "string"
          ? JSON.parse(record.new_values)
          : record.new_values,
      );
    if (
      !old ||
      !updated ||
      typeof old !== "object" ||
      typeof updated !== "object"
    )
      return [];
    return [...new Set([...Object.keys(old), ...Object.keys(updated)])]
      .filter(
        (key) => JSON.stringify(old[key]) !== JSON.stringify(updated[key]),
      )
      .map((key) => ({
        name: key,
        old: display(old[key]),
        updated: display(updated[key]),
      }));
  } catch {
    return [];
  }
}
function tableModel(
  result,
  { title, basePath, detail, createUrl, query = {}, extraActions } = {},
) {
  const suffix = new URLSearchParams(
    Object.entries(query).filter(
      ([key, value]) =>
        ["q", "type", "status", "filter", "lang"].includes(key) &&
        typeof value === "string",
    ),
  ).toString();
  const addQuery = (url) => url + (suffix ? "?" + suffix : "");
  const route = (sort, direction, page) =>
    `${BASE}/${basePath}/${sort}/${direction}/${result.org}/${result.limit}/${page}`;
  const pagination = buildPagination(
    result.page,
    result.totalPages,
    route(result.sort, result.direction, ""),
  );
  pagination.pages = pagination.pages.map((page) => ({
    ...page,
    url: addQuery(page.url),
  }));
  if (pagination.previous) pagination.previous = addQuery(pagination.previous);
  if (pagination.next) pagination.next = addQuery(pagination.next);
  const columns = result.columns.map((column) => ({
    name: column.name,
    label: column.name.replaceAll("_", " "),
    sorted: result.sort === column.name,
    ascending: result.direction === "ASC",
    ariaSort: result.direction === "ASC" ? "ascending" : "descending",
    url: addQuery(
      route(
        column.name,
        result.sort === column.name && result.direction === "ASC"
          ? "DESC"
          : "ASC",
        1,
      ),
    ),
  }));
  const limits = [10, 20, 50, 100, 250].map((limit) => ({
    limit,
    selected: limit === result.limit,
    url: addQuery(
      `${BASE}/${basePath}/${result.sort}/${result.direction}/${result.org}/${limit}/1`,
    ),
  }));
  return {
    title,
    tableTitle: title,
    columns,
    total: result.total,
    rowStart: result.total ? (result.page - 1) * result.limit + 1 : 0,
    rowEnd: Math.min(result.page * result.limit, result.total),
    rows: result.rows.map((row) => ({
      id: row.id,
      cells: result.columns.map((column) => ({
        label: column.name.replaceAll("_", " "),
        badge: /(^is_active$|status$)/.test(column.name),
        value: formatField(column.name, row[column.name], result.tableName),
        image: /image|photo/.test(column.name) ? image(row[column.name]) : null,
      })),
      detailUrl: detail?.(row),
      actions: extraActions?.(row) || [],
    })),
    pagination,
    limits,
    createUrl,
    tableName: result.tableName,
    query,
  };
}
module.exports = { BASE, display, recordModel, tableModel, changes };
