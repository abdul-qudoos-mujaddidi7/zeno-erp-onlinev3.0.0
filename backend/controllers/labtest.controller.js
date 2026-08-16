const labtestService =
  require('../services/labtest.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await labtestService.listLabtests({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await labtestService.getLabtest({
      user: req.user,
      labtestId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await labtestService.createLabtest({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Lab test created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await labtestService.updateLabtest({
      user: req.user,
      labtestId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lab test updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await labtestService.deleteLabtest({
      user: req.user,
      labtestId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lab test deleted successfully.',
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
