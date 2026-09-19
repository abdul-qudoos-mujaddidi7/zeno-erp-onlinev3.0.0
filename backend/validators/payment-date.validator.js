const { z } = require('zod');

/*
 * The accounting date of a payment.
 *
 * The application now sends a calendar day ('YYYY-MM-DD'), which is the shape
 * this accepts first. A full datetime or ISO instant is still accepted so
 * existing API callers keep working — those carry a UTC instant, and the
 * backend copies whatever it is given into the payment row and its journal.
 *
 * What is deliberately NOT accepted is anything that is not a date at all:
 * previously any string under 50 characters passed validation and was handed
 * straight to a DATETIME column, where MySQL rejected it with a 500.
 *
 * '' is treated as "no date supplied" rather than as an explicit null, so an
 * update that happens to send an empty date cannot wipe a stored one — the
 * caller simply cannot see that field. `null` still means an explicit clear.
 */
const paymentDateSchema = z.preprocess(
  (value) => {
    if (value === '' || value === undefined) {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(50)
    .regex(
      /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/,
      'payment_date must be YYYY-MM-DD',
    )
    .nullable()
    .optional(),
);

module.exports = {
  paymentDateSchema,
};
