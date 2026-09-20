const fiscalYearService =
  require('../services/fiscal-year.service');

const fiscalYearCloseService =
  require('../services/fiscal-year-close.service');

const fiscalYearArchiveService =
  require('../services/fiscal-year-archive.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const fiscalYears =
    await fiscalYearService.listFiscalYears({
      user: req.user,
      filters: req.validated?.query || req.query,
    });

  res.status(200).json({
    success: true,
    data: fiscalYears,
  });
}

async function getById(req, res) {
  const fiscalYear =
    await fiscalYearService.getFiscalYear({
      user: req.user,
      fiscalYearId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: fiscalYear,
  });
}

/*
 * Resolution is a report-side helper: it answers "which fiscal year does
 * this date belong to?" without ever assigning one, so a date outside every
 * configured range returns fiscal_year: null instead of an error.
 */
async function resolve(req, res) {
  const resolution =
    await fiscalYearService.resolveFiscalYearForDate({
      user: req.user,
      date: req.validated?.query?.date || req.query.date,
    });

  res.status(200).json({
    success: true,
    data: resolution,
  });
}

async function getCurrent(req, res) {
  const fiscalYear =
    await fiscalYearService.getCurrentFiscalYear({
      user: req.user,
      date: req.validated?.query?.date || req.query.date,
    });

  res.status(200).json({
    success: true,
    data: fiscalYear,
  });
}

async function summary(req, res) {
  const report =
    await fiscalYearService.getFiscalYearSummary({
      user: req.user,
      fiscalYearId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: report,
  });
}

/*
 * Read-only: reports what a close would post, without writing anything.
 * The close itself recomputes inside its transaction and ignores this.
 */
async function closePreview(req, res) {
  const report =
    await fiscalYearCloseService.previewFiscalYearClose(
      {
        user: req.user,
        fiscalYearId: req.validated.params.id,
      },
    );

  res.status(200).json({
    success: true,
    data: report,
  });
}

/*
 * The only way a fiscal year can be closed: one backend-authoritative
 * transaction that posts the closing journals and flips the status together.
 * There is deliberately no reopen/delete counterpart in this step.
 */
async function close(req, res) {
  const result =
    await fiscalYearCloseService.closeFiscalYear({
      user: req.user,
      fiscalYearId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Fiscal year closed successfully.',
    data: result,
  });
}

/*
 * The roll-forward audit trail of a fiscal year: the opening balances it
 * RECEIVED, and the ones it GENERATED for the next year when it was closed.
 * Read-only; nothing here can edit a generated balance.
 */
async function openingBalances(req, res) {
  const query = req.validated?.query || req.query;

  const report =
    await fiscalYearArchiveService.listOpeningBalances({
      user: req.user,
      fiscalYearId: req.validated.params.id,
      includeInactive: Number(query.include_inactive) === 1,
      generated: Number(query.generated ?? 1) === 1,
    });

  res.status(200).json({
    success: true,
    data: report,
  });
}

/*
 * One account's statement INSIDE one fiscal year:
 * opening balance + that year's journals = closing balance. Historical years'
 * journals are never mixed in, which is what stops a closed year's activity
 * from being counted twice.
 */
async function accountStatement(req, res) {
  const query = req.validated?.query || req.query;

  const statement =
    await fiscalYearArchiveService.getAccountStatement({
      user: req.user,
      fiscalYearId: req.validated.params.id,
      accountId: req.validated.params.accountId,
      currency: query.currency,
      filters: query,
    });

  res.status(200).json({
    success: true,
    data: statement,
  });
}

/*
 * Reopening is the only supported way to undo a close. It is one
 * backend-authoritative transaction: closing journals are reversed
 * (soft-deleted, never erased), the opening balances this close generated are
 * deactivated, and the year returns to OPEN.
 */
async function reopen(req, res) {
  const result =
    await fiscalYearCloseService.reopenFiscalYear({
      user: req.user,
      fiscalYearId: req.validated.params.id,
      reason: req.validated?.body?.reason ?? null,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Fiscal year reopened successfully.',
    data: result,
  });
}

async function create(req, res) {
  const fiscalYear =
    await fiscalYearService.createFiscalYear({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Fiscal year created successfully.',
    data: fiscalYear,
  });
}

async function update(req, res) {
  const fiscalYear =
    await fiscalYearService.updateFiscalYear({
      user: req.user,
      fiscalYearId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Fiscal year updated successfully.',
    data: fiscalYear,
  });
}

module.exports = {
  list,
  getById,
  resolve,
  getCurrent,
  summary,
  closePreview,
  close,
  openingBalances,
  accountStatement,
  reopen,
  create,
  update,
};
