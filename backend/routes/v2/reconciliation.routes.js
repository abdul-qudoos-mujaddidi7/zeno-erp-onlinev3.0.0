const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const requireReconciliationAccess =
  require('../../middleware/reconciliationAccess');

const reconciliationController =
  require('../../controllers/reconciliation.controller');

const {
  reconciliationQuerySchema,
} = require('../../validators/reconciliation.validator');

const router = express.Router();

/*
 * READ-ONLY report. There is intentionally no POST/PUT/DELETE here —
 * the reconciliation service must never write.
 */
router.get(
  '/',
  requireReconciliationAccess,
  validate({
    query: reconciliationQuerySchema,
  }),
  asyncHandler(
    reconciliationController.report,
  ),
);

module.exports = router;
