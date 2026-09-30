const unitCategoryService =
  require('../services/unit-category.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const unitCategories =
    await unitCategoryService.listUnitCategories({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: unitCategories,
  });
}

async function getById(req, res) {
  const unitCategory =
    await unitCategoryService.getUnitCategory({
      user: req.user,
      unitCategoryId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: unitCategory,
  });
}

async function create(req, res) {
  const unitCategory =
    await unitCategoryService.createUnitCategory({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Unit category created successfully.',
    data: unitCategory,
  });
}

async function update(req, res) {
  const unitCategory =
    await unitCategoryService.updateUnitCategory({
      user: req.user,
      unitCategoryId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Unit category updated successfully.',
    data: unitCategory,
  });
}

async function remove(req, res) {
  const unitCategory =
    await unitCategoryService.deleteUnitCategory({
      user: req.user,
      unitCategoryId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Unit category deleted successfully.',
    data: unitCategory,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
