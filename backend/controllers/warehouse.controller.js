const warehouseService =
  require('../services/warehouse.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const warehouses =
    await warehouseService.listWarehouses({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: warehouses,
  });
}

async function getById(req, res) {
  const warehouse =
    await warehouseService.getWarehouse({
      user: req.user,
      warehouseId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: warehouse,
  });
}

async function create(req, res) {
  const warehouse =
    await warehouseService.createWarehouse({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Warehouse created successfully.',
    data: warehouse,
  });
}

async function update(req, res) {
  const warehouse =
    await warehouseService.updateWarehouse({
      user: req.user,
      warehouseId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Warehouse updated successfully.',
    data: warehouse,
  });
}

async function remove(req, res) {
  const warehouse =
    await warehouseService.deleteWarehouse({
      user: req.user,
      warehouseId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Warehouse deleted successfully.',
    data: warehouse,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
