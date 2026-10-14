const Handlebars = require("handlebars");
const dates = require("./date-helpers");
const escape = Handlebars.escapeExpression;
const ACCOUNT_TYPES = [
  "",
  "Asset",
  "Expense",
  "Company",
  "Customer",
  "Bank",
  "Income",
  "Shareholder",
];
function relative(value, future) {
  const date = dates.asDate(value);
  if (!date || Number.isNaN(date.getTime())) return "—";
  const seconds = Math.abs(date.getTime() - Date.now()) / 1000;
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  const [size, name] = units.find(([size]) => seconds >= size) || units.at(-1);
  const amount = Math.floor(seconds / size);
  return `${future && date > new Date() ? "in " : ""}${amount} ${name}${amount === 1 ? "" : "s"}${date <= new Date() ? " ago" : ""}`;
}
function pagination(current, total, baseUrl) {
  const pages = [];
  for (
    let page = Math.max(1, current - 2);
    page <= Math.min(total, current + 2);
    page++
  )
    pages.push({ number: page, active: page === current, url: baseUrl + page });
  return {
    current,
    total,
    pages,
    previous: current > 1 ? baseUrl + (current - 1) : null,
    next: current < total ? baseUrl + (current + 1) : null,
  };
}
module.exports = {
  any: (...args) => args.slice(0, -1).some(Boolean),
  eq: (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  gt: (a, b) => Number(a) > Number(b),
  lt: (a, b) => Number(a) < Number(b),
  formatDate: (date, format) =>
    format === "date"
      ? dates.getLocalDateTime(date).slice(0, 10)
      : dates.getLocalDateTime(
          date,
          typeof format === "string" ? format : "display",
        ),
  showTimeAgo: (value) => relative(value, false),
  showTimeLater: (value) => relative(value, true),
  statusBadge(value) {
    const colors = {
      active: "success",
      paid: "success",
      executed: "success",
      partial: "warning",
      pending: "warning",
      sent: "info",
      overdue: "danger",
      cancelled: "secondary",
      inactive: "secondary",
      draft: "secondary",
      true: "success",
      false: "secondary",
      1: "success",
      0: "secondary",
    };
    return new Handlebars.SafeString(
      `<span class="badge bg-${colors[value] || "primary"}">${escape(value ?? "—")}</span>`,
    );
  },
  truncate: (value, length) =>
    String(value ?? "").slice(0, typeof length === "number" ? length : 160),
  pagination(current, total, baseUrl) {
    const model = pagination(Number(current), Number(total), String(baseUrl));
    return new Handlebars.SafeString(
      model.pages
        .map(
          (page) =>
            `<a class="btn btn-sm ${page.active ? "btn-primary" : "btn-outline-primary"}" href="${escape(page.url)}">${page.number}</a>`,
        )
        .join(" "),
    );
  },
  formatCurrency(value, currency) {
    try {
      const match = String(value ?? 0).match(/^(-?)(\d+)(?:\.(\d+))?$/);
      if (!match) return String(value ?? 0);
      const integer = BigInt(match[1] + match[2]);
      let fraction = (match[3] || "").padEnd(2, "0").slice(0, 6);
      while (fraction.length > 2 && fraction.endsWith("0"))
        fraction = fraction.slice(0, -1);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: typeof currency === "string" ? currency : "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      })
        .formatToParts(match[1] && integer === 0n ? -0 : integer)
        .map((part) => (part.type === "fraction" ? fraction : part.value))
        .join("");
    } catch {
      return `${value ?? 0} ${typeof currency === "string" ? currency : ""}`;
    }
  },
  humanSizeFormat(value) {
    const bytes = Math.max(0, Number(value) || 0);
    const index = Math.min(
      4,
      Math.floor(Math.log(bytes || 1) / Math.log(1024)),
    );
    return `${(bytes / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][index]}`;
  },
  accountTypeName: (value) => ACCOUNT_TYPES[Number(value)] || value,
  json: (value) => JSON.stringify(value ?? null),
  math(a, op, b) {
    a = Number(a);
    b = Number(b);
    return (
      {
        "+": () => a + b,
        "-": () => a - b,
        "*": () => a * b,
        "/": () => (b ? a / b : 0),
      }[op]?.() ?? 0
    );
  },
};
module.exports.buildPagination = pagination;
