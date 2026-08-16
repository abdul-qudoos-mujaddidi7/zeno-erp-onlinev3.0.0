const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const inventoryRecordController =
  require('../../controllers/inventory-record.controller');

const {
  createInventoryRecordSchema,
  updateInventoryRecordSchema,
  inventoryRecordIdParamsSchema,
  inventoryRecordListQuerySchema,
  createPaymentSchema,
  paymentParamsSchema,
  createReturnSchema,
  returnParamsSchema,
} = require('../../validators/inventory-record.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: inventoryRecordListQuerySchema,
  }),
  asyncHandler(
    inventoryRecordController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: inventoryRecordIdParamsSchema,
  }),
  asyncHandler(
    inventoryRecordController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createInventoryRecordSchema,
  }),
  asyncHandler(
    inventoryRecordController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: inventoryRecordIdParamsSchema,
    body: updateInventoryRecordSchema,
  }),
  asyncHandler(
    inventoryRecordController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: inventoryRecordIdParamsSchema,
  }),
  asyncHandler(
    inventoryRecordController.remove,
  ),
);

router.post(
  '/:id/payments',
  validate({
    params: inventoryRecordIdParamsSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(
    inventoryRecordController.addPayment,
  ),
);

router.delete(
  '/:id/payments/:paymentId',
  validate({
    params: paymentParamsSchema,
  }),
  asyncHandler(
    inventoryRecordController.removePayment,
  ),
);

router.post(
  '/:id/returns',
  validate({
    params: inventoryRecordIdParamsSchema,
    body: createReturnSchema,
  }),
  asyncHandler(
    inventoryRecordController.createReturn,
  ),
);

router.delete(
  '/:id/returns/:returnId',
  validate({
    params: returnParamsSchema,
  }),
  asyncHandler(
    inventoryRecordController.removeReturn,
  ),
);

module.exports = router;
