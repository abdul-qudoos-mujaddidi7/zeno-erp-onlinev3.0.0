const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const settingsController =
  require('../../controllers/settings.controller');

const {
  createSettingSchema,
  updateSettingSchema,
  settingIdParamsSchema,
  settingListQuerySchema,
} = require('../../validators/settings.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: settingListQuerySchema,
  }),
  asyncHandler(
    settingsController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: settingIdParamsSchema,
  }),
  asyncHandler(
    settingsController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createSettingSchema,
  }),
  asyncHandler(
    settingsController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: settingIdParamsSchema,
    body: updateSettingSchema,
  }),
  asyncHandler(
    settingsController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: settingIdParamsSchema,
  }),
  asyncHandler(
    settingsController.remove,
  ),
);

module.exports = router;
