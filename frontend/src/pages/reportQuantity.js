export function sumReportQuantity(items = []) {
  return items.reduce(
    (total, item) => total + (Number(item?.quantity) || 0),
    0,
  );
}
