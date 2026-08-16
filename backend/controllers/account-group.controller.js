const accountGroupService =
  require('../services/account-group.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const accountGroups =
    await accountGroupService.listAccountGroups({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: accountGroups,
  });
}

async function getById(req, res) {
  const accountGroup =
    await accountGroupService.getAccountGroup({
      user: req.user,
      accountGroupId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: accountGroup,
  });
}

async function create(req, res) {
  const accountGroup =
    await accountGroupService.createAccountGroup({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Account group created successfully.',
    data: accountGroup,
  });
}

async function update(req, res) {
  const accountGroup =
    await accountGroupService.updateAccountGroup({
      user: req.user,
      accountGroupId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account group updated successfully.',
    data: accountGroup,
  });
}

async function remove(req, res) {
  const accountGroup =
    await accountGroupService.deleteAccountGroup({
      user: req.user,
      accountGroupId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account group deleted successfully.',
    data: accountGroup,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
