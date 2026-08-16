const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const warehouseProductController =
  require('../../controllers/warehouse-product.controller');

const {
  createWarehouseProductSchema,
  updateWarehouseProductSchema,
  warehouseProductIdParamsSchema,
  warehouseProductListQuerySchema,
} = require('../../validators/warehouse-product.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: warehouseProductListQuerySchema,
  }),
  asyncHandler(
    warehouseProductController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: warehouseProductIdParamsSchema,
  }),
  asyncHandler(
    warehouseProductController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createWarehouseProductSchema,
  }),
  asyncHandler(
    warehouseProductController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: warehouseProductIdParamsSchema,
    body: updateWarehouseProductSchema,
  }),
  asyncHandler(
    warehouseProductController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: warehouseProductIdParamsSchema,
  }),
  asyncHandler(
    warehouseProductController.remove,
  ),
);

module.exports = router;
