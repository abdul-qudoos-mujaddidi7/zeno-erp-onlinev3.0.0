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

const meterReadingBodySchema = z.object({
  meter_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  reading_date: nullableString(32),
  previous_reading: nullableNumber(),
  current_reading: nullableNumber(),
  consumption: nullableNumber(),
  rate_per_unit: nullableNumber(),
  calculated_amount: nullableNumber(),
  currency: nullableString(50),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const meterReadingIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const meterReadingListQuerySchema = z.object({
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

  meter_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createMeterReadingSchema: meterReadingBodySchema,
  updateMeterReadingSchema: meterReadingBodySchema,
  meterReadingIdParamsSchema,
  meterReadingListQuerySchema,
};
