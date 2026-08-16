const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const paymentController =
  require('../../controllers/purchase-payment.controller');

const {
  createPaymentSchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  paymentListQuerySchema,
} = require('../../validators/purchase-payment.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: paymentListQuerySchema,
  }),
  asyncHandler(
    paymentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    paymentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPaymentSchema,
  }),
  asyncHandler(
    paymentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
    body: updatePaymentSchema,
  }),
  asyncHandler(
    paymentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    paymentController.remove,
  ),
);

module.exports = router;
