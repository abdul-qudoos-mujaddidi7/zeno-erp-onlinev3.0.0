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
  reopenFiscalYearSchema,
  fiscalYearOpeningBalancesQuerySchema,
  fiscalYearAccountStatementParamsSchema,
  fiscalYearAccountStatementQuerySchema,
} = require('../../validators/fiscal-year.validator');

const router = express.Router();

/*
 * Fiscal years are always tenant-scoped through the authenticated token's
 * org_id, so one organization can never see or edit another's years.
 *
 * /resolve, /current, /:id/summary, /:id/close-preview and
 * /:id/opening-balances are registered before /:id so those literal paths can
 * never be parsed as a numeric id.
 *
 * Step 4 added the read-only close PREVIEW and the close itself.
 *
 * Step 5 adds the ARCHIVE / ROLL-FORWARD reads and the matching reopen:
 *
 *   GET  /:id/opening-balances                  audit the roll-forward
 *   GET  /:id/accounts/:accountId/statement     opening + this year's movement
 *   POST /:id/reopen                            reverse a close (one transaction)
 *
 * Archiving itself has NO endpoint on purpose: a closed year stays visible and
 * is hidden from the current-year screens only by date range, so no historical
 * row is ever flagged, moved or rewritten. There is still no edit or delete of
 * a closing journal: reopen is the single, audited way back.
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
  '/:id/opening-balances',
  validate({
    params: fiscalYearIdParamsSchema,
    query: fiscalYearOpeningBalancesQuerySchema,
  }),
  asyncHandler(
    fiscalYearController.openingBalances,
  ),
);

router.get(
  '/:id/accounts/:accountId/statement',
  validate({
    params: fiscalYearAccountStatementParamsSchema,
    query: fiscalYearAccountStatementQuerySchema,
  }),
  asyncHandler(
    fiscalYearController.accountStatement,
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

/*
 * Reopen is the inverse of close and needs at most a human reason, so the body
 * is optional and the organization/user always come from the token.
 */
router.post(
  '/:id/reopen',
  validate({
    params: fiscalYearIdParamsSchema,
    body: reopenFiscalYearSchema,
  }),
  asyncHandler(
    fiscalYearController.reopen,
  ),
);

module.exports = router;
