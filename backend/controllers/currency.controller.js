const currencyService =
  require('../services/currency.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const currencies =
    await currencyService.listCurrencies({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: currencies,
  });
}

async function getById(req, res) {
  const currency =
    await currencyService.getCurrency({
      user: req.user,
      currencyId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: currency,
  });
}

async function create(req, res) {
  const currency =
    await currencyService.createCurrency({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Currency created successfully.',
    data: currency,
  });
}

async function update(req, res) {
  const currency =
    await currencyService.updateCurrency({
      user: req.user,
      currencyId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Currency updated successfully.',
    data: currency,
  });
}

async function remove(req, res) {
  const currency =
    await currencyService.deleteCurrency({
      user: req.user,
      currencyId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Currency deleted successfully.',
    data: currency,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
