const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const workCenterController =
  require('../../controllers/work-center.controller');

const {
  createWorkCenterSchema,
  updateWorkCenterSchema,
  workCenterIdParamsSchema,
  workCenterListQuerySchema,
} = require('../../validators/work-center.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: workCenterListQuerySchema,
  }),
  asyncHandler(
    workCenterController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: workCenterIdParamsSchema,
  }),
  asyncHandler(
    workCenterController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createWorkCenterSchema,
  }),
  asyncHandler(
    workCenterController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: workCenterIdParamsSchema,
    body: updateWorkCenterSchema,
  }),
  asyncHandler(
    workCenterController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: workCenterIdParamsSchema,
  }),
  asyncHandler(
    workCenterController.remove,
  ),
);

module.exports = router;
