const productGenericService =
  require('../services/product-generic.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const generics =
    await productGenericService.listGenerics({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: generics,
  });
}

async function getById(req, res) {
  const generic =
    await productGenericService.getGeneric({
      user: req.user,
      genericId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: generic,
  });
}

async function create(req, res) {
  const generic =
    await productGenericService.createGeneric({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product generic created successfully.',
    data: generic,
  });
}

async function update(req, res) {
  const generic =
    await productGenericService.updateGeneric({
      user: req.user,
      genericId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product generic updated successfully.',
    data: generic,
  });
}

async function remove(req, res) {
  const generic =
    await productGenericService.deleteGeneric({
      user: req.user,
      genericId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product generic deleted successfully.',
    data: generic,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
