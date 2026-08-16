const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const userRoleController =
  require('../../controllers/user-role.controller');

const {
  createUserRoleSchema,
  updateUserRoleSchema,
  userRoleIdParamsSchema,
  userRoleListQuerySchema,
} = require('../../validators/user-role.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: userRoleListQuerySchema,
  }),
  asyncHandler(
    userRoleController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: userRoleIdParamsSchema,
  }),
  asyncHandler(
    userRoleController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createUserRoleSchema,
  }),
  asyncHandler(
    userRoleController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: userRoleIdParamsSchema,
    body: updateUserRoleSchema,
  }),
  asyncHandler(
    userRoleController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: userRoleIdParamsSchema,
  }),
  asyncHandler(
    userRoleController.remove,
  ),
);

module.exports = router;
