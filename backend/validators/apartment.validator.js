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

const apartmentBodySchema = z.object({
  building_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),

  floor_id: nullableId(),

  unit_number: z
    .string({ required_error: 'Unit number is required.' })
    .trim()
    .min(1, 'Unit number is required.')
    .max(100),

  area_sqm: nullableNumber(),
  bedrooms: nullableInt(),
  bathrooms: nullableInt(),
  unit_type: nullableString(100),
  rent_amount: nullableNumber(),
  sale_price: nullableNumber(),
  currency: nullableString(50),
  occupancy_status: nullableString(100),
  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const apartmentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const apartmentListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),

  building_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  floor_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),
}).merge(paginationQuerySchema);

module.exports = {
  createApartmentSchema: apartmentBodySchema,
  updateApartmentSchema: apartmentBodySchema,
  apartmentIdParamsSchema,
  apartmentListQuerySchema,
};
