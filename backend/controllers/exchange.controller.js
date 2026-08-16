const exchangeService =
  require('../services/exchange.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await exchangeService.listExchanges({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const exchange =
    await exchangeService.getExchange({
      user: req.user,
      exchangeId: req.validated.params.id,
    });

  return res.json({
    success: true,
    data: exchange,
  });
}

async function create(req, res) {
  const exchange =
    await exchangeService.createExchange({
      user: req.user,
      data: req.validated.body,
      requestContext: getRequestContext(req),
    });

  return res.status(201).json({
    success: true,
    data: exchange,
  });
}

async function update(req, res) {
  const exchange =
    await exchangeService.updateExchange({
      user: req.user,
      exchangeId: req.validated.params.id,
      data: req.validated.body,
      requestContext: getRequestContext(req),
    });

  return res.json({
    success: true,
    data: exchange,
  });
}

async function remove(req, res) {
  const exchange =
    await exchangeService.deleteExchange({
      user: req.user,
      exchangeId: req.validated.params.id,
      requestContext: getRequestContext(req),
    });

  return res.json({
    success: true,
    data: exchange,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
