const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const leaseController =
  require('../../controllers/lease.controller');

const {
  createLeaseSchema,
  updateLeaseSchema,
  leaseIdParamsSchema,
  leaseListQuerySchema,
} = require('../../validators/lease.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: leaseListQuerySchema,
  }),
  asyncHandler(
    leaseController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: leaseIdParamsSchema,
  }),
  asyncHandler(
    leaseController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createLeaseSchema,
  }),
  asyncHandler(
    leaseController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: leaseIdParamsSchema,
    body: updateLeaseSchema,
  }),
  asyncHandler(
    leaseController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: leaseIdParamsSchema,
  }),
  asyncHandler(
    leaseController.remove,
  ),
);

module.exports = router;
