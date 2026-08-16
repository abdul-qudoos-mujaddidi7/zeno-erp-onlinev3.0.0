const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const dashboardController =
  require('../../controllers/dashboard.controller');

const {
  dashboardSummaryQuerySchema,
} = require('../../validators/dashboard.validator');

const router = express.Router();

router.get(
  '/summary',
  validate({
    query: dashboardSummaryQuerySchema,
  }),
  asyncHandler(
    dashboardController.summary,
  ),
);

router.get(
  '/inventory',
  asyncHandler(
    dashboardController.inventory,
  ),
);

module.exports = router;
