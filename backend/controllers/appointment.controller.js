const appointmentService =
  require('../services/appointment.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await appointmentService.listAppointments({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const appointment =
    await appointmentService.getAppointment({
      user: req.user,
      appointmentId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: appointment,
  });
}

async function create(req, res) {
  const appointment =
    await appointmentService.createAppointment({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Appointment created successfully.',
    data: appointment,
  });
}

async function update(req, res) {
  const appointment =
    await appointmentService.updateAppointment({
      user: req.user,
      appointmentId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Appointment updated successfully.',
    data: appointment,
  });
}

async function remove(req, res) {
  const appointment =
    await appointmentService.deleteAppointment({
      user: req.user,
      appointmentId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Appointment deleted successfully.',
    data: appointment,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
