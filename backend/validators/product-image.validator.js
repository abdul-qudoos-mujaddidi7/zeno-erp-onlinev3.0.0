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

const productImageBodySchema = z.object({
  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  image: nullableImageString,

  thumbnail: nullableImageString,

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const productImageIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const productImageListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  product_ids: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .default(''),

  thumbnails_only: z.coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),
}).merge(paginationQuerySchema);

module.exports = {
  createProductImageSchema: productImageBodySchema,
  updateProductImageSchema: productImageBodySchema,
  productImageIdParamsSchema,
  productImageListQuerySchema,
};
