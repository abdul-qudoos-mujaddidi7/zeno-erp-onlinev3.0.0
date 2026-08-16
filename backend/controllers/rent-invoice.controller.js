const rentInvoiceService =
  require('../services/rent-invoice.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await rentInvoiceService.listRentInvoices({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await rentInvoiceService.getRentInvoice({
      user: req.user,
      rentInvoiceId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await rentInvoiceService.createRentInvoice({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Rent invoice created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await rentInvoiceService.updateRentInvoice({
      user: req.user,
      rentInvoiceId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Rent invoice updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await rentInvoiceService.deleteRentInvoice({
      user: req.user,
      rentInvoiceId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Rent invoice deleted successfully.',
    data: record,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
