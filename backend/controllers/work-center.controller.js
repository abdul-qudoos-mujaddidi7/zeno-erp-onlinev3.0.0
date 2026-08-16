const workCenterService =
  require('../services/work-center.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const workCenters =
    await workCenterService.listWorkCenters({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: workCenters,
  });
}

async function getById(req, res) {
  const workCenter =
    await workCenterService.getWorkCenter({
      user: req.user,
      workCenterId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: workCenter,
  });
}

async function create(req, res) {
  const workCenter =
    await workCenterService.createWorkCenter({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Work center created successfully.',
    data: workCenter,
  });
}

async function update(req, res) {
  const workCenter =
    await workCenterService.updateWorkCenter({
      user: req.user,
      workCenterId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Work center updated successfully.',
    data: workCenter,
  });
}

async function remove(req, res) {
  const workCenter =
    await workCenterService.deleteWorkCenter({
      user: req.user,
      workCenterId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Work center deleted successfully.',
    data: workCenter,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
