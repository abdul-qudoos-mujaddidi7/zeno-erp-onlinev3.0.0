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

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    },
    z
      .number()
      .nullable(),
  );

const bomItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  wastage_percent: nullableNumber(),
  unit_price: nullableNumber(),
  subtotal: nullableNumber(),
  currency: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const bomOperationSchema = z.object({
  work_center_id: nullableNumber(),
  operation_name: nullableString(255),
  sequence: nullableNumber(),
  setup_time: nullableNumber(),
  setup_time_unit: nullableString(50),
  run_time: nullableNumber(),
  run_time_unit: nullableString(50),
  cost_per_hour: nullableNumber(),
  cost_currency: nullableString(50),
  fixed_cost: nullableNumber(),
  labor_count: nullableNumber(),
  efficiency: nullableNumber(),
  description: nullableString(65535),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const bomBodySchema = z.object({
  product_id: nullableNumber(),
  bill_number: nullableString(255),
  bill_date: nullableString(50),
  bill_status: nullableString(50),
  quantity: nullableNumber(),
  product_unit_id: nullableNumber(),
  description: nullableString(65535),
  total_amount: nullableNumber(),
  currency: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(bomItemSchema)
    .optional()
    .default([]),
  operations: z
    .array(bomOperationSchema)
    .optional()
    .default([]),
});

const bomIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const bomListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),

  bill_status: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default(''),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),
});

module.exports = {
  createBomSchema: bomBodySchema,
  updateBomSchema: bomBodySchema,
  bomIdParamsSchema,
  bomListQuerySchema,
};
