const productImageService =
  require('../services/product-image.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await productImageService.listProductImages({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const productImage =
    await productImageService.getProductImage({
      user: req.user,
      productImageId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: productImage,
  });
}

async function create(req, res) {
  const productImage =
    await productImageService.createProductImage({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product image created successfully.',
    data: productImage,
  });
}

async function update(req, res) {
  const productImage =
    await productImageService.updateProductImage({
      user: req.user,
      productImageId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product image updated successfully.',
    data: productImage,
  });
}

async function remove(req, res) {
  const productImage =
    await productImageService.deleteProductImage({
      user: req.user,
      productImageId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product image deleted successfully.',
    data: productImage,
  });
}

async function replace(req, res) {
  const productImage =
    await productImageService.replaceProductImage({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product image replaced successfully.',
    data: productImage,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  replace,
};
