const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const accountTypeController =
  require('../../controllers/account-type.controller');

const {
  createAccountTypeSchema,
  updateAccountTypeSchema,
  accountTypeIdParamsSchema,
  accountTypeListQuerySchema,
} = require('../../validators/account-type.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: accountTypeListQuerySchema,
  }),
  asyncHandler(
    accountTypeController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: accountTypeIdParamsSchema,
  }),
  asyncHandler(
    accountTypeController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createAccountTypeSchema,
  }),
  asyncHandler(
    accountTypeController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: accountTypeIdParamsSchema,
    body: updateAccountTypeSchema,
  }),
  asyncHandler(
    accountTypeController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: accountTypeIdParamsSchema,
  }),
  asyncHandler(
    accountTypeController.remove,
  ),
);

module.exports = router;
