const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const currencyController =
  require('../../controllers/currency.controller');

const {
  createCurrencySchema,
  updateCurrencySchema,
  currencyIdParamsSchema,
  currencyListQuerySchema,
} = require('../../validators/currency.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: currencyListQuerySchema,
  }),
  asyncHandler(
    currencyController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: currencyIdParamsSchema,
  }),
  asyncHandler(
    currencyController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createCurrencySchema,
  }),
  asyncHandler(
    currencyController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: currencyIdParamsSchema,
    body: updateCurrencySchema,
  }),
  asyncHandler(
    currencyController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: currencyIdParamsSchema,
  }),
  asyncHandler(
    currencyController.remove,
  ),
);

module.exports = router;
