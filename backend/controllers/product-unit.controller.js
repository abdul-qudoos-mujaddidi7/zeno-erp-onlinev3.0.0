const productUnitService =
  require('../services/product-unit.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const productUnits =
    await productUnitService.listProductUnits({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: productUnits,
  });
}

async function getById(req, res) {
  const productUnit =
    await productUnitService.getProductUnit({
      user: req.user,
      productUnitId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: productUnit,
  });
}

async function create(req, res) {
  const productUnit =
    await productUnitService.createProductUnit({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product unit created successfully.',
    data: productUnit,
  });
}

async function update(req, res) {
  const productUnit =
    await productUnitService.updateProductUnit({
      user: req.user,
      productUnitId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product unit updated successfully.',
    data: productUnit,
  });
}

async function remove(req, res) {
  const productUnit =
    await productUnitService.deleteProductUnit({
      user: req.user,
      productUnitId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product unit deleted successfully.',
    data: productUnit,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
