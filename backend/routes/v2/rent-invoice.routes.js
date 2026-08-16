const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const rentInvoiceController =
  require('../../controllers/rent-invoice.controller');

const {
  createRentInvoiceSchema,
  updateRentInvoiceSchema,
  rentInvoiceIdParamsSchema,
  rentInvoiceListQuerySchema,
} = require('../../validators/rent-invoice.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: rentInvoiceListQuerySchema,
  }),
  asyncHandler(
    rentInvoiceController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: rentInvoiceIdParamsSchema,
  }),
  asyncHandler(
    rentInvoiceController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createRentInvoiceSchema,
  }),
  asyncHandler(
    rentInvoiceController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: rentInvoiceIdParamsSchema,
    body: updateRentInvoiceSchema,
  }),
  asyncHandler(
    rentInvoiceController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: rentInvoiceIdParamsSchema,
  }),
  asyncHandler(
    rentInvoiceController.remove,
  ),
);

module.exports = router;
