const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

const {
  paymentDateSchema,
} = require('./payment-date.validator');

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
  /*
   * Optional visitor. When it is omitted or null the sale behaves exactly as
   * before: no visitor journal, no benefit split. visitor_percentage and
   * visitor_benefit are never accepted from the client — the server reads the
   * account's percentage and computes the amount from the sale's benefit.
   */
  visitor_account_id: nullableNumber(),
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
      payment_date: paymentDateSchema,
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
  payment_date: paymentDateSchema,
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

  currency: z.string().trim().max(50).optional(),

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

/*
 * Used by GET /sales/visitor-report. A report is a whole-table aggregate, so it
 * takes a date range, optional currency and optional comma-separated product or
 * visitor account IDs. There is no pagination, search or sort because the
 * result is grouped.
 */
const visitorReportQuerySchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),

  currency: z.string().trim().max(50).optional().default('all'),

  product_ids: z
    .string()
    .trim()
    .max(4000)
    .regex(/^\d+(,\d+)*$/, 'product_ids must be comma-separated IDs')
    .optional(),

  visitor_ids: z
    .string()
    .trim()
    .max(4000)
    .regex(/^\d+(,\d+)*$/, 'visitor_ids must be comma-separated IDs')
    .optional(),
});

/*
 * Used by GET /sales/next-number. `sale_type` decides which prefix the
 * counter is published under (POS- vs INV-).
 */
const nextInvoiceNumberQuerySchema = z.object({
  sale_type: z
    .string()
    .trim()
    .max(63)
    .optional()
    .default(''),
});

module.exports = {
  createSaleSchema: saleBodySchema,
  updateSaleSchema,
  saleIdParamsSchema: idParamsSchema,
  saleListQuerySchema,
  visitorReportQuerySchema,
  nextInvoiceNumberQuerySchema,
  createPaymentSchema: paymentBodySchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  createReturnSchema: returnBodySchema,
  returnIdParamsSchema,
};
