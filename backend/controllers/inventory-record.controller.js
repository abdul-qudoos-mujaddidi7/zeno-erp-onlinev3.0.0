const inventoryRecordService =
  require('../services/inventory-record.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await inventoryRecordService.listInventoryRecords({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await inventoryRecordService.getInventoryRecord({
      user: req.user,
      recordId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await inventoryRecordService.createInventoryRecord({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Inventory record created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await inventoryRecordService.updateInventoryRecord({
      user: req.user,
      recordId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Inventory record updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await inventoryRecordService.deleteInventoryRecord({
      user: req.user,
      recordId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Inventory record deleted successfully.',
    data: record,
  });
}

async function addPayment(req, res) {
  const payment =
    await inventoryRecordService.createPayment({
      user: req.user,
      recordId: req.validated.params.id,
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
    await inventoryRecordService.deletePayment({
      user: req.user,
      recordId: req.validated.params.id,
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
  const recordReturn =
    await inventoryRecordService.createReturn({
      user: req.user,
      recordId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Inventory record return created successfully.',
    data: recordReturn,
  });
}

async function removeReturn(req, res) {
  const recordReturn =
    await inventoryRecordService.deleteReturn({
      user: req.user,
      recordId: req.validated.params.id,
      returnId: req.validated.params.returnId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Inventory record return deleted successfully.',
    data: recordReturn,
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
