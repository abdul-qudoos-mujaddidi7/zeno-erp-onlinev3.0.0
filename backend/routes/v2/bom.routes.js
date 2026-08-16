const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const bomController =
  require('../../controllers/bom.controller');

const {
  createBomSchema,
  updateBomSchema,
  bomIdParamsSchema,
  bomListQuerySchema,
} = require('../../validators/bom.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: bomListQuerySchema,
  }),
  asyncHandler(
    bomController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: bomIdParamsSchema,
  }),
  asyncHandler(
    bomController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createBomSchema,
  }),
  asyncHandler(
    bomController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: bomIdParamsSchema,
    body: updateBomSchema,
  }),
  asyncHandler(
    bomController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: bomIdParamsSchema,
  }),
  asyncHandler(
    bomController.remove,
  ),
);

module.exports = router;
