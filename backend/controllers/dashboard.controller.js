const dashboardService =
  require('../services/dashboard.service');

async function summary(req, res) {
  const data =
    await dashboardService.getSummary({
      user: req.user,
      filters: req.validated?.query || req.query,
    });

  return res.json({
    success: true,
    data,
  });
}

async function inventory(req, res) {
  const data =
    await dashboardService.getInventoryValuation({
      user: req.user,
    });

  return res.json({
    success: true,
    data,
  });
}

module.exports = {
  summary,
  inventory,
};
