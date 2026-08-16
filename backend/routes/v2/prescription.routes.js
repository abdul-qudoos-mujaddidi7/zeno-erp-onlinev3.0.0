const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const prescriptionController =
  require('../../controllers/prescription.controller');

const {
  createPrescriptionSchema,
  updatePrescriptionSchema,
  prescriptionIdParamsSchema,
  prescriptionListQuerySchema,
  createPaymentSchema,
  paymentParamsSchema,
  createReturnSchema,
  returnParamsSchema,
} = require('../../validators/prescription.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: prescriptionListQuerySchema,
  }),
  asyncHandler(
    prescriptionController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: prescriptionIdParamsSchema,
  }),
  asyncHandler(
    prescriptionController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPrescriptionSchema,
  }),
  asyncHandler(
    prescriptionController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: prescriptionIdParamsSchema,
    body: updatePrescriptionSchema,
  }),
  asyncHandler(
    prescriptionController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: prescriptionIdParamsSchema,
  }),
  asyncHandler(
    prescriptionController.remove,
  ),
);

router.post(
  '/:id/payments',
  validate({
    params: prescriptionIdParamsSchema,
    body: createPaymentSchema,
  }),
  asyncHandler(
    prescriptionController.addPayment,
  ),
);

router.delete(
  '/:id/payments/:paymentId',
  validate({
    params: paymentParamsSchema,
  }),
  asyncHandler(
    prescriptionController.removePayment,
  ),
);

router.post(
  '/:id/returns',
  validate({
    params: prescriptionIdParamsSchema,
    body: createReturnSchema,
  }),
  asyncHandler(
    prescriptionController.createReturn,
  ),
);

router.delete(
  '/:id/returns/:returnId',
  validate({
    params: returnParamsSchema,
  }),
  asyncHandler(
    prescriptionController.removeReturn,
  ),
);

module.exports = router;
