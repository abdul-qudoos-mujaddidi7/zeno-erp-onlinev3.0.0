const warehouseProductService =
  require('../services/warehouse-product.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const warehouseProducts =
    await warehouseProductService.listWarehouseProducts({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: warehouseProducts,
  });
}

async function getById(req, res) {
  const warehouseProduct =
    await warehouseProductService.getWarehouseProduct({
      user: req.user,
      warehouseProductId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: warehouseProduct,
  });
}

async function create(req, res) {
  const warehouseProduct =
    await warehouseProductService.createWarehouseProduct({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Warehouse product created successfully.',
    data: warehouseProduct,
  });
}

async function update(req, res) {
  const warehouseProduct =
    await warehouseProductService.updateWarehouseProduct({
      user: req.user,
      warehouseProductId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Warehouse product updated successfully.',
    data: warehouseProduct,
  });
}

async function remove(req, res) {
  const warehouseProduct =
    await warehouseProductService.deleteWarehouseProduct({
      user: req.user,
      warehouseProductId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Warehouse product deleted successfully.',
    data: warehouseProduct,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
