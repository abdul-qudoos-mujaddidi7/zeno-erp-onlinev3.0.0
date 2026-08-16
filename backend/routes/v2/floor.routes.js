const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const floorController =
  require('../../controllers/floor.controller');

const {
  createFloorSchema,
  updateFloorSchema,
  floorIdParamsSchema,
  floorListQuerySchema,
} = require('../../validators/floor.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: floorListQuerySchema,
  }),
  asyncHandler(
    floorController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: floorIdParamsSchema,
  }),
  asyncHandler(
    floorController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createFloorSchema,
  }),
  asyncHandler(
    floorController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: floorIdParamsSchema,
    body: updateFloorSchema,
  }),
  asyncHandler(
    floorController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: floorIdParamsSchema,
  }),
  asyncHandler(
    floorController.remove,
  ),
);

module.exports = router;
