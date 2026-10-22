const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const productionController =
  require('../../controllers/production.controller');

const {
  createProductionSchema,
  updateProductionSchema,
  productionIdParamsSchema,
  productionListQuerySchema,
  createReturnSchema,
  returnIdParamsSchema,
} = require('../../validators/production.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: productionListQuerySchema,
  }),
  asyncHandler(
    productionController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: productionIdParamsSchema,
  }),
  asyncHandler(
    productionController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createProductionSchema,
  }),
  asyncHandler(
    productionController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: productionIdParamsSchema,
    body: updateProductionSchema,
  }),
  asyncHandler(
    productionController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: productionIdParamsSchema,
  }),
  asyncHandler(
    productionController.remove,
  ),
);

router.post(
  '/:id/returns',
  validate({
    params: productionIdParamsSchema,
    body: createReturnSchema,
  }),
  asyncHandler(
    productionController.createReturn,
  ),
);

router.delete(
  '/returns/:returnId',
  validate({
    params: returnIdParamsSchema,
  }),
  asyncHandler(
    productionController.removeReturn,
  ),
);

module.exports = router;
