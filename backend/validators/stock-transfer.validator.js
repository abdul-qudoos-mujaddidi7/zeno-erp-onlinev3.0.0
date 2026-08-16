const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

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

const stockTransferItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: z
    .coerce
    .number()
    .default(0),
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

const stockTransferBodySchema = z.object({
  warehouse_id: nullableNumber(),
  to_warehouse_id: nullableNumber(),
  transfer_number: nullableString(255),
  transfer_date: nullableString(50),
  total_amount: nullableNumber(),
  description: nullableString(65535),
  currency: nullableString(50),
  transfer_status: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  payment_account_id: nullableNumber(),
  payment_amount: nullableNumber(),
  payment_currency: nullableString(50),
  payment_description: nullableString(65535),

  items: z
    .array(stockTransferItemSchema)
    .optional()
    .default([]),
});

const stockTransferIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const stockTransferListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

  search: z
    .string()
    .trim()
    .max(255)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createStockTransferSchema: stockTransferBodySchema,
  updateStockTransferSchema: stockTransferBodySchema,
  stockTransferIdParamsSchema,
  stockTransferListQuerySchema,
};
