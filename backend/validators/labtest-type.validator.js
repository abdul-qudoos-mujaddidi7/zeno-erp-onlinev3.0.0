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

const labtestTypeBodySchema = z.object({
  labtest_category_id: nullableNumber(),
  name: z
    .string({ required_error: 'Lab test type name is required.' })
    .trim()
    .min(1)
    .max(255),
  description: nullableString(65535),
  parameters: nullableString(65535),
  price: nullableNumber(),
  currency: nullableString(50),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const labtestTypeIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const labtestTypeListQuerySchema = z.object({
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

  labtest_category_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

module.exports = {
  createLabtestTypeSchema: labtestTypeBodySchema,
  updateLabtestTypeSchema: labtestTypeBodySchema,
  labtestTypeIdParamsSchema,
  labtestTypeListQuerySchema,
};
