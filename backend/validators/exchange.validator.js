const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

const nullableString = (maxLength) =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
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

const nullableNumber = () =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? number : null;
    },
    z
      .number()
      .nullable(),
  );

const exchangeBodySchema = z.object({
  date: nullableString(50),
  reference_id: nullableNumber(),
  reference_type: nullableString(50),
  description: nullableString(65535),
  first_currency: nullableString(50),
  first_entry_account: nullableNumber(),
  first_entry_debit: nullableNumber(),
  first_entry_credit: nullableNumber(),
  second_currency: nullableString(50),
  second_entry_account: nullableNumber(),
  second_entry_debit: nullableNumber(),
  second_entry_credit: nullableNumber(),
  multiple: z
    .preprocess(
      (value) => {
        if (value === undefined || value === null || value === '') {
          return null;
        }

        return value;
      },
      z.union([
        z.string().max(50),
        z.boolean(),
        z.number(),
      ]).nullable(),
    ),
  rate: nullableNumber(),
  system_rate: nullableNumber(),
  benefit_amount: nullableNumber(),
  benefit_currency: nullableString(50),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const createExchangeSchema = exchangeBodySchema;

const updateExchangeSchema = exchangeBodySchema.partial();

const exchangeIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a numeric string'),
});

const exchangeListQuerySchema = z.object({
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
    .optional(),
  reference_type: z
    .string()
    .trim()
    .max(50)
    .optional(),
  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),
  exclude_system_accounts: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),
  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),
}).merge(paginationQuerySchema);

module.exports = {
  createExchangeSchema,
  updateExchangeSchema,
  exchangeIdParamsSchema,
  exchangeListQuerySchema,
};
