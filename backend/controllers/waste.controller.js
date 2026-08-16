const wasteService =
  require('../services/waste.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await wasteService.listWastes({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const waste =
    await wasteService.getWaste({
      user: req.user,
      wasteId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: waste,
  });
}

async function create(req, res) {
  const waste =
    await wasteService.createWaste({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Waste created successfully.',
    data: waste,
  });
}

async function update(req, res) {
  const waste =
    await wasteService.updateWaste({
      user: req.user,
      wasteId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Waste updated successfully.',
    data: waste,
  });
}

async function remove(req, res) {
  const waste =
    await wasteService.deleteWaste({
      user: req.user,
      wasteId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Waste deleted successfully.',
    data: waste,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
