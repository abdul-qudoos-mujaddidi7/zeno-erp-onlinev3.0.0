/*
 * FIFO/LIFO batch ordering.
 *
 * Purchase bill_date is date-only (midnight). Opening stock uses a
 * real timestamp later that morning. Sorting by received_at alone
 * would consume the later purchase first. Same calendar day is
 * ordered by created_at / local_id (true first-in).
 */

function toDayKey(value) {
  if (value == null || value === '') return '';

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
}

function toMillis(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLocalId(value) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function isLifo(method) {
  return String(method || '').toUpperCase() === 'LIFO';
}

function sortOpenBatches(batches, method) {
  const lifo = isLifo(method);

  return [...(batches || [])].sort((first, second) => {
    const dayFirst = toDayKey(first.received_at);
    const daySecond = toDayKey(second.received_at);
    if (dayFirst !== daySecond) {
      return lifo
        ? daySecond.localeCompare(dayFirst)
        : dayFirst.localeCompare(daySecond);
    }

    const createdFirst = toMillis(first.created_at);
    const createdSecond = toMillis(second.created_at);
    if (createdFirst !== createdSecond) {
      return lifo
        ? createdSecond - createdFirst
        : createdFirst - createdSecond;
    }

    const idFirst = toLocalId(first.local_id);
    const idSecond = toLocalId(second.local_id);
    if (idFirst === idSecond) return 0;
    if (lifo) return idFirst > idSecond ? -1 : 1;
    return idFirst < idSecond ? -1 : 1;
  });
}

function planConsumption(batches, quantity, method) {
  const ordered = sortOpenBatches(batches, method);
  let remaining = Number(quantity) || 0;
  const takes = [];

  for (const batch of ordered) {
    if (remaining <= 0) break;

    const available = Number(batch.quantity_remaining) || 0;
    if (available <= 0) continue;

    const consume = Math.min(available, remaining);
    takes.push({
      local_id: batch.local_id,
      source_type: batch.source_type,
      unit_cost: Number(batch.unit_cost) || 0,
      available,
      consume,
      remaining: available - consume,
    });
    remaining -= consume;
  }

  return {
    ordered: ordered.map((batch) => ({
      local_id: batch.local_id,
      source_type: batch.source_type,
      received_at: batch.received_at,
      quantity_remaining: Number(batch.quantity_remaining) || 0,
    })),
    takes,
    leftover: remaining,
  };
}

/*
 * Date-only values (YYYY-MM-DD / midnight) get the current clock
 * time so a same-day purchase does not sort before opening stock.
 */
function resolveBatchReceivedAt(value) {
  if (value == null || value === '') return new Date();

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const midnightUtc =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    if (!midnightUtc) return value;

    const now = new Date();
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds(),
      ),
    );
  }

  const raw = String(value).trim();
  const dayOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dayOnly) {
    const now = new Date();
    const [year, month, day] = dayOnly[1].split('-').map(Number);
    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
        now.getUTCMilliseconds(),
      ),
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

module.exports = {
  toDayKey,
  sortOpenBatches,
  planConsumption,
  resolveBatchReceivedAt,
};
