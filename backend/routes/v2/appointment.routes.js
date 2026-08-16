const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const appointmentController =
  require('../../controllers/appointment.controller');

const {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentIdParamsSchema,
  appointmentListQuerySchema,
} = require('../../validators/appointment.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: appointmentListQuerySchema,
  }),
  asyncHandler(
    appointmentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: appointmentIdParamsSchema,
  }),
  asyncHandler(
    appointmentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createAppointmentSchema,
  }),
  asyncHandler(
    appointmentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: appointmentIdParamsSchema,
    body: updateAppointmentSchema,
  }),
  asyncHandler(
    appointmentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: appointmentIdParamsSchema,
  }),
  asyncHandler(
    appointmentController.remove,
  ),
);

module.exports = router;
