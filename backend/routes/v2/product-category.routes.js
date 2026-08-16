const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productCategoryController =
  require('../../controllers/product-category.controller');

const {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamsSchema,
  categoryListQuerySchema,
} = require('../../validators/product-category.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: categoryListQuerySchema,
  }),
  asyncHandler(
    productCategoryController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: categoryIdParamsSchema,
  }),
  asyncHandler(
    productCategoryController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createCategorySchema,
  }),
  asyncHandler(
    productCategoryController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: categoryIdParamsSchema,
    body: updateCategorySchema,
  }),
  asyncHandler(
    productCategoryController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: categoryIdParamsSchema,
  }),
  asyncHandler(
    productCategoryController.remove,
  ),
);

module.exports = router;