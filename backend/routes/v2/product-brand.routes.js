const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productBrandController =
  require('../../controllers/product-brand.controller');

const {
  createBrandSchema,
  updateBrandSchema,
  brandIdParamsSchema,
  brandListQuerySchema,
} = require('../../validators/product-brand.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: brandListQuerySchema,
  }),
  asyncHandler(
    productBrandController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: brandIdParamsSchema,
  }),
  asyncHandler(
    productBrandController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createBrandSchema,
  }),
  asyncHandler(
    productBrandController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: brandIdParamsSchema,
    body: updateBrandSchema,
  }),
  asyncHandler(
    productBrandController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: brandIdParamsSchema,
  }),
  asyncHandler(
    productBrandController.remove,
  ),
);

module.exports = router;
