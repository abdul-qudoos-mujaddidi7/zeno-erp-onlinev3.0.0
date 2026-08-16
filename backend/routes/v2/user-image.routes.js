const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const userImageController =
  require('../../controllers/user-image.controller');

const {
  createUserImageSchema,
  updateUserImageSchema,
  userImageIdParamsSchema,
  userImageListQuerySchema,
} = require('../../validators/user-image.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: userImageListQuerySchema,
  }),
  asyncHandler(
    userImageController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: userImageIdParamsSchema,
  }),
  asyncHandler(
    userImageController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createUserImageSchema,
  }),
  asyncHandler(
    userImageController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: userImageIdParamsSchema,
    body: updateUserImageSchema,
  }),
  asyncHandler(
    userImageController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: userImageIdParamsSchema,
  }),
  asyncHandler(
    userImageController.remove,
  ),
);

module.exports = router;
