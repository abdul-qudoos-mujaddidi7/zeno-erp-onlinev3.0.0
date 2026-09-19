const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const fiscalYearController =
  require('../../controllers/fiscal-year.controller');

const {
  fiscalYearIdParamsSchema,
  fiscalYearListQuerySchema,
  fiscalYearResolveQuerySchema,
  createFiscalYearSchema,
  updateFiscalYearSchema,
} = require('../../validators/fiscal-year.validator');

const router = express.Router();

/*
 * Fiscal years are always tenant-scoped through the authenticated token's
 * org_id, so one organization can never see or edit another's years.
 *
 * There is intentionally NO close endpoint yet: closing a year is a later,
 * explicitly approved step that must post real accounting entries.
 *
 * /resolve, /current and /:id/summary are registered before /:id so those
 * literal paths can never be parsed as a numeric id.
 */
router.get(
  '/',
  validate({
    query: fiscalYearListQuerySchema,
  }),
  asyncHandler(
    fiscalYearController.list,
  ),
);

router.get(
  '/resolve',
  validate({
    query: fiscalYearResolveQuerySchema,
  }),
  asyncHandler(
    fiscalYearController.resolve,
  ),
);

router.get(
  '/current',
  validate({
    query: fiscalYearResolveQuerySchema,
  }),
  asyncHandler(
    fiscalYearController.getCurrent,
  ),
);

router.get(
  '/:id/summary',
  validate({
    params: fiscalYearIdParamsSchema,
  }),
  asyncHandler(
    fiscalYearController.summary,
  ),
);

router.get(
  '/:id',
  validate({
    params: fiscalYearIdParamsSchema,
  }),
  asyncHandler(
    fiscalYearController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createFiscalYearSchema,
  }),
  asyncHandler(
    fiscalYearController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: fiscalYearIdParamsSchema,
    body: updateFiscalYearSchema,
  }),
  asyncHandler(
    fiscalYearController.update,
  ),
);

module.exports = router;
