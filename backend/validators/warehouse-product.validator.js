const { z } = require('zod');

const {
  paginationQuerySchema,
} = require('../utils/pagination');

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

const warehouseProductBodySchema = z.object({
  warehouse_id: nullableNumber(),
  product_id: nullableNumber(),
  product_unit_id: nullableNumber(),
  quantity: nullableNumber(),
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const idParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const warehouseProductListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1),

  warehouse_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),

  product_id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
})
  /*
   * Optional page/limit/offset, shared with the other list endpoints. Omitted by
   * every existing caller, and `resolvePagination` then returns null, so the
   * endpoint keeps returning the whole (filtered) list for them. The table has
   * no text column of its own, so there is no `search` parameter here: product
   * names are searched on /products, and this endpoint is filtered by
   * warehouse_id / product_id.
   */
  .merge(paginationQuerySchema);

const updateWarehouseProductSchema =
  warehouseProductBodySchema.partial();

module.exports = {
  createWarehouseProductSchema: warehouseProductBodySchema,
  updateWarehouseProductSchema,
  warehouseProductIdParamsSchema: idParamsSchema,
  warehouseProductListQuerySchema,
};
