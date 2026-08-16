const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const exchangeController =
  require('../../controllers/exchange.controller');

const {
  createExchangeSchema,
  updateExchangeSchema,
  exchangeIdParamsSchema,
  exchangeListQuerySchema,
} = require('../../validators/exchange.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: exchangeListQuerySchema,
  }),
  asyncHandler(
    exchangeController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: exchangeIdParamsSchema,
  }),
  asyncHandler(
    exchangeController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createExchangeSchema,
  }),
  asyncHandler(
    exchangeController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: exchangeIdParamsSchema,
    body: updateExchangeSchema,
  }),
  asyncHandler(
    exchangeController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: exchangeIdParamsSchema,
  }),
  asyncHandler(
    exchangeController.remove,
  ),
);

module.exports = router;
