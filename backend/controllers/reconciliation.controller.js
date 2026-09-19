const reconciliationService =
  require('../services/reconciliation.service');

async function report(req, res) {
  const data =
    await reconciliationService.getReconciliationReport({
      user: req.user,
      filters: req.validated?.query || req.query,
    });

  return res.json({
    success: true,
    data,
  });
}

module.exports = {
  report,
};
