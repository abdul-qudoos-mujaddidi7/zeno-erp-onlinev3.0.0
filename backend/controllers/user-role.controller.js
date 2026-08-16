const userRoleService =
  require('../services/user-role.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const userRoles =
    await userRoleService.listUserRoles({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: userRoles,
  });
}

async function getById(req, res) {
  const userRole =
    await userRoleService.getUserRole({
      user: req.user,
      userRoleId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: userRole,
  });
}

async function create(req, res) {
  const userRole =
    await userRoleService.createUserRole({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'User role created successfully.',
    data: userRole,
  });
}

async function update(req, res) {
  const userRole =
    await userRoleService.updateUserRole({
      user: req.user,
      userRoleId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User role updated successfully.',
    data: userRole,
  });
}

async function remove(req, res) {
  const userRole =
    await userRoleService.deleteUserRole({
      user: req.user,
      userRoleId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User role deleted successfully.',
    data: userRole,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
