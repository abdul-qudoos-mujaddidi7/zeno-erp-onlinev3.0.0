const userService =
  require('../services/user.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await userService.listUsers({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const user =
    await userService.getUser({
      user: req.user,
      userId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: user,
  });
}

async function create(req, res) {
  const user =
    await userService.createUser({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'User created successfully.',
    data: user,
  });
}

async function update(req, res) {
  const user =
    await userService.updateUser({
      user: req.user,
      userId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User updated successfully.',
    data: user,
  });
}

async function remove(req, res) {
  const user =
    await userService.deleteUser({
      user: req.user,
      userId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User deleted successfully.',
    data: user,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
