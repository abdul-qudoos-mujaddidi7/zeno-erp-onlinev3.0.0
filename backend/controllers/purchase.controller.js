const purchaseService =
  require('../services/purchase.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await purchaseService.listPurchases({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const purchase =
    await purchaseService.getPurchase({
      user: req.user,
      purchaseId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: purchase,
  });
}

/*
 * Reports the bill number the next purchase will receive. The form displays
 * this instead of a locally cached counter value.
 */
async function nextNumber(req, res) {
  const result =
    await purchaseService.previewNextBillNumber({
      user: req.user,
    });

  res.status(200).json({
    success: true,
    data: result,
  });
}

async function create(req, res) {
  const purchase =
    await purchaseService.createPurchase({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Purchase created successfully.',
    data: purchase,
  });
}

async function update(req, res) {
  const purchase =
    await purchaseService.updatePurchase({
      user: req.user,
      purchaseId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Purchase updated successfully.',
    data: purchase,
  });
}

async function remove(req, res) {
  const purchase =
    await purchaseService.deletePurchase({
      user: req.user,
      purchaseId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Purchase deleted successfully.',
    data: purchase,
  });
}

async function addPayment(req, res) {
  const payment =
    await purchaseService.createPayment({
      user: req.user,
      purchaseId: req.validated.params.id,
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
    await purchaseService.deletePayment({
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
  const purchaseReturn =
    await purchaseService.createReturn({
      user: req.user,
      purchaseId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Purchase return created successfully.',
    data: purchaseReturn,
  });
}

async function removeReturn(req, res) {
  const purchaseReturn =
    await purchaseService.deleteReturn({
      user: req.user,
      returnId: req.validated.params.returnId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Purchase return deleted successfully.',
    data: purchaseReturn,
  });
}

module.exports = {
  list,
  getById,
  nextNumber,
  create,
  update,
  remove,
  addPayment,
  removePayment,
  createReturn,
  removeReturn,
};
