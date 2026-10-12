function asDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const text = String(value);
  return new Date(
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) &&
      !/[Z+]|-\d{2}:\d{2}$/.test(text.slice(10))
      ? text.replace(" ", "T") + "Z"
      : text,
  );
}
function getLocalDateTime(value, format = "input") {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}${format === "display" ? " " : "T"}${parts.hour}:${parts.minute}`;
}
function formatMySQLDateKabulToUTC(value) {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text))
    throw Object.assign(new Error("Invalid date"), { status: 400 });
  const date = new Date(text + (text.length === 16 ? ":00" : "") + "+04:30");
  if (
    Number.isNaN(date.getTime()) ||
    getLocalDateTime(date) !== text.slice(0, 16)
  )
    throw Object.assign(new Error("Invalid date"), { status: 400 });
  return date.toISOString().replace("T", " ").replace("Z", "");
}
function generateInvoiceNumber(orgId, invoiceId, date) {
  const month = getLocalDateTime(date).slice(0, 7).replace("-", "");
  return `INV-${orgId}-${month}-${String(invoiceId).padStart(6, "0")}`;
}
module.exports = {
  asDate,
  getLocalDateTime,
  formatMySQLDateKabulToUTC,
  generateInvoiceNumber,
};
