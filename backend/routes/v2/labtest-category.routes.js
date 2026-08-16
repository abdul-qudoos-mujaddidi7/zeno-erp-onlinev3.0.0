const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const labtestCategoryController =
  require('../../controllers/labtest-category.controller');

const {
  createLabtestCategorySchema,
  updateLabtestCategorySchema,
  labtestCategoryIdParamsSchema,
  labtestCategoryListQuerySchema,
} = require('../../validators/labtest-category.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: labtestCategoryListQuerySchema,
  }),
  asyncHandler(
    labtestCategoryController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: labtestCategoryIdParamsSchema,
  }),
  asyncHandler(
    labtestCategoryController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createLabtestCategorySchema,
  }),
  asyncHandler(
    labtestCategoryController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: labtestCategoryIdParamsSchema,
    body: updateLabtestCategorySchema,
  }),
  asyncHandler(
    labtestCategoryController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: labtestCategoryIdParamsSchema,
  }),
  asyncHandler(
    labtestCategoryController.remove,
  ),
);

module.exports = router;
