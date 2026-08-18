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

const purchaseItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  unit_price: nullableNumber(),
  sell_price: nullableNumber(),
  currency: nullableString(50),
  sell_currency: nullableString(50),
  discount_type: nullableString(255),
  discount_amount: nullableNumber(),
  batch: nullableString(255),
  manufacturing_date: nullableString(255),
  expiry_date: nullableString(255),
  subtotal: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const purchaseBodySchema = z.object({
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  bill_number: nullableString(255),
  bill_date: nullableString(50),
  due_date: nullableString(50),
  expense_amount: nullableNumber(),
  total_amount: nullableNumber(),
  description: nullableString(65535),
  remaining: nullableNumber(),
  currency: nullableString(50),
  bill_status: nullableString(50),
  items_count: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(purchaseItemSchema)
    .optional(),
});

const paymentBodySchema = z.object({
  purchase_id: nullableNumber(),
  account_id: nullableNumber(),
  amount: nullableNumber(),
  currency: nullableString(50),
  payment_date: nullableString(50),
  description: nullableString(65535),
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
  purchase_id: nullableNumber(),
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

const purchaseListQuerySchema = z.object({
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

  bill_status: z
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

const updatePurchaseSchema =
  purchaseBodySchema.partial();

const updatePaymentSchema =
  paymentBodySchema.partial();

module.exports = {
  createPurchaseSchema: purchaseBodySchema,
  updatePurchaseSchema,
  purchaseIdParamsSchema: idParamsSchema,
  purchaseListQuerySchema,
  createPaymentSchema: paymentBodySchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  createReturnSchema: returnBodySchema,
  returnIdParamsSchema,
};
