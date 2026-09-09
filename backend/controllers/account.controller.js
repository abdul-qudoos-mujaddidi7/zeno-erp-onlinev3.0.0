const accountService =
  require('../services/account.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await accountService.listAccounts({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function balances(req, res) {
  const accountIdsRaw =
    req.validated?.query?.account_ids || '';

  const accountIds = String(accountIdsRaw)
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  const data =
    await accountService.listAccountBalances({
      user: req.user,
      filters: {
        status: req.validated?.query?.status ?? 1,
        accountIds: accountIds.length
          ? accountIds
          : null,
      },
    });

  res.status(200).json({
    success: true,
    data,
  });
}

async function creditDebit(req, res) {
  const accountIdsRaw =
    req.validated?.query?.account_ids || '';

  const accountIds = String(accountIdsRaw)
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  const data =
    await accountService.listAccountCreditDebit({
      user: req.user,
      filters: {
        status: req.validated?.query?.status ?? 1,
        accountIds: accountIds.length
          ? accountIds
          : null,
      },
    });

  res.status(200).json({
    success: true,
    data,
  });
}

async function reportBootstrap(req, res) {
  const data =
    await accountService.getReportBootstrap({
      user: req.user,
      filters: {
        status: req.validated?.query?.status ?? 1,
      },
    });

  res.status(200).json({
    success: true,
    data,
  });
}

async function getById(req, res) {
  const account =
    await accountService.getAccount({
      user: req.user,
      accountId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: account,
  });
}

async function create(req, res) {
  const account =
    await accountService.createAccount({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Account created successfully.',
    data: account,
  });
}

async function update(req, res) {
  const account =
    await accountService.updateAccount({
      user: req.user,
      accountId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account updated successfully.',
    data: account,
  });
}

async function remove(req, res) {
  const account =
    await accountService.deleteAccount({
      user: req.user,
      accountId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account deleted successfully.',
    data: account,
  });
}

async function productItems(req, res) {
  const result =
    await accountService.listAccountProductItems({
      user: req.user,
      accountId: req.validated.params.id,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function allProductItems(req, res) {
  const result =
    await accountService.listAccountProductItems({
      user: req.user,
      accountId: null,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

module.exports = {
  list,
  balances,
  creditDebit,
  reportBootstrap,
  productItems,
  allProductItems,
  getById,
  create,
  update,
  remove,
};
