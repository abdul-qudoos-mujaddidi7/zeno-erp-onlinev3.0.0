const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const departmentController =
  require('../../controllers/department.controller');

const {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentIdParamsSchema,
  departmentListQuerySchema,
} = require('../../validators/department.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: departmentListQuerySchema,
  }),
  asyncHandler(
    departmentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: departmentIdParamsSchema,
  }),
  asyncHandler(
    departmentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createDepartmentSchema,
  }),
  asyncHandler(
    departmentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: departmentIdParamsSchema,
    body: updateDepartmentSchema,
  }),
  asyncHandler(
    departmentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: departmentIdParamsSchema,
  }),
  asyncHandler(
    departmentController.remove,
  ),
);

module.exports = router;
