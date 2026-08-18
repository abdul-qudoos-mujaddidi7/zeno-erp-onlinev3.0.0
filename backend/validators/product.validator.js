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

const productBodySchema = z.object({
  name: z
    .string({
      required_error: 'Product name is required.',
    })
    .trim()
    .min(1, 'Product name is required.')
    .max(255, 'Product name is too long.'),

  code: nullableString(255),

  type: nullableString(255),

  product_status: nullableString(50),

  description: nullableString(65535),

  currency: nullableString(50),
  buy_currency: nullableString(50),
  sell_currency: nullableString(50),

  service_duration: nullableNumber(),
  service_duration_unit: nullableString(255),

  percentage: nullableNumber(),

  buy_price: nullableNumber(),
  sell_price: nullableNumber(),

  category_id: nullableNumber(),
  department_id: nullableNumber(),
  user_id: nullableNumber(),
  brand_id: nullableNumber(),
  generic_id: nullableNumber(),
  product_unit_id: nullableNumber(),

  initial_warehouse_id: nullableNumber(),
  initial_quantity: nullableNumber(),
  quantity: nullableNumber(),
  alarm_quantity: nullableNumber(),
  alarm_expiry_days: nullableNumber(),

  batch: nullableString(255),
  manufacturing_date: nullableString(255),
  expiry_date: nullableString(255),

  benefit: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const productIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const productListQuerySchema = z.object({
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

  type: z
    .string()
    .trim()
    .max(255)
    .optional(),

  exclude_type: z
    .string()
    .trim()
    .max(255)
    .optional(),

  category_id: z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return undefined;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    },
    z
      .number()
      .int()
      .positive()
      .optional(),
  ),

  product_status: z
    .string()
    .trim()
    .max(50)
    .optional(),

  brand_id: z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return undefined;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    },
    z
      .number()
      .int()
      .positive()
      .optional(),
  ),

  generic_id: z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return undefined;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    },
    z
      .number()
      .int()
      .positive()
      .optional(),
  ),

  currency: z
    .string()
    .trim()
    .max(50)
    .optional(),
}).merge(paginationQuerySchema);

const updateProductSchema = productBodySchema.partial();

module.exports = {
  createProductSchema: productBodySchema,
  updateProductSchema,
  productIdParamsSchema,
  productListQuerySchema,
};
