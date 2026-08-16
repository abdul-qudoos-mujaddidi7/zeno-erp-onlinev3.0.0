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

const saleItemBodySchema = z.object({
  sale_id: nullableNumber(),

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

const saleItemIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const saleItemListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  sale_id: z
    .coerce
    .number()
    .optional(),

  product_id: z
    .coerce
    .number()
    .optional(),

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
});

module.exports = {
  createSaleItemSchema: saleItemBodySchema,
  updateSaleItemSchema: saleItemBodySchema.partial(),
  saleItemIdParamsSchema,
  saleItemListQuerySchema,
};
