const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const accountController =
  require('../../controllers/account.controller');

const {
  createAccountSchema,
  updateAccountSchema,
  accountIdParamsSchema,
  accountListQuerySchema,
  accountBalancesQuerySchema,
  accountProductItemsQuerySchema,
} = require('../../validators/account.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: accountListQuerySchema,
  }),
  asyncHandler(
    accountController.list,
  ),
);

router.get(
  '/balances',
  validate({
    query: accountBalancesQuerySchema,
  }),
  asyncHandler(
    accountController.balances,
  ),
);

router.get(
  '/credit-debit',
  validate({
    query: accountBalancesQuerySchema,
  }),
  asyncHandler(
    accountController.creditDebit,
  ),
);

router.get(
  '/report-bootstrap',
  validate({
    query: accountBalancesQuerySchema,
  }),
  asyncHandler(
    accountController.reportBootstrap,
  ),
);

router.get(
  '/:id/product-items',
  validate({
    params: accountIdParamsSchema,
    query: accountProductItemsQuerySchema,
  }),
  asyncHandler(
    accountController.productItems,
  ),
);

router.get(
  '/:id',
  validate({
    params: accountIdParamsSchema,
  }),
  asyncHandler(
    accountController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createAccountSchema,
  }),
  asyncHandler(
    accountController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: accountIdParamsSchema,
    body: updateAccountSchema,
  }),
  asyncHandler(
    accountController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: accountIdParamsSchema,
  }),
  asyncHandler(
    accountController.remove,
  ),
);

module.exports = router;
