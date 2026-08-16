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

const purchaseItemBodySchema = z.object({
  purchase_id: nullableNumber(),

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

const purchaseItemIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const purchaseItemListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  purchase_id: z
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
}).merge(paginationQuerySchema);

module.exports = {
  createPurchaseItemSchema: purchaseItemBodySchema,
  updatePurchaseItemSchema: purchaseItemBodySchema.partial(),
  purchaseItemIdParamsSchema,
  purchaseItemListQuerySchema,
};
