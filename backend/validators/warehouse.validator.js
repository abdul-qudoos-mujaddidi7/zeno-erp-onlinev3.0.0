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

const warehouseBodySchema = z.object({
  name: z
    .string({
      required_error: 'Warehouse name is required.',
    })
    .trim()
    .min(1, 'Warehouse name is required.')
    .max(255, 'Warehouse name is too long.'),

  location: nullableString(255),

  description: nullableString(65535),

  manager_name: nullableString(255),

  isDefault: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(0),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const warehouseIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const warehouseListQuerySchema = z.object({
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
});

module.exports = {
  createWarehouseSchema: warehouseBodySchema,
  updateWarehouseSchema: warehouseBodySchema,
  warehouseIdParamsSchema,
  warehouseListQuerySchema,
};
