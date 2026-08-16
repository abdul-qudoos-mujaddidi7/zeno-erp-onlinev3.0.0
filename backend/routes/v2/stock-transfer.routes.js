const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const stockTransferController =
  require('../../controllers/stock-transfer.controller');

const {
  createStockTransferSchema,
  updateStockTransferSchema,
  stockTransferIdParamsSchema,
  stockTransferListQuerySchema,
} = require('../../validators/stock-transfer.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: stockTransferListQuerySchema,
  }),
  asyncHandler(
    stockTransferController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: stockTransferIdParamsSchema,
  }),
  asyncHandler(
    stockTransferController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createStockTransferSchema,
  }),
  asyncHandler(
    stockTransferController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: stockTransferIdParamsSchema,
    body: updateStockTransferSchema,
  }),
  asyncHandler(
    stockTransferController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: stockTransferIdParamsSchema,
  }),
  asyncHandler(
    stockTransferController.remove,
  ),
);

module.exports = router;
