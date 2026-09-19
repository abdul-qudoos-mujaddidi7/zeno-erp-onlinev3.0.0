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
 * /resolve, /current, /:id/summary and /:id/close-preview are registered
 * before /:id so those literal paths can never be parsed as a numeric id.
 *
 * Step 4 added exactly two endpoints: a read-only close PREVIEW and the
 * close itself. There is intentionally NO reopen, no edit and no delete of a
 * close: closing is append-only until a separate, explicitly approved reopen
 * workflow exists.
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
  '/:id/close-preview',
  validate({
    params: fiscalYearIdParamsSchema,
  }),
  asyncHandler(
    fiscalYearController.closePreview,
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

/*
 * Closing needs no request body: the fiscal year comes from the path and the
 * organization and user come from the token, so a client can never choose
 * which organization is being closed.
 */
router.post(
  '/:id/close',
  validate({
    params: fiscalYearIdParamsSchema,
  }),
  asyncHandler(
    fiscalYearController.close,
  ),
);

module.exports = router;
