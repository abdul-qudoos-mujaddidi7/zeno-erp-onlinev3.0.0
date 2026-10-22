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

const productionItemSchema = z.object({
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
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

const productionOperationSchema = z.object({
  bom_operation_id: nullableNumber(),
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

const productionReturnItemSchema = z.object({
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

const productionReturnSchema = z.object({
  production_id: nullableNumber(),
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
    .array(productionReturnItemSchema)
    .optional()
    .default([]),
});

const productionBodySchema = z.object({
  production_type: nullableString(255),
  production_number: nullableString(255),
  production_start_date: nullableString(50),
  production_end_date: nullableString(50),
  production_status: nullableString(50),
  product_id: nullableNumber(),
  bom_id: nullableNumber(),
  warehouse_id: nullableNumber(),
  quantity: nullableNumber(),
  product_unit_id: nullableNumber(),
  total_amount: nullableNumber(),
  currency: nullableString(50),
  description: nullableString(65535),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  items: z
    .array(productionItemSchema)
    .optional()
    .default([]),
  operations: z
    .array(productionOperationSchema)
    .optional()
    .default([]),
});

const productionIdParamsSchema = z.object({
  id: z
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

const productionListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),

  production_status: z
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
  createProductionSchema: productionBodySchema,
  updateProductionSchema: productionBodySchema,
  productionIdParamsSchema,
  productionListQuerySchema,
  createReturnSchema: productionReturnSchema,
  returnIdParamsSchema,
};
