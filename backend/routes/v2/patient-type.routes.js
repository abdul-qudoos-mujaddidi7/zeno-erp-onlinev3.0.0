const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const patientTypeController =
  require('../../controllers/patient-type.controller');

const {
  createPatientTypeSchema,
  updatePatientTypeSchema,
  patientTypeIdParamsSchema,
  patientTypeListQuerySchema,
} = require('../../validators/patient-type.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: patientTypeListQuerySchema,
  }),
  asyncHandler(
    patientTypeController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: patientTypeIdParamsSchema,
  }),
  asyncHandler(
    patientTypeController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPatientTypeSchema,
  }),
  asyncHandler(
    patientTypeController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: patientTypeIdParamsSchema,
    body: updatePatientTypeSchema,
  }),
  asyncHandler(
    patientTypeController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: patientTypeIdParamsSchema,
  }),
  asyncHandler(
    patientTypeController.remove,
  ),
);

module.exports = router;
