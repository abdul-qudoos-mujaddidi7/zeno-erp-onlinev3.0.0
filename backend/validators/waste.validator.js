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

const wasteItemSchema = z.object({
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

const wasteBodySchema = z.object({
  warehouse_id: nullableNumber(),
  reference_number: nullableString(255),
  date: nullableString(50),
  total_amount: nullableNumber(),
  description: nullableString(65535),
  currency: nullableString(50),
  waste_status: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  items: z
    .array(wasteItemSchema)
    .optional()
    .default([]),
});

const wasteIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const wasteListQuerySchema = z.object({
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
  createWasteSchema: wasteBodySchema,
  updateWasteSchema: wasteBodySchema,
  wasteIdParamsSchema,
  wasteListQuerySchema,
};
