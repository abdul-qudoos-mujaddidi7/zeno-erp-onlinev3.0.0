const saleService =
  require('../services/sale.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await saleService.listSales({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const sale =
    await saleService.getSale({
      user: req.user,
      saleId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: sale,
  });
}

/*
 * Reports the invoice number the next confirmed sale will receive. The form
 * displays this instead of a locally cached counter value.
 */
async function nextNumber(req, res) {
  const result =
    await saleService.previewNextInvoiceNumber({
      user: req.user,
      saleType: req.validated.query.sale_type,
    });

  res.status(200).json({
    success: true,
    data: result,
  });
}

async function create(req, res) {
  const sale =
    await saleService.createSale({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Sale created successfully.',
    data: sale,
  });
}

async function update(req, res) {
  const sale =
    await saleService.updateSale({
      user: req.user,
      saleId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Sale updated successfully.',
    data: sale,
  });
}

async function remove(req, res) {
  const sale =
    await saleService.deleteSale({
      user: req.user,
      saleId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Sale deleted successfully.',
    data: sale,
  });
}

async function addPayment(req, res) {
  const payment =
    await saleService.createPayment({
      user: req.user,
      saleId: req.validated.params.id,
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
    await saleService.deletePayment({
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
  const saleReturn =
    await saleService.createReturn({
      user: req.user,
      saleId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Sale return created successfully.',
    data: saleReturn,
  });
}

async function removeReturn(req, res) {
  const saleReturn =
    await saleService.deleteReturn({
      user: req.user,
      returnId: req.validated.params.returnId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Sale return deleted successfully.',
    data: saleReturn,
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
