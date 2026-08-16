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

const departmentBodySchema = z.object({
  name: z
    .string({
      required_error: 'Department name is required.',
    })
    .trim()
    .min(1, 'Department name is required.')
    .max(255, 'Department name is too long.'),

  description: nullableString(65535),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const departmentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const departmentListQuerySchema = z.object({
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
  createDepartmentSchema: departmentBodySchema,
  updateDepartmentSchema: departmentBodySchema,
  departmentIdParamsSchema,
  departmentListQuerySchema,
};
