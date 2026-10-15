const stockTransactionService =
  require('../services/stock-transaction.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const { data, meta } =
    await stockTransactionService.listStockTransactions({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data,
    /*
     * `meta` is only present for a paged request. Callers that fetch the whole
     * history keep the response shape they have always had.
     */
    ...(meta ? { meta } : {}),
  });
}

async function getById(req, res) {
  const stockTransaction =
    await stockTransactionService.getStockTransaction({
      user: req.user,
      stockTransactionId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: stockTransaction,
  });
}

async function create(req, res) {
  const stockTransaction =
    await stockTransactionService.createStockTransaction({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Stock transaction created successfully.',
    data: stockTransaction,
  });
}

async function update(req, res) {
  const stockTransaction =
    await stockTransactionService.updateStockTransaction({
      user: req.user,
      stockTransactionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock transaction updated successfully.',
    data: stockTransaction,
  });
}

async function remove(req, res) {
  const stockTransaction =
    await stockTransactionService.deleteStockTransaction({
      user: req.user,
      stockTransactionId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock transaction deleted successfully.',
    data: stockTransaction,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
