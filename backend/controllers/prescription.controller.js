const prescriptionService =
  require('../services/prescription.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await prescriptionService.listPrescriptions({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const prescription =
    await prescriptionService.getPrescription({
      user: req.user,
      prescriptionId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: prescription,
  });
}

async function create(req, res) {
  const prescription =
    await prescriptionService.createPrescription({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Prescription created successfully.',
    data: prescription,
  });
}

async function update(req, res) {
  const prescription =
    await prescriptionService.updatePrescription({
      user: req.user,
      prescriptionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Prescription updated successfully.',
    data: prescription,
  });
}

async function remove(req, res) {
  const prescription =
    await prescriptionService.deletePrescription({
      user: req.user,
      prescriptionId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Prescription deleted successfully.',
    data: prescription,
  });
}

async function addPayment(req, res) {
  const payment =
    await prescriptionService.createPayment({
      user: req.user,
      prescriptionId: req.validated.params.id,
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
    await prescriptionService.deletePayment({
      user: req.user,
      prescriptionId: req.validated.params.id,
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
  const prescriptionReturn =
    await prescriptionService.createReturn({
      user: req.user,
      prescriptionId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Prescription return created successfully.',
    data: prescriptionReturn,
  });
}

async function removeReturn(req, res) {
  const prescriptionReturn =
    await prescriptionService.deleteReturn({
      user: req.user,
      prescriptionId: req.validated.params.id,
      returnId: req.validated.params.returnId,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Prescription return deleted successfully.',
    data: prescriptionReturn,
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
