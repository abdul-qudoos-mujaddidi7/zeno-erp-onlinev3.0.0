function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function oneMonthDateWindow(now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const previousMonthLastDay = new Date(
    to.getFullYear(),
    to.getMonth(),
    0,
  ).getDate();
  const from = new Date(
    to.getFullYear(),
    to.getMonth() - 1,
    Math.min(to.getDate(), previousMonthLastDay),
  );

  return {
    from: localDateString(from),
    to: localDateString(to),
  };
}
