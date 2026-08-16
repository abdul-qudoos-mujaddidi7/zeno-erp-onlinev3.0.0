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

const accountGroupBodySchema = z.object({
  name: z
    .string({
      required_error: 'Account group name is required.',
    })
    .trim()
    .min(1, 'Account group name is required.')
    .max(255, 'Account group name is too long.'),

  code: nullableString(50),

  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const accountGroupIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const accountGroupListQuerySchema = z.object({
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
  createAccountGroupSchema: accountGroupBodySchema,
  updateAccountGroupSchema: accountGroupBodySchema,
  accountGroupIdParamsSchema,
  accountGroupListQuerySchema,
};
