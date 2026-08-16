const stockBatchService =
  require('../services/stock-batch.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const stockBatches =
    await stockBatchService.listStockBatches({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: stockBatches,
  });
}

async function getById(req, res) {
  const stockBatch =
    await stockBatchService.getStockBatch({
      user: req.user,
      stockBatchId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: stockBatch,
  });
}

async function create(req, res) {
  const stockBatch =
    await stockBatchService.createStockBatch({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Stock batch created successfully.',
    data: stockBatch,
  });
}

async function update(req, res) {
  const stockBatch =
    await stockBatchService.updateStockBatch({
      user: req.user,
      stockBatchId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock batch updated successfully.',
    data: stockBatch,
  });
}

async function remove(req, res) {
  const stockBatch =
    await stockBatchService.deleteStockBatch({
      user: req.user,
      stockBatchId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock batch deleted successfully.',
    data: stockBatch,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
