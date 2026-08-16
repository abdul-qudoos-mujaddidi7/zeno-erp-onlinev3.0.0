const accountImageService =
  require('../services/account-image.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await accountImageService.listAccountImages({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const accountImage =
    await accountImageService.getAccountImage({
      user: req.user,
      accountImageId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: accountImage,
  });
}

async function create(req, res) {
  const accountImage =
    await accountImageService.createAccountImage({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Account image created successfully.',
    data: accountImage,
  });
}

async function update(req, res) {
  const accountImage =
    await accountImageService.updateAccountImage({
      user: req.user,
      accountImageId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account image updated successfully.',
    data: accountImage,
  });
}

async function remove(req, res) {
  const accountImage =
    await accountImageService.deleteAccountImage({
      user: req.user,
      accountImageId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Account image deleted successfully.',
    data: accountImage,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
