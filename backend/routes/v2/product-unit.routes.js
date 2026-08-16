const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productUnitController =
  require('../../controllers/product-unit.controller');

const {
  createProductUnitSchema,
  updateProductUnitSchema,
  productUnitIdParamsSchema,
  productUnitListQuerySchema,
} = require('../../validators/product-unit.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: productUnitListQuerySchema,
  }),
  asyncHandler(
    productUnitController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: productUnitIdParamsSchema,
  }),
  asyncHandler(
    productUnitController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createProductUnitSchema,
  }),
  asyncHandler(
    productUnitController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: productUnitIdParamsSchema,
    body: updateProductUnitSchema,
  }),
  asyncHandler(
    productUnitController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: productUnitIdParamsSchema,
  }),
  asyncHandler(
    productUnitController.remove,
  ),
);

module.exports = router;
