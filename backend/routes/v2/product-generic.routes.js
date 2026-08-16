const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productGenericController =
  require('../../controllers/product-generic.controller');

const {
  createGenericSchema,
  updateGenericSchema,
  genericIdParamsSchema,
  genericListQuerySchema,
} = require('../../validators/product-generic.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: genericListQuerySchema,
  }),
  asyncHandler(
    productGenericController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: genericIdParamsSchema,
  }),
  asyncHandler(
    productGenericController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createGenericSchema,
  }),
  asyncHandler(
    productGenericController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: genericIdParamsSchema,
    body: updateGenericSchema,
  }),
  asyncHandler(
    productGenericController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: genericIdParamsSchema,
  }),
  asyncHandler(
    productGenericController.remove,
  ),
);

module.exports = router;
