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

const inventoryRecordItemSchema = z.object({
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
  extra_info: nullableString(65535),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const inventoryRecordBodySchema = z.object({
  apartment_id: nullableNumber(),
  warehouse_id: nullableNumber(),
  account_id: nullableNumber(),
  record_type: nullableString(50),
  record_number: nullableString(255),
  record_date: nullableString(50),
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
  record_status: nullableString(50),
  items_count: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(inventoryRecordItemSchema)
    .optional(),
});

const paymentBodySchema = z.object({
  record_id: nullableNumber(),
  account_id: nullableNumber(),
  amount: nullableNumber(),
  currency: nullableString(50),
  payment_date: paymentDateSchema,
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
  buy_price: nullableNumber(),
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
  record_id: nullableNumber(),
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

const paymentParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  paymentId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const returnParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  returnId: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const inventoryRecordListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  record_status: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default(''),

  account_id: z
    .preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) {
          return '';
        }

        return value;
      },
      z.union([
        z.literal(''),
        z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ]),
    )
    .optional()
    .default(''),

  apartment_id: z
    .preprocess(
      (value) => {
        if (value === '' || value === undefined || value === null) {
          return '';
        }

        return value;
      },
      z.union([
        z.literal(''),
        z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      ]),
    )
    .optional()
    .default(''),

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
}).merge(paginationQuerySchema);

const updateInventoryRecordSchema =
  inventoryRecordBodySchema.partial();

module.exports = {
  createInventoryRecordSchema: inventoryRecordBodySchema,
  updateInventoryRecordSchema,
  inventoryRecordIdParamsSchema: idParamsSchema,
  inventoryRecordListQuerySchema,
  createPaymentSchema: paymentBodySchema,
  paymentParamsSchema,
  createReturnSchema: returnBodySchema,
  returnParamsSchema,
};
