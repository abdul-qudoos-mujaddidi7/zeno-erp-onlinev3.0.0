const { z } = require('zod');

const nullableTrimmedString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return null;
      }

      const normalized = String(value).trim();

      return normalized || null;
    },
    z.string().max(maxLength).nullable(),
  );

const brandBodySchema = z.object({
  name: z
    .string({
      required_error: 'Brand name is required.',
    })
    .trim()
    .min(1, 'Brand name is required.')
    .max(255, 'Brand name cannot exceed 255 characters.'),

  code: nullableTrimmedString(50),

  description: nullableTrimmedString(65535),

  status: z.coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const createBrandSchema = brandBodySchema;

const updateBrandSchema = brandBodySchema;

const brandIdParamsSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .max(
      Number.MAX_SAFE_INTEGER,
      'Brand ID is too large.',
    ),
});

const brandListQuerySchema = z.object({
  status: z.coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  search: z
    .string()
    .trim()
    .max(255)
    .default(''),
});

module.exports = {
  createBrandSchema,
  updateBrandSchema,
  brandIdParamsSchema,
  brandListQuerySchema,
};
