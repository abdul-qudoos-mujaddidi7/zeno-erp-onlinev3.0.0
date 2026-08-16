const stockTransferService =
  require('../services/stock-transfer.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await stockTransferService.listStockTransfers({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const stockTransfer =
    await stockTransferService.getStockTransfer({
      user: req.user,
      stockTransferId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: stockTransfer,
  });
}

async function create(req, res) {
  const stockTransfer =
    await stockTransferService.createStockTransfer({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Stock transfer created successfully.',
    data: stockTransfer,
  });
}

async function update(req, res) {
  const stockTransfer =
    await stockTransferService.updateStockTransfer({
      user: req.user,
      stockTransferId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock transfer updated successfully.',
    data: stockTransfer,
  });
}

async function remove(req, res) {
  const stockTransfer =
    await stockTransferService.deleteStockTransfer({
      user: req.user,
      stockTransferId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Stock transfer deleted successfully.',
    data: stockTransfer,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
