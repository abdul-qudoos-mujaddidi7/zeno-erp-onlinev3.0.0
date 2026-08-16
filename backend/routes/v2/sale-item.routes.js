const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const saleItemController =
  require('../../controllers/sale-item.controller');

const {
  createSaleItemSchema,
  updateSaleItemSchema,
  saleItemIdParamsSchema,
  saleItemListQuerySchema,
} = require('../../validators/sale-item.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: saleItemListQuerySchema,
  }),
  asyncHandler(
    saleItemController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: saleItemIdParamsSchema,
  }),
  asyncHandler(
    saleItemController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createSaleItemSchema,
  }),
  asyncHandler(
    saleItemController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: saleItemIdParamsSchema,
    body: updateSaleItemSchema,
  }),
  asyncHandler(
    saleItemController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: saleItemIdParamsSchema,
  }),
  asyncHandler(
    saleItemController.remove,
  ),
);

module.exports = router;
