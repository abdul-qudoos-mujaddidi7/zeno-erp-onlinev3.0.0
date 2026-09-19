const { z } = require('zod');

const nullableNumber = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) {
      return null;
    }

    const number = Number(value);

    return Number.isNaN(number) ? null : number;
  },
  z.number().nullable(),
);

const paymentBodyShape = {
  sale_id: nullableNumber,

  account_id: nullableNumber,

  amount: z
    .coerce
    .number()
    .nonnegative()
    .max(1e18)
    .nullable()
    .optional(),

  currency: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional(),

  payment_date: z
    .string()
    .max(50)
    .nullable()
    .optional(),

  description: z
    .string()
    .max(65535)
    .nullable()
    .optional(),

  /*
   * Optional client-supplied stable identifier. When the same value is
   * supplied twice the authoritative payment service returns the payment
   * that already carries it instead of posting a duplicate.
   */
  request_id: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional(),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
};

const paymentBodySchema = z.object(paymentBodyShape);

const createPaymentSchema = z.object({
  ...paymentBodyShape,
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const updatePaymentSchema = z
  .object(paymentBodyShape)
  .partial();

const paymentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const paymentListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

  sale_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),
});

module.exports = {
  createPaymentSchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  paymentListQuerySchema,
};
