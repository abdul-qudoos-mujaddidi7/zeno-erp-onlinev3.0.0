const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const buildingController =
  require('../../controllers/building.controller');

const {
  createBuildingSchema,
  updateBuildingSchema,
  buildingIdParamsSchema,
  buildingListQuerySchema,
} = require('../../validators/building.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: buildingListQuerySchema,
  }),
  asyncHandler(
    buildingController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: buildingIdParamsSchema,
  }),
  asyncHandler(
    buildingController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createBuildingSchema,
  }),
  asyncHandler(
    buildingController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: buildingIdParamsSchema,
    body: updateBuildingSchema,
  }),
  asyncHandler(
    buildingController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: buildingIdParamsSchema,
  }),
  asyncHandler(
    buildingController.remove,
  ),
);

module.exports = router;
