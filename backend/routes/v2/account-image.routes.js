const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const accountImageController =
  require('../../controllers/account-image.controller');

const {
  createAccountImageSchema,
  updateAccountImageSchema,
  accountImageIdParamsSchema,
  accountImageListQuerySchema,
} = require('../../validators/account-image.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: accountImageListQuerySchema,
  }),
  asyncHandler(
    accountImageController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: accountImageIdParamsSchema,
  }),
  asyncHandler(
    accountImageController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createAccountImageSchema,
  }),
  asyncHandler(
    accountImageController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: accountImageIdParamsSchema,
    body: updateAccountImageSchema,
  }),
  asyncHandler(
    accountImageController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: accountImageIdParamsSchema,
  }),
  asyncHandler(
    accountImageController.remove,
  ),
);

module.exports = router;
