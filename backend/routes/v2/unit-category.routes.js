const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const unitCategoryController =
  require('../../controllers/unit-category.controller');

const {
  createUnitCategorySchema,
  updateUnitCategorySchema,
  unitCategoryIdParamsSchema,
  unitCategoryListQuerySchema,
} = require('../../validators/unit-category.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: unitCategoryListQuerySchema,
  }),
  asyncHandler(
    unitCategoryController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: unitCategoryIdParamsSchema,
  }),
  asyncHandler(
    unitCategoryController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createUnitCategorySchema,
  }),
  asyncHandler(
    unitCategoryController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: unitCategoryIdParamsSchema,
    body: updateUnitCategorySchema,
  }),
  asyncHandler(
    unitCategoryController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: unitCategoryIdParamsSchema,
  }),
  asyncHandler(
    unitCategoryController.remove,
  ),
);

module.exports = router;
