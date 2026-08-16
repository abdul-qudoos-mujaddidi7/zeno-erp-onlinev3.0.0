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

const workCenterBodySchema = z.object({
  code: nullableString(255),

  name: z
    .string({
      required_error: 'Work center name is required.',
    })
    .trim()
    .min(1, 'Work center name is required.')
    .max(255, 'Work center name is too long.'),

  description: nullableString(65535),
  cost_per_hour: nullableNumber(),
  cost_currency: nullableString(50),
  capacity_per_hour: nullableNumber(),
  capacity_unit_id: nullableNumber(),
  setup_time: nullableNumber(),
  setup_time_unit: nullableString(50),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const workCenterIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const workCenterListQuerySchema = z.object({
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
  createWorkCenterSchema: workCenterBodySchema,
  updateWorkCenterSchema: workCenterBodySchema,
  workCenterIdParamsSchema,
  workCenterListQuerySchema,
};
