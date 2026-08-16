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

const journalBodySchema = z.object({
  date: nullableString(50),
  reference_id: nullableNumber(),
  reference_type: nullableString(50),
  description: nullableString(65535),
  currency: nullableString(50),
  first_entry_account: nullableNumber(),
  first_entry_debit: nullableNumber(),
  first_entry_credit: nullableNumber(),
  second_entry_account: nullableNumber(),
  second_entry_debit: nullableNumber(),
  second_entry_credit: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const createJournalSchema = journalBodySchema;

const updateJournalSchema = journalBodySchema.partial();

const journalIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a numeric string'),
});

const journalListQuerySchema = z.object({
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
  reference_id: z
    .coerce
    .number()
    .optional(),
  reference_type: z
    .string()
    .trim()
    .max(50)
    .optional(),

  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),

  exclude_system_accounts: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  exclude_report_accounts: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  include_summary: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

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
  createJournalSchema,
  updateJournalSchema,
  journalIdParamsSchema,
  journalListQuerySchema,
};
