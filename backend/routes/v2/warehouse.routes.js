const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const warehouseController =
  require('../../controllers/warehouse.controller');

const {
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseIdParamsSchema,
  warehouseListQuerySchema,
} = require('../../validators/warehouse.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: warehouseListQuerySchema,
  }),
  asyncHandler(
    warehouseController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: warehouseIdParamsSchema,
  }),
  asyncHandler(
    warehouseController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createWarehouseSchema,
  }),
  asyncHandler(
    warehouseController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: warehouseIdParamsSchema,
    body: updateWarehouseSchema,
  }),
  asyncHandler(
    warehouseController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: warehouseIdParamsSchema,
  }),
  asyncHandler(
    warehouseController.remove,
  ),
);

module.exports = router;
