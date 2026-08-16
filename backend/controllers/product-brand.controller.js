const productBrandService =
  require('../services/product-brand.service');

const requestContextModule =
  require('../utils/requestContext');

const getRequestContext =
  typeof requestContextModule === 'function'
    ? requestContextModule
    : requestContextModule.getRequestContext;

function buildRequestContext(req) {
  if (
    typeof getRequestContext === 'function'
  ) {
    return getRequestContext(req);
  }

  return {
    ipAddress:
      req.ip || null,
    sessionId:
      req.sessionID || null,
    deviceInfo:
      req.get('user-agent') || null,
  };
}

async function list(req, res) {
  const brands =
    await productBrandService.listBrands({
      user: req.user,
      filters:
        req.validated?.query || {},
    });

  res.status(200).json({
    success: true,
    data: brands,
  });
}

async function getById(req, res) {
  const brand =
    await productBrandService.getBrand({
      user: req.user,
      brandId:
        req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: brand,
  });
}

async function create(req, res) {
  const brand =
    await productBrandService.createBrand({
      user: req.user,
      data:
        req.validated.body,
      requestContext:
        buildRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product brand created successfully.',
    data: brand,
  });
}

async function update(req, res) {
  const brand =
    await productBrandService.updateBrand({
      user: req.user,
      brandId:
        req.validated.params.id,
      data:
        req.validated.body,
      requestContext:
        buildRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product brand updated successfully.',
    data: brand,
  });
}

async function remove(req, res) {
  const brand =
    await productBrandService.deleteBrand({
      user: req.user,
      brandId:
        req.validated.params.id,
      requestContext:
        buildRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product brand deleted successfully.',
    data: brand,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
