/*
 * The SQL half of the ONE accounting-date rule.
 *
 * utils/accountingDate.storedCalendarDay decides, in JavaScript, which
 * calendar day a stored accounting date means:
 *
 *   midnight in the storage frame -> that day (a calendar-day value)
 *   anything with a time of day   -> the LOCAL day of the instant
 *
 * The fiscal-year windows compare those stored values inside SQL, so they need
 * the exact same decision. Without it the two halves disagree for every
 * instant written after 19:30 local (the stored day is then the previous one),
 * which is how a payment could be counted in one fiscal year by the posting
 * guard and in another by the closing engine.
 *
 * The expression below is that rule, spelled out:
 *
 *   CASE WHEN TIME_TO_SEC(TIME(x)) = 0 THEN x ELSE DATE_ADD(x, INTERVAL n MINUTE) END
 *
 *   * a value already at midnight is left alone — so the answer never depends
 *     on the server's timezone, in either direction;
 *   * anything carrying a time of day is an instant in the pool's "Z" frame
 *     and is shifted by the BUSINESS timezone's UTC offset (utils/accountingDate
 *     .businessOffsetMinutes — Asia/Kabul, +270), giving the business calendar
 *     day the guard and the closing engine use.
 *
 * The offset is Kabul's, measured from ICU at request time — NOT the Node
 * machine's offset — so a server running in UTC files a payment on exactly the
 * same accounting day as one running in Kabul.
 *
 * It is a NUMBER computed in Node, never a bind parameter and never a value
 * from a request, so it cannot change a statement's parameter order and cannot
 * be injected.
 *
 * NOT converted on purpose: a `created_at` fallback. MySQL writes that column
 * itself, in the session's local wall clock, so it is already a local value —
 * shifting it would move it a second time.
 */

const {
  businessOffsetMinutes,
} = require('./accountingDate');

/*
 * The date expression as its ACCOUNTING CALENDAR DAY, ready to be compared to
 * a 'YYYY-MM-DD' boundary.
 */
function accountingDaySql(dateExpression, { offsetMinutes = null } = {}) {
  const offset =
    offsetMinutes === null
      ? businessOffsetMinutes()
      : offsetMinutes;

  return `CASE
      WHEN TIME_TO_SEC(TIME(${dateExpression})) = 0 THEN ${dateExpression}
      ELSE DATE_ADD(${dateExpression}, INTERVAL ${offset} MINUTE)
    END`;
}

/*
 * `COALESCE(<accounting day>, created_at)` — the documented fallback for a row
 * whose accounting date is still NULL.
 */
function accountingDayOrCreatedAtSql(dateExpression) {
  const qualifier = dateExpression.includes('.')
    ? dateExpression.slice(0, dateExpression.indexOf('.') + 1)
    : '';

  return `COALESCE(${accountingDaySql(dateExpression)}, ${qualifier}created_at)`;
}

module.exports = {
  accountingDaySql,
  accountingDayOrCreatedAtSql,
};
