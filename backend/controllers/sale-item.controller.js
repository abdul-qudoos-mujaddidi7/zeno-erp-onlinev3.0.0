const saleItemService =
  require('../services/sale-item.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const saleItems =
    await saleItemService.listSaleItems({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: saleItems,
  });
}

async function getById(req, res) {
  const saleItem =
    await saleItemService.getSaleItem({
      user: req.user,
      saleItemId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: saleItem,
  });
}

async function create(req, res) {
  const saleItem =
    await saleItemService.createSaleItem({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Sale item created successfully.',
    data: saleItem,
  });
}

async function update(req, res) {
  const saleItem =
    await saleItemService.updateSaleItem({
      user: req.user,
      saleItemId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Sale item updated successfully.',
    data: saleItem,
  });
}

async function remove(req, res) {
  const saleItem =
    await saleItemService.deleteSaleItem({
      user: req.user,
      saleItemId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Sale item deleted successfully.',
    data: saleItem,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
