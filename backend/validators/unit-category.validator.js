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

/* `code` is deliberately absent: the name is what identifies a category. */
const unitCategoryBodySchema = z.object({
  name: z
    .string({
      required_error: 'Unit category name is required.',
    })
    .trim()
    .min(1, 'Unit category name is required.')
    .max(120, 'Unit category name is too long.'),

  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const unitCategoryIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const unitCategoryListQuerySchema = z.object({
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
  createUnitCategorySchema: unitCategoryBodySchema,
  updateUnitCategorySchema: unitCategoryBodySchema,
  unitCategoryIdParamsSchema,
  unitCategoryListQuerySchema,
};
