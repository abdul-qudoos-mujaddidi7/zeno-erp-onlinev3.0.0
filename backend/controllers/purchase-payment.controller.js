const paymentService =
  require('../services/purchase-payment.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const payments =
    await paymentService.listPayments({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: payments,
  });
}

async function getById(req, res) {
  const payment =
    await paymentService.getPayment({
      user: req.user,
      paymentId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: payment,
  });
}

async function create(req, res) {
  const payment =
    await paymentService.createPayment({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'PURCHASE_PAYMENT created successfully.',
    data: payment,
  });
}

async function update(req, res) {
  const payment =
    await paymentService.updatePayment({
      user: req.user,
      paymentId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'PURCHASE_PAYMENT updated successfully.',
    data: payment,
  });
}

async function remove(req, res) {
  const payment =
    await paymentService.deletePayment({
      user: req.user,
      paymentId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'PURCHASE_PAYMENT deleted successfully.',
    data: payment,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
