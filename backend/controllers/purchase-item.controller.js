const purchaseItemService =
  require('../services/purchase-item.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await purchaseItemService.listPurchaseItems({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const purchaseItem =
    await purchaseItemService.getPurchaseItem({
      user: req.user,
      purchaseItemId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: purchaseItem,
  });
}

async function create(req, res) {
  const purchaseItem =
    await purchaseItemService.createPurchaseItem({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Purchase item created successfully.',
    data: purchaseItem,
  });
}

async function update(req, res) {
  const purchaseItem =
    await purchaseItemService.updatePurchaseItem({
      user: req.user,
      purchaseItemId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Purchase item updated successfully.',
    data: purchaseItem,
  });
}

async function remove(req, res) {
  const purchaseItem =
    await purchaseItemService.deletePurchaseItem({
      user: req.user,
      purchaseItemId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Purchase item deleted successfully.',
    data: purchaseItem,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
