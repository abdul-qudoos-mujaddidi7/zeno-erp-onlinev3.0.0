const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const purchaseItemController =
  require('../../controllers/purchase-item.controller');

const {
  createPurchaseItemSchema,
  updatePurchaseItemSchema,
  purchaseItemIdParamsSchema,
  purchaseItemListQuerySchema,
} = require('../../validators/purchase-item.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: purchaseItemListQuerySchema,
  }),
  asyncHandler(
    purchaseItemController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: purchaseItemIdParamsSchema,
  }),
  asyncHandler(
    purchaseItemController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPurchaseItemSchema,
  }),
  asyncHandler(
    purchaseItemController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: purchaseItemIdParamsSchema,
    body: updatePurchaseItemSchema,
  }),
  asyncHandler(
    purchaseItemController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: purchaseItemIdParamsSchema,
  }),
  asyncHandler(
    purchaseItemController.remove,
  ),
);

module.exports = router;
