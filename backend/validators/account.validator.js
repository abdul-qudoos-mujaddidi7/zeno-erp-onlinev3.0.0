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

const additionalInitialBalanceSchema = z.object({
  balance: z.coerce.number().default(0),
  type: z.enum(['Debit', 'Credit']).default('Debit'),
  currency: nullableString(50),
});

/*
 * OPTIONAL accounting date for the initial-balance journals. Omitting it keeps
 * the previous behaviour, so existing callers are unaffected.
 *
 * Only the calendar day is accepted. A full timestamp would let a client push
 * an opening balance into a different day (and fiscal year) through its own
 * timezone, which is the exact failure this field exists to prevent.
 */
const effectiveDate = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) {
      return undefined;
    }

    return value;
  },
  z
    .string()
    .trim()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      'effective_date must be YYYY-MM-DD',
    )
    .optional(),
);

const accountFields = {
  name: z
    .string({
      required_error: 'Account name is required.',
    })
    .trim()
    .min(1, 'Account name is required.')
    .max(255, 'Account name is too long.'),

  code: nullableString(50),

  account_type_id: nullableNumber,

  account_group_id: nullableNumber,

  account_status: nullableString(50),

  main_acc: nullableString(255),

  name_fa: nullableString(255),

  name_ps: nullableString(255),

  currency: nullableString(50),

  balance: nullableNumber,

  percentage: nullableNumber,

  description: nullableString(65535),

  phone: nullableString(30),

  phone2: nullableString(30),

  email: nullableString(255),

  address: nullableString(65535),

  nid: nullableString(255),

  patient_type_id: nullableNumber,

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1),

  initial_balance_type: z.enum(['Debit', 'Credit']),

  additional_initial_balances: z.array(
    additionalInitialBalanceSchema,
  ),
};

const createAccountSchema = z.object({
  ...accountFields,
  account_status: nullableString(50).default('active'),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
  initial_balance_type: z
    .enum(['Debit', 'Credit'])
    .optional()
    .default('Debit'),
  additional_initial_balances: z
    .array(additionalInitialBalanceSchema)
    .optional()
    .default([]),
  effective_date: effectiveDate,
});

const updateAccountSchema = z
  .object(accountFields)
  .partial();

const accountIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const accountListQuerySchema = z.object({
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

  code: z
    .string()
    .trim()
    .max(50)
    .optional(),

  account_type_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  role: z.enum(['customer', 'supplier']).optional(),

  account_group_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  patient_type_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  account_status: z
    .string()
    .trim()
    .max(50)
    .optional(),

  exclude_system: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  ids: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .default(''),
}).merge(paginationQuerySchema);

const accountBalancesQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  account_ids: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .default(''),
});

const accountProductItemsQuerySchema = z.object({
  item_type: z
    .enum(['all', 'sale', 'purchase'])
    .optional()
    .default('all'),

  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),

  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),
}).merge(paginationQuerySchema);

module.exports = {
  createAccountSchema,
  updateAccountSchema,
  accountIdParamsSchema,
  accountListQuerySchema,
  accountBalancesQuerySchema,
  accountProductItemsQuerySchema,
};
