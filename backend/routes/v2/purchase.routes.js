const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const purchaseController =
  require('../../controllers/purchase.controller');

const {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseIdParamsSchema,
  purchaseListQuerySchema,
  createPaymentSchema,
  paymentIdParamsSchema,
  createReturnSchema,
  returnIdParamsSchema,
} = require('../../validators/purchase.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: purchaseListQuerySchema,
  }),
  asyncHandler(
    purchaseController.list,
  ),
);

/*
 * Registered before '/:id' so "next-number" is not parsed as a purchase id.
 */
router.get(
  '/next-number',
  asyncHandler(
    purchaseController.nextNumber,
  ),
);

router.get(
  '/:id',
  validate({
    params: purchaseIdParamsSchema,
  }),
  asyncHandler(
    purchaseController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPurchaseSchema,
  }),
  asyncHandler(
    purchaseController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: purchaseIdParamsSchema,
    body: updatePurchaseSchema,
  }),
  asyncHandler(
    purchaseController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: purchaseIdParamsSchema,
  }),
  asyncHandler(
    purchaseController.remove,
  ),
);

router.post(
  '/:id/payments',
  validate({
    params: purchaseIdParamsSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(
    purchaseController.addPayment,
  ),
);

router.delete(
  '/payments/:paymentId',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    purchaseController.removePayment,
  ),
);

router.post(
  '/:id/returns',
  validate({
    params: purchaseIdParamsSchema,
    body: createReturnSchema,
  }),
  asyncHandler(
    purchaseController.createReturn,
  ),
);

router.delete(
  '/returns/:returnId',
  validate({
    params: returnIdParamsSchema,
  }),
  asyncHandler(
    purchaseController.removeReturn,
  ),
);

module.exports = router;
