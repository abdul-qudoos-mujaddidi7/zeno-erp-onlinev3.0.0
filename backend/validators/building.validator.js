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

const buildingBodySchema = z.object({
  name: z
    .string({ required_error: 'Building name is required.' })
    .trim()
    .min(1, 'Building name is required.')
    .max(255),

  code: z
    .string({ required_error: 'Building code is required.' })
    .trim()
    .min(1, 'Building code is required.')
    .max(255),

  address: nullableString(500),
  total_floors: nullableInt(),
  total_units: nullableInt(),
  building_type: nullableString(100),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const buildingIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const buildingListQuerySchema = z.object({
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
}).merge(paginationQuerySchema);

module.exports = {
  createBuildingSchema: buildingBodySchema,
  updateBuildingSchema: buildingBodySchema,
  buildingIdParamsSchema,
  buildingListQuerySchema,
};
