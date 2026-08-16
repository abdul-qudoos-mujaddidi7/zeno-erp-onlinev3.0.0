const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productController =
  require('../../controllers/product.controller');

const {
  createProductSchema,
  updateProductSchema,
  productIdParamsSchema,
  productListQuerySchema,
} = require('../../validators/product.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: productListQuerySchema,
  }),
  asyncHandler(
    productController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: productIdParamsSchema,
  }),
  asyncHandler(
    productController.getById,
  ),
);

router.post(
  '/:id/reconcile-stock',
  validate({
    params: productIdParamsSchema,
  }),
  asyncHandler(
    productController.reconcileStock,
  ),
);

router.post(
  '/',
  validate({
    body: createProductSchema,
  }),
  asyncHandler(
    productController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: productIdParamsSchema,
    body: updateProductSchema,
  }),
  asyncHandler(
    productController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: productIdParamsSchema,
  }),
  asyncHandler(
    productController.remove,
  ),
);

module.exports = router;
