const productionService =
  require('../services/production.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const productions =
    await productionService.listProductions({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: productions,
  });
}

async function getById(req, res) {
  const production =
    await productionService.getProduction({
      user: req.user,
      productionId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: production,
  });
}

async function create(req, res) {
  const production =
    await productionService.createProduction({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Production created successfully.',
    data: production,
  });
}

async function update(req, res) {
  const production =
    await productionService.updateProduction({
      user: req.user,
      productionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Production updated successfully.',
    data: production,
  });
}

async function remove(req, res) {
  const production =
    await productionService.deleteProduction({
      user: req.user,
      productionId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Production deleted successfully.',
    data: production,
  });
}

async function addPayment(req, res) {
  const payment =
    await productionService.createPayment({
      user: req.user,
      productionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Payment added successfully.',
    data: payment,
  });
}

async function removePayment(req, res) {
  const payment =
    await productionService.deletePayment({
      user: req.user,
      paymentId: req.validated.params.paymentId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Payment deleted successfully.',
    data: payment,
  });
}

async function createReturn(req, res) {
  const productionReturn =
    await productionService.createReturn({
      user: req.user,
      productionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Production return created successfully.',
    data: productionReturn,
  });
}

async function removeReturn(req, res) {
  const productionReturn =
    await productionService.deleteReturn({
      user: req.user,
      returnId: req.validated.params.returnId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Production return deleted successfully.',
    data: productionReturn,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addPayment,
  removePayment,
  createReturn,
  removeReturn,
};
