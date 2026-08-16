const patientTypeService =
  require('../services/patient-type.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const records =
    await patientTypeService.listPatientTypes({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: records,
  });
}

async function getById(req, res) {
  const record =
    await patientTypeService.getPatientType({
      user: req.user,
      patientTypeId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await patientTypeService.createPatientType({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Patient type created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await patientTypeService.updatePatientType({
      user: req.user,
      patientTypeId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Patient type updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await patientTypeService.deletePatientType({
      user: req.user,
      patientTypeId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Patient type deleted successfully.',
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
