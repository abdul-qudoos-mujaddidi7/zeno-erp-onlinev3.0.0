const departmentService =
  require('../services/department.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const departments =
    await departmentService.listDepartments({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: departments,
  });
}

async function getById(req, res) {
  const department =
    await departmentService.getDepartment({
      user: req.user,
      departmentId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: department,
  });
}

async function create(req, res) {
  const department =
    await departmentService.createDepartment({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Department created successfully.',
    data: department,
  });
}

async function update(req, res) {
  const department =
    await departmentService.updateDepartment({
      user: req.user,
      departmentId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Department updated successfully.',
    data: department,
  });
}

async function remove(req, res) {
  const department =
    await departmentService.deleteDepartment({
      user: req.user,
      departmentId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Department deleted successfully.',
    data: department,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
