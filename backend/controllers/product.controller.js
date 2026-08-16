const productService =
  require('../services/product.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await productService.listProducts({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const product =
    await productService.getProduct({
      user: req.user,
      productId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: product,
  });
}

async function create(req, res) {
  const product =
    await productService.createProduct({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product created successfully.',
    data: product,
  });
}

async function update(req, res) {
  const product =
    await productService.updateProduct({
      user: req.user,
      productId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product updated successfully.',
    data: product,
  });
}

async function remove(req, res) {
  const product =
    await productService.deleteProduct({
      user: req.user,
      productId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product deleted successfully.',
    data: product,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
