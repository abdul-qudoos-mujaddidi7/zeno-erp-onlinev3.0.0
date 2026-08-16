const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const stockTransactionController =
  require('../../controllers/stock-transaction.controller');

const {
  createStockTransactionSchema,
  updateStockTransactionSchema,
  stockTransactionIdParamsSchema,
  stockTransactionListQuerySchema,
} = require('../../validators/stock-transaction.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: stockTransactionListQuerySchema,
  }),
  asyncHandler(
    stockTransactionController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: stockTransactionIdParamsSchema,
  }),
  asyncHandler(
    stockTransactionController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createStockTransactionSchema,
  }),
  asyncHandler(
    stockTransactionController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: stockTransactionIdParamsSchema,
    body: updateStockTransactionSchema,
  }),
  asyncHandler(
    stockTransactionController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: stockTransactionIdParamsSchema,
  }),
  asyncHandler(
    stockTransactionController.remove,
  ),
);

module.exports = router;
