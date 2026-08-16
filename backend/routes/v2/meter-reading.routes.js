const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const meterReadingController =
  require('../../controllers/meter-reading.controller');

const {
  createMeterReadingSchema,
  updateMeterReadingSchema,
  meterReadingIdParamsSchema,
  meterReadingListQuerySchema,
} = require('../../validators/meter-reading.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: meterReadingListQuerySchema,
  }),
  asyncHandler(
    meterReadingController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: meterReadingIdParamsSchema,
  }),
  asyncHandler(
    meterReadingController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createMeterReadingSchema,
  }),
  asyncHandler(
    meterReadingController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: meterReadingIdParamsSchema,
    body: updateMeterReadingSchema,
  }),
  asyncHandler(
    meterReadingController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: meterReadingIdParamsSchema,
  }),
  asyncHandler(
    meterReadingController.remove,
  ),
);

module.exports = router;
