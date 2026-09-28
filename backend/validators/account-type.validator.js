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

const accountTypeFields = {
  name: z
    .string({
      required_error: 'Account type name is required.',
    })
    .trim()
    .min(1, 'Account type name is required.')
    .max(255, 'Account type name is too long.'),

  name_fa: nullableString(255),

  name_ps: nullableString(255),

  description: nullableString(65535),

  code: nullableString(50),

  can_be_customer: z.coerce.number().int().min(0).max(1).default(0),

  can_be_supplier: z.coerce.number().int().min(0).max(1).default(0),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1),
};

const createAccountTypeSchema = z.object({
  ...accountTypeFields,
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const updateAccountTypeSchema = z
  .object(accountTypeFields)
  .partial();

const accountTypeIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const accountTypeListQuerySchema = z.object({
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
  createAccountTypeSchema,
  updateAccountTypeSchema,
  accountTypeIdParamsSchema,
  accountTypeListQuerySchema,
};
