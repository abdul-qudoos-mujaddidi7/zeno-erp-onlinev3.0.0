const bomService =
  require('../services/bom.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const boms =
    await bomService.listBoms({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: boms,
  });
}

async function getById(req, res) {
  const bom =
    await bomService.getBom({
      user: req.user,
      bomId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: bom,
  });
}

async function create(req, res) {
  const bom =
    await bomService.createBom({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'BOM created successfully.',
    data: bom,
  });
}

async function update(req, res) {
  const bom =
    await bomService.updateBom({
      user: req.user,
      bomId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'BOM updated successfully.',
    data: bom,
  });
}

async function remove(req, res) {
  const bom =
    await bomService.deleteBom({
      user: req.user,
      bomId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'BOM deleted successfully.',
    data: bom,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
