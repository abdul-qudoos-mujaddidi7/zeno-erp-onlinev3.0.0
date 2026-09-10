const express = require('express');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../middleware/asyncHandler');
const controller = require('../../controllers/stock-adjustment.controller');
const { createStockAdjustmentSchema, listStockAdjustmentsSchema, stockAdjustmentIdParamsSchema } = require('../../validators/stock-adjustment.validator');
const router = express.Router();

router.get('/', validate({ query: listStockAdjustmentsSchema }), asyncHandler(controller.list));
router.get('/report', validate({ query: listStockAdjustmentsSchema }), asyncHandler(controller.report));
router.get('/:id', validate({ params: stockAdjustmentIdParamsSchema }), asyncHandler(controller.getById));
router.post('/', validate({ body: createStockAdjustmentSchema }), asyncHandler(controller.create));
module.exports = router;
