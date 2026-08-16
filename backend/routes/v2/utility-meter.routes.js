const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const utilityMeterController =
  require('../../controllers/utility-meter.controller');

const {
  createUtilityMeterSchema,
  updateUtilityMeterSchema,
  utilityMeterIdParamsSchema,
  utilityMeterListQuerySchema,
} = require('../../validators/utility-meter.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: utilityMeterListQuerySchema,
  }),
  asyncHandler(
    utilityMeterController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: utilityMeterIdParamsSchema,
  }),
  asyncHandler(
    utilityMeterController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createUtilityMeterSchema,
  }),
  asyncHandler(
    utilityMeterController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: utilityMeterIdParamsSchema,
    body: updateUtilityMeterSchema,
  }),
  asyncHandler(
    utilityMeterController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: utilityMeterIdParamsSchema,
  }),
  asyncHandler(
    utilityMeterController.remove,
  ),
);

module.exports = router;
