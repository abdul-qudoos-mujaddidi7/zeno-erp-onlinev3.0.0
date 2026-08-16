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

const userRoleBodySchema = z.object({
  name: z
    .string({
      required_error: 'Role name is required.',
    })
    .trim()
    .min(1, 'Role name is required.')
    .max(255, 'Role name is too long.'),

  description: nullableString(65535),

  permissions: nullableString(16 * 1024 * 1024),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const userRoleIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const userRoleListQuerySchema = z.object({
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
  createUserRoleSchema: userRoleBodySchema,
  updateUserRoleSchema: userRoleBodySchema,
  userRoleIdParamsSchema,
  userRoleListQuerySchema,
};
