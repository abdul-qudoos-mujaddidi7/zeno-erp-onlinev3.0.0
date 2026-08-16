const utilityMeterService =
  require('../services/utility-meter.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await utilityMeterService.listUtilityMeters({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await utilityMeterService.getUtilityMeter({
      user: req.user,
      utilityMeterId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await utilityMeterService.createUtilityMeter({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Utility meter created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await utilityMeterService.updateUtilityMeter({
      user: req.user,
      utilityMeterId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Utility meter updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await utilityMeterService.deleteUtilityMeter({
      user: req.user,
      utilityMeterId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Utility meter deleted successfully.',
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
