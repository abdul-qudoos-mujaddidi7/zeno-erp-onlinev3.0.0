const { z } = require('zod');

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

const userImageBodySchema = z.object({
  user_id: z
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

const userImageIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const userImageListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  user_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

module.exports = {
  createUserImageSchema: userImageBodySchema,
  updateUserImageSchema: userImageBodySchema,
  userImageIdParamsSchema,
  userImageListQuerySchema,
};
