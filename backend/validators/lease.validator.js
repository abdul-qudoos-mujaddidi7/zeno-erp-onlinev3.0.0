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

const nullableInt = () =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? Math.trunc(number) : null;
    },
    z
      .number()
      .int()
      .nullable(),
  );

const nullableId = () =>
  z.preprocess(
    (value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      const number = Number(value);

      return Number.isFinite(number) ? Math.trunc(number) : null;
    },
    z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
  );

const leaseBodySchema = z.object({
  apartment_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  tenant_account_id: nullableId(),
  lease_number: nullableString(255),
  lease_type: nullableString(100),
  start_date: nullableString(32),
  end_date: nullableString(32),
  monthly_rent: nullableNumber(),
  deposit_amount: nullableNumber(),
  currency: nullableString(50),
  payment_cycle: nullableString(100),
  auto_renew: nullableInt(),
  grace_period_days: nullableInt(),
  late_fee_percent: nullableNumber(),
  terms_conditions: nullableString(65535),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const leaseIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const leaseListQuerySchema = z.object({
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

  apartment_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  tenant_account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createLeaseSchema: leaseBodySchema,
  updateLeaseSchema: leaseBodySchema,
  leaseIdParamsSchema,
  leaseListQuerySchema,
};
