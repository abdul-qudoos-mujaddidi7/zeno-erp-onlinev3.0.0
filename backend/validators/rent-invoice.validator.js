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

const rentInvoiceBodySchema = z.object({
  lease_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  invoice_number: nullableString(255),
  issue_date: nullableString(32),
  due_date: nullableString(32),
  billing_period_start: nullableString(32),
  billing_period_end: nullableString(32),
  base_rent: nullableNumber(),
  late_fee: nullableNumber(),
  utility_charges: nullableNumber(),
  other_charges: nullableNumber(),
  total_amount: nullableNumber(),
  paid_amount: nullableNumber(),
  currency: nullableString(50),
  invoice_status: nullableString(100),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const rentInvoiceIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const rentInvoiceListQuerySchema = z.object({
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

  lease_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  invoice_status: z
    .string()
    .trim()
    .max(100)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createRentInvoiceSchema: rentInvoiceBodySchema,
  updateRentInvoiceSchema: rentInvoiceBodySchema,
  rentInvoiceIdParamsSchema,
  rentInvoiceListQuerySchema,
};
