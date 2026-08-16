const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const accountGroupController =
  require('../../controllers/account-group.controller');

const {
  createAccountGroupSchema,
  updateAccountGroupSchema,
  accountGroupIdParamsSchema,
  accountGroupListQuerySchema,
} = require('../../validators/account-group.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: accountGroupListQuerySchema,
  }),
  asyncHandler(
    accountGroupController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: accountGroupIdParamsSchema,
  }),
  asyncHandler(
    accountGroupController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createAccountGroupSchema,
  }),
  asyncHandler(
    accountGroupController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: accountGroupIdParamsSchema,
    body: updateAccountGroupSchema,
  }),
  asyncHandler(
    accountGroupController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: accountGroupIdParamsSchema,
  }),
  asyncHandler(
    accountGroupController.remove,
  ),
);

module.exports = router;
