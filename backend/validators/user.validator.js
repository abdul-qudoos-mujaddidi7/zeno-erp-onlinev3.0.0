const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

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

const nullableNumber = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) {
      return null;
    }

    const number = Number(value);

    return Number.isNaN(number) ? null : number;
  },
  z.number().nullable(),
);

const userBodySchema = z.object({
  username: z
    .string({
      required_error: 'Username is required.',
    })
    .trim()
    .min(1, 'Username is required.')
    .max(255, 'Username is too long.'),

  email: nullableString(255),

  first_name: z
    .string({
      required_error: 'First name is required.',
    })
    .trim()
    .min(1, 'First name is required.')
    .max(255, 'First name is too long.'),

  last_name: nullableString(255),

  phone: nullableString(50),

  address: nullableString(65535),

  description: nullableString(65535),

  role_id: nullableNumber,

  department_id: nullableNumber,

  permissions: nullableString(65535),

  language: nullableString(10),

  theme: nullableString(20),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const createUserSchema = userBodySchema.extend({
  password: z
    .string({
      required_error: 'Password is required.',
    })
    .min(8, 'Password must be at least 8 characters long.')
    .max(255, 'Password is too long.'),
});

const updateUserSchema = userBodySchema
  .partial()
  .extend({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.')
      .max(255, 'Password is too long.')
      .optional(),
  });

const userIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const userListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  role_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  department_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createUserSchema,
  updateUserSchema,
  userIdParamsSchema,
  userListQuerySchema,
};
