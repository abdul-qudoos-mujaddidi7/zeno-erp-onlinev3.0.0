const returnsService =
  require('../services/returns.service');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function listItems(req, res) {
  const result =
    await returnsService.listReturnItems({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

module.exports = {
  listItems,
};
