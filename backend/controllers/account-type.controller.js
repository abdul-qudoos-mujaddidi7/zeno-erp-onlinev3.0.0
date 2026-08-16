const accountTypeService =
  require('../services/account-type.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const accountTypes =
    await accountTypeService.listAccountTypes({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: accountTypes,
  });
}

async function getById(req, res) {
  const accountType =
    await accountTypeService.getAccountType({
      user: req.user,
      accountTypeId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: accountType,
  });
}

async function create(req, res) {
  const accountType =
    await accountTypeService.createAccountType({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Account type created successfully.',
    data: accountType,
  });
}

async function update(req, res) {
  const accountType =
    await accountTypeService.updateAccountType({
      user: req.user,
      accountTypeId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account type updated successfully.',
    data: accountType,
  });
}

async function remove(req, res) {
  const accountType =
    await accountTypeService.deleteAccountType({
      user: req.user,
      accountTypeId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account type deleted successfully.',
    data: accountType,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
