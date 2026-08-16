const crypto = require('crypto');

const MIN_ID = 1_000_000_000_000_000;
const SPAN = 8_000_000_000_000_000n;
const REJECT_ABOVE = (2n ** 64n / SPAN) * SPAN;

/**
 * Random 16-digit local ID (1e15 .. 9e15-1).
 * Same range as the old desktop betterId(), but uses crypto bytes
 * so every integer in the range is possible and JS-safe for BIGINT.
 */
function generateLocalId() {
  let sample;

  do {
    sample = crypto.randomBytes(8).readBigUInt64BE();
  } while (sample >= REJECT_ABOVE);

  const id = MIN_ID + Number(sample % SPAN);

  if (!Number.isSafeInteger(id)) {
    throw new Error(
      'Generated local ID exceeds JavaScript safe integer range.',
    );
  }

  return id;
}

module.exports = {
  generateLocalId,
};
