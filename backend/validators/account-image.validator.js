const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

const nullableImageString = z.preprocess(
  (value) => {
    if (value === '' || value === undefined) {
      return null;
    }

    return value;
  },
  z
    .string()
    .max(20 * 1024 * 1024, 'Image data is too large.')
    .nullable(),
);

const accountImageBodySchema = z.object({
  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),

  image: nullableImageString,

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const accountImageIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const accountImageListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  account_ids: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .default(''),
}).merge(paginationQuerySchema);

module.exports = {
  createAccountImageSchema: accountImageBodySchema,
  updateAccountImageSchema: accountImageBodySchema,
  accountImageIdParamsSchema,
  accountImageListQuerySchema,
};
