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

const labtestBodySchema = z.object({
  name: nullableString(255),
  labtest_type_id: nullableNumber(),
  labtest_number: nullableString(255),
  labtest_status: nullableString(50),
  labtest_date: nullableString(50),
  patient_id: nullableNumber(),
  technician_id: nullableNumber(),
  appointment_id: nullableNumber(),
  parameters: nullableString(65535),
  description: nullableString(65535),
  price: nullableNumber(),
  currency: nullableString(50),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const labtestIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const labtestListQuerySchema = z.object({
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

  patient_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  labtest_type_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  appointment_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createLabtestSchema: labtestBodySchema,
  updateLabtestSchema: labtestBodySchema,
  labtestIdParamsSchema,
  labtestListQuerySchema,
};
