const { z } = require('zod');

const positiveId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const createStockAdjustmentSchema = z.object({
  product_id: positiveId,
  warehouse_id: positiveId,
  adjustment_type: z.enum(['increase', 'decrease']),
  // Qty is deliberately unsigned. The service alone determines its effect.
  qty: z.coerce.number().finite().positive().max(999999999999.999),
  reason: z.string().trim().min(1, 'Reason is required.').max(255),
  note: z.preprocess((value) => value === '' || value == null ? null : value,
    z.string().trim().max(65535).nullable()),
});

const listStockAdjustmentsSchema = z.object({
  product_id: positiveId.optional(),
  warehouse_id: positiveId.optional(),
  adjustment_type: z.enum(['increase', 'decrease']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional(),
});

const stockAdjustmentIdParamsSchema = z.object({ id: positiveId });

module.exports = { createStockAdjustmentSchema, listStockAdjustmentsSchema, stockAdjustmentIdParamsSchema };
