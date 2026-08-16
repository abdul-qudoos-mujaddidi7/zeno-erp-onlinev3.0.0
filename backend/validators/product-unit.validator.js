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

const productUnitBodySchema = z.object({
  name: z
    .string({
      required_error: 'Unit name is required.',
    })
    .trim()
    .min(1, 'Unit name is required.')
    .max(255, 'Unit name is too long.'),

  code: nullableString(50),

  description: nullableString(65535),

  subunit_id: nullableNumber(),

  subunit_multiple: nullableNumber(),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const productUnitIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const productUnitListQuerySchema = z.object({
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
    .optional(),
});

module.exports = {
  createProductUnitSchema: productUnitBodySchema,
  updateProductUnitSchema: productUnitBodySchema,
  productUnitIdParamsSchema,
  productUnitListQuerySchema,
};
