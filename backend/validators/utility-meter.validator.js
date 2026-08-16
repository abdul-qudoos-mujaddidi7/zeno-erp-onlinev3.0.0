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

const utilityMeterBodySchema = z.object({
  apartment_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  meter_number: z
    .string({ required_error: 'Meter number is required.' })
    .trim()
    .min(1, 'Meter number is required.')
    .max(255),

  utility_type: nullableString(100),
  initial_reading: nullableNumber(),
  current_reading: nullableNumber(),
  installation_date: nullableString(32),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const utilityMeterIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const utilityMeterListQuerySchema = z.object({
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
}).merge(paginationQuerySchema);

module.exports = {
  createUtilityMeterSchema: utilityMeterBodySchema,
  updateUtilityMeterSchema: utilityMeterBodySchema,
  utilityMeterIdParamsSchema,
  utilityMeterListQuerySchema,
};
