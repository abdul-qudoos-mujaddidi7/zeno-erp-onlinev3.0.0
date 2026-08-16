const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productImageController =
  require('../../controllers/product-image.controller');

const {
  createProductImageSchema,
  updateProductImageSchema,
  productImageIdParamsSchema,
  productImageListQuerySchema,
} = require('../../validators/product-image.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: productImageListQuerySchema,
  }),
  asyncHandler(
    productImageController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: productImageIdParamsSchema,
  }),
  asyncHandler(
    productImageController.getById,
  ),
);

router.post(
  '/replace',
  validate({
    body: createProductImageSchema,
  }),
  asyncHandler(
    productImageController.replace,
  ),
);

router.post(
  '/',
  validate({
    body: createProductImageSchema,
  }),
  asyncHandler(
    productImageController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: productImageIdParamsSchema,
    body: updateProductImageSchema,
  }),
  asyncHandler(
    productImageController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: productImageIdParamsSchema,
  }),
  asyncHandler(
    productImageController.remove,
  ),
);

module.exports = router;
