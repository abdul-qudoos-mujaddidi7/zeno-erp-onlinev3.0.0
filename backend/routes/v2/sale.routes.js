const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const saleController =
  require('../../controllers/sale.controller');

const {
  createSaleSchema,
  updateSaleSchema,
  saleIdParamsSchema,
  saleListQuerySchema,
  nextInvoiceNumberQuerySchema,
  createPaymentSchema,
  paymentIdParamsSchema,
  createReturnSchema,
  returnIdParamsSchema,
} = require('../../validators/sale.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: saleListQuerySchema,
  }),
  asyncHandler(
    saleController.list,
  ),
);

/*
 * Registered before '/:id' so "next-number" is not parsed as a sale id.
 */
router.get(
  '/next-number',
  validate({
    query: nextInvoiceNumberQuerySchema,
  }),
  asyncHandler(
    saleController.nextNumber,
  ),
);

router.get(
  '/:id',
  validate({
    params: saleIdParamsSchema,
  }),
  asyncHandler(
    saleController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createSaleSchema,
  }),
  asyncHandler(
    saleController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: saleIdParamsSchema,
    body: updateSaleSchema,
  }),
  asyncHandler(
    saleController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: saleIdParamsSchema,
  }),
  asyncHandler(
    saleController.remove,
  ),
);

router.post(
  '/:id/payments',
  validate({
    params: saleIdParamsSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(
    saleController.addPayment,
  ),
);

router.delete(
  '/payments/:paymentId',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    saleController.removePayment,
  ),
);

router.post(
  '/:id/returns',
  validate({
    params: saleIdParamsSchema,
    body: createReturnSchema,
  }),
  asyncHandler(
    saleController.createReturn,
  ),
);

router.delete(
  '/returns/:returnId',
  validate({
    params: returnIdParamsSchema,
  }),
  asyncHandler(
    saleController.removeReturn,
  ),
);

module.exports = router;
