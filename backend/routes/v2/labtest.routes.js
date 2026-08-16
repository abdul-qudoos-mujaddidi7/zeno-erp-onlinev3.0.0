const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const labtestController =
  require('../../controllers/labtest.controller');

const {
  createLabtestSchema,
  updateLabtestSchema,
  labtestIdParamsSchema,
  labtestListQuerySchema,
} = require('../../validators/labtest.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: labtestListQuerySchema,
  }),
  asyncHandler(
    labtestController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: labtestIdParamsSchema,
  }),
  asyncHandler(
    labtestController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createLabtestSchema,
  }),
  asyncHandler(
    labtestController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: labtestIdParamsSchema,
    body: updateLabtestSchema,
  }),
  asyncHandler(
    labtestController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: labtestIdParamsSchema,
  }),
  asyncHandler(
    labtestController.remove,
  ),
);

module.exports = router;
