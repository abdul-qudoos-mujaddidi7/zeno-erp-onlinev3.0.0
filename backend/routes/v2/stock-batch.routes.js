const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const stockBatchController =
  require('../../controllers/stock-batch.controller');

const {
  createStockBatchSchema,
  updateStockBatchSchema,
  stockBatchIdParamsSchema,
  stockBatchListQuerySchema,
} = require('../../validators/stock-batch.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: stockBatchListQuerySchema,
  }),
  asyncHandler(
    stockBatchController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: stockBatchIdParamsSchema,
  }),
  asyncHandler(
    stockBatchController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createStockBatchSchema,
  }),
  asyncHandler(
    stockBatchController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: stockBatchIdParamsSchema,
    body: updateStockBatchSchema,
  }),
  asyncHandler(
    stockBatchController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: stockBatchIdParamsSchema,
  }),
  asyncHandler(
    stockBatchController.remove,
  ),
);

module.exports = router;
