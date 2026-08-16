const { z } = require('zod');

const dashboardSummaryQuerySchema = z.object({
  date_from: z.string().trim().min(1),
  date_to: z.string().trim().min(1),
  period: z
    .enum(['today', 'week', 'month', 'year', 'custom'])
    .optional(),
  granularity: z
    .enum(['hour', 'day', 'month'])
    .optional(),
  include_overview: z
    .union([z.string(), z.number(), z.boolean()])
    .optional(),
  include_metrics: z
    .union([z.string(), z.number(), z.boolean()])
    .optional(),
});

module.exports = {
  dashboardSummaryQuerySchema,
};
