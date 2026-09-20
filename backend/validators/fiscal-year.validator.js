const { z } = require('zod');

const dateOnly = (field) =>
  z
    .string()
    .trim()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      `${field} must be YYYY-MM-DD`,
    );

/*
 * An empty string clears the note; an absent key leaves it untouched (the
 * optional wrapper short-circuits undefined before this preprocess runs, so
 * a PUT that only renames a fiscal year never wipes its note).
 */
const noteSchema = z.preprocess(
  (value) => {
    if (value === '' || value === null) {
      return null;
    }

    return value;
  },
  z
    .string()
    .trim()
    .max(65535)
    .nullable(),
);

const fiscalYearIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a numeric string'),
});

const fiscalYearListQuerySchema = z.object({
  fiscal_status: z
    .enum(['open', 'closed'])
    .optional(),

  include_deleted: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),
});

const fiscalYearResolveQuerySchema = z.object({
  date: dateOnly('date').optional(),
});

const createFiscalYearSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional(),

  start_date: dateOnly('start_date'),

  end_date: dateOnly('end_date'),

  note: noteSchema.optional(),
});

const updateFiscalYearSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional(),

    start_date: dateOnly('start_date').optional(),

    end_date: dateOnly('end_date').optional(),

    note: noteSchema.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    {
      message:
        'At least one of name, start_date, end_date or note is required.',
    },
  );

/*
 * Reopening takes an optional human reason. Every field is optional, so an
 * empty POST body (the documented way to call it) validates unchanged. The
 * reason is free text on purpose: it is written to the activity log next to
 * the reversal, not used to drive behaviour.
 */
const reopenFiscalYearSchema = z.preprocess(
  (value) => (value === undefined || value === null ? {} : value),
  z.object({
    reason: z
      .string()
      .trim()
      .max(500)
      .optional(),
  }),
);

const fiscalYearOpeningBalancesQuerySchema = z.object({
  include_inactive: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(0),

  generated: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),
});

const fiscalYearAccountStatementParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a numeric string'),

  accountId: z
    .string()
    .regex(/^\d+$/, 'accountId must be a numeric string'),
});

const fiscalYearAccountStatementQuerySchema = z.object({
  currency: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .optional(),

  page: z.coerce.number().int().min(1).optional(),

  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional(),

  offset: z.coerce.number().int().min(0).optional(),

  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),
});

module.exports = {
  fiscalYearIdParamsSchema,
  fiscalYearListQuerySchema,
  fiscalYearResolveQuerySchema,
  createFiscalYearSchema,
  updateFiscalYearSchema,
  reopenFiscalYearSchema,
  fiscalYearOpeningBalancesQuerySchema,
  fiscalYearAccountStatementParamsSchema,
  fiscalYearAccountStatementQuerySchema,
};
