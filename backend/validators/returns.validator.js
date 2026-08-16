const { z } = require('zod');
const {
  paginationQuerySchema,
} = require('../utils/pagination');

const returnsListQuerySchema = z.object({
  return_type: z
    .enum(['all', 'sale', 'purchase'])
    .optional()
    .default('all'),

  account_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),

  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .default(''),

  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD')
    .optional(),

  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD')
    .optional(),

  skip_count: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),
}).merge(paginationQuerySchema);

module.exports = {
  returnsListQuerySchema,
};
