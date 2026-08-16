const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const wasteController =
  require('../../controllers/waste.controller');

const {
  createWasteSchema,
  updateWasteSchema,
  wasteIdParamsSchema,
  wasteListQuerySchema,
} = require('../../validators/waste.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: wasteListQuerySchema,
  }),
  asyncHandler(
    wasteController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: wasteIdParamsSchema,
  }),
  asyncHandler(
    wasteController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createWasteSchema,
  }),
  asyncHandler(
    wasteController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: wasteIdParamsSchema,
    body: updateWasteSchema,
  }),
  asyncHandler(
    wasteController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: wasteIdParamsSchema,
  }),
  asyncHandler(
    wasteController.remove,
  ),
);

module.exports = router;
