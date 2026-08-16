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

const stockBatchBodySchema = z.object({
  warehouse_id: nullableNumber(),

  product_id: nullableNumber(),

  received_at: nullableString(255),

  quantity_in: z
    .coerce
    .number()
    .default(0),

  source_type: nullableString(255),

  source_id: nullableNumber(),

  quantity_remaining: z
    .coerce
    .number()
    .default(0),

  unit_cost: nullableNumber(),

  currency: nullableString(50),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const stockBatchIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const stockBatchListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

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

  source_type: z
    .string()
    .trim()
    .max(255)
    .optional(),

  source_id: z
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
});

module.exports = {
  createStockBatchSchema: stockBatchBodySchema,
  updateStockBatchSchema: stockBatchBodySchema,
  stockBatchIdParamsSchema,
  stockBatchListQuerySchema,
};
