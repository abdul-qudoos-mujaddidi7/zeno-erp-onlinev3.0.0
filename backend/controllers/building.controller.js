const buildingService =
  require('../services/building.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await buildingService.listBuildings({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await buildingService.getBuilding({
      user: req.user,
      buildingId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await buildingService.createBuilding({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Building created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await buildingService.updateBuilding({
      user: req.user,
      buildingId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Building updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await buildingService.deleteBuilding({
      user: req.user,
      buildingId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Building deleted successfully.',
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
