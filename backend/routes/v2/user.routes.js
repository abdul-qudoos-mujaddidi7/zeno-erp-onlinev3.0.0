const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const userController =
  require('../../controllers/user.controller');

const {
  createUserSchema,
  updateUserSchema,
  userIdParamsSchema,
  userListQuerySchema,
} = require('../../validators/user.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: userListQuerySchema,
  }),
  asyncHandler(
    userController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: userIdParamsSchema,
  }),
  asyncHandler(
    userController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createUserSchema,
  }),
  asyncHandler(
    userController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: userIdParamsSchema,
    body: updateUserSchema,
  }),
  asyncHandler(
    userController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: userIdParamsSchema,
  }),
  asyncHandler(
    userController.remove,
  ),
);

module.exports = router;
