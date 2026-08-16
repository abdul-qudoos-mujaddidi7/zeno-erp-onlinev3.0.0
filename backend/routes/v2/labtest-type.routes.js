const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const labtestTypeController =
  require('../../controllers/labtest-type.controller');

const {
  createLabtestTypeSchema,
  updateLabtestTypeSchema,
  labtestTypeIdParamsSchema,
  labtestTypeListQuerySchema,
} = require('../../validators/labtest-type.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: labtestTypeListQuerySchema,
  }),
  asyncHandler(
    labtestTypeController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: labtestTypeIdParamsSchema,
  }),
  asyncHandler(
    labtestTypeController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createLabtestTypeSchema,
  }),
  asyncHandler(
    labtestTypeController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: labtestTypeIdParamsSchema,
    body: updateLabtestTypeSchema,
  }),
  asyncHandler(
    labtestTypeController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: labtestTypeIdParamsSchema,
  }),
  asyncHandler(
    labtestTypeController.remove,
  ),
);

module.exports = router;
