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

const documentBodySchema = z.object({
  name: nullableString(255),
  description: nullableString(65535),
  reference_type: nullableString(100),
  reference_id: nullableNumber(),
  file_type: nullableString(100),
  file_size: nullableNumber(),
  file: z.preprocess(
    (value) => {
      if (value === '' || value === undefined) return null;
      return value;
    },
    z.string().max(20 * 1024 * 1024, 'File data is too large.').nullable(),
  ),
  thumbnail: z.preprocess(
    (value) => {
      if (value === '' || value === undefined) return null;
      return value;
    },
    z.string().max(5 * 1024 * 1024, 'Thumbnail data is too large.').nullable(),
  ),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const documentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const documentListQuerySchema = z.object({
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

  reference_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  reference_type: z
    .string()
    .trim()
    .max(100)
    .optional(),
}).merge(paginationQuerySchema);

module.exports = {
  createDocumentSchema: documentBodySchema,
  updateDocumentSchema: documentBodySchema,
  documentIdParamsSchema,
  documentListQuerySchema,
};
