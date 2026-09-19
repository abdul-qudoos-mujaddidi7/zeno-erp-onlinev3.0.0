const { z } = require('zod');

const reconciliationQuerySchema = z.object({
  sections: z
    .string()
    .trim()
    .optional(),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional(),
  scan_limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(20000)
    .optional(),
  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .optional(),
});

module.exports = {
  reconciliationQuerySchema,
};
