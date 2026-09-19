const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
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

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    },
    z
      .number()
      .nullable(),
  );

const saleItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  buy_price: nullableNumber(),
  buy_price_currency: nullableString(50),
  unit_price: nullableNumber(),
  currency: nullableString(50),
  discount_type: nullableString(63),
  discount_amount: nullableNumber(),
  subtotal: nullableNumber(),
  fifo_cost: nullableNumber(),
  profit: nullableNumber(),
  extra_info: nullableString(65535),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const saleBodySchema = z.object({
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  sale_type: nullableString(50),
  invoice_number: nullableString(255),
  invoice_date: nullableString(50),
  due_date: nullableString(50),
  expense_amount: nullableNumber(),
  total_amount: nullableNumber(),
  discount_type: nullableString(63),
  discount_amount: nullableNumber(),
  description: nullableString(65535),
  extra_info: nullableString(65535),
  remaining: nullableNumber(),
  benefit: nullableNumber(),
  currency: nullableString(50),
  invoice_status: nullableString(50),
  items_count: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(saleItemSchema)
    .optional(),
  /*
   * Optional payment posted in the same create/update
   * transaction so Confirm Sale is one round-trip.
   */
  payment: z
    .object({
      account_id: nullableNumber(),
      amount: nullableNumber(),
      currency: nullableString(50),
      payment_date: nullableString(50),
      description: nullableString(65535),
      request_id: nullableString(100),
      status: z
        .coerce
        .number()
        .int()
        .min(0)
        .max(1)
        .default(1),
    })
    .optional()
    .nullable(),
});

const paymentBodySchema = z.object({
  sale_id: nullableNumber(),
  account_id: nullableNumber(),
  amount: nullableNumber(),
  currency: nullableString(50),
  payment_date: nullableString(50),
  description: nullableString(65535),
  request_id: nullableString(100),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const returnItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  unit_price: nullableNumber(),
  currency: nullableString(50),
  subtotal: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const returnBodySchema = z.object({
  sale_id: nullableNumber(),
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  return_number: nullableString(255),
  return_date: nullableString(50),
  total_amount: nullableNumber(),
  description: nullableString(65535),
  currency: nullableString(50),
  return_status: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(returnItemSchema)
    .optional()
    .default([]),
});

const idParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const paymentIdParamsSchema = z.object({
  paymentId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const returnIdParamsSchema = z.object({
  returnId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const saleListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  relations: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),

  invoice_status: z
    .string()
    .trim()
    .max(50)
    .optional(),

  payment_status: z
    .enum(['paid', 'unpaid'])
    .optional(),

  ids: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .default(''),

  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  sort_by: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default('created_at'),

  sort_dir: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
}).merge(paginationQuerySchema);

const updateSaleSchema =
  saleBodySchema.partial().omit({ status: true }).extend({
    status: z
      .coerce
      .number()
      .int()
      .min(0)
      .max(1)
      .optional(),
  });

const updatePaymentSchema =
  paymentBodySchema.partial();

module.exports = {
  createSaleSchema: saleBodySchema,
  updateSaleSchema,
  saleIdParamsSchema: idParamsSchema,
  saleListQuerySchema,
  createPaymentSchema: paymentBodySchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  createReturnSchema: returnBodySchema,
  returnIdParamsSchema,
};
