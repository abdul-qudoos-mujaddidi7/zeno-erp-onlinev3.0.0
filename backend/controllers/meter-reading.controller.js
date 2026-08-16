const meterReadingService =
  require('../services/meter-reading.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await meterReadingService.listMeterReadings({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await meterReadingService.getMeterReading({
      user: req.user,
      meterReadingId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await meterReadingService.createMeterReading({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Meter reading created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await meterReadingService.updateMeterReading({
      user: req.user,
      meterReadingId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Meter reading updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await meterReadingService.deleteMeterReading({
      user: req.user,
      meterReadingId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Meter reading deleted successfully.',
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
