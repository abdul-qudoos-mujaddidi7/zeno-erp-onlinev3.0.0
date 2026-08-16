const labtestCategoryService =
  require('../services/labtest-category.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const records =
    await labtestCategoryService.listLabtestCategories({
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
    await labtestCategoryService.getLabtestCategory({
      user: req.user,
      labtestCategoryId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await labtestCategoryService.createLabtestCategory({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Lab test category created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await labtestCategoryService.updateLabtestCategory({
      user: req.user,
      labtestCategoryId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lab test category updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await labtestCategoryService.deleteLabtestCategory({
      user: req.user,
      labtestCategoryId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lab test category deleted successfully.',
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
