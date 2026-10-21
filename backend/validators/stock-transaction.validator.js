const { z } = require('zod');

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined) {
        return null;
      }

      return value;
    },
    z
      .string()
      .trim()
      .max(maxLength)
      .nullable(),
  );

const nullableNumber = () =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      return Number(value);
    },
    z
      .number()
      .nullable(),
  );

const stockTransactionBodySchema = z.object({
  warehouse_id: nullableNumber(),

  product_id: nullableNumber(),

  product_unit_id: nullableNumber(),

  reference_id: nullableNumber(),

  reference_type: nullableString(50),

  transaction_type: z
    .string({
      required_error: 'Transaction type is required.',
    })
    .trim()
    .min(1, 'Transaction type is required.')
    .max(50, 'Transaction type is too long.'),

  quantity: z
    .coerce
    .number()
    .default(0),

  unit_cost: nullableNumber(),

  total_cost: nullableNumber(),

  currency: nullableString(50),

  peer_price: nullableNumber(),

  peer_currency: nullableString(50),

  date: nullableString(30),

  batch: nullableString(255),

  manufacturing_date: nullableString(255),

  expiry_date: nullableString(255),

  heaviness: nullableNumber(),

  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const stockTransactionIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const stockTransactionListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

  date_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  date_to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  product_ids: z
    .string()
    .trim()
    .optional(),

  warehouse_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  reference_type: z
    .string()
    .trim()
    .max(50)
    .optional(),

  transaction_type: z
    .string()
    .trim()
    .max(50)
    .optional(),

  reference_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional(),

  page: z
    .coerce
    .number()
    .int()
    .min(1)
    .optional(),

  offset: z
    .coerce
    .number()
    .int()
    .min(0)
    .optional(),

  search: z.string().trim().max(255).optional(),

  /*
   * Whitelisted: the value reaches an ORDER BY clause, which cannot take a
   * bind parameter. Anything outside this list is rejected before it is used.
   */
  sort: z
    .enum([
      'id',
      'local_id',
      'date',
      'created_at',
      'updated_at',
      'transaction_type',
      'reference_type',
      'reference_id',
      'quantity',
      'unit_cost',
      'total_cost',
      'status',
    ])
    .optional(),

  direction: z.enum(['asc', 'desc', 'ASC', 'DESC']).optional(),

  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),
});

module.exports = {
  createStockTransactionSchema: stockTransactionBodySchema,
  updateStockTransactionSchema: stockTransactionBodySchema,
  stockTransactionIdParamsSchema,
  stockTransactionListQuerySchema,
};
