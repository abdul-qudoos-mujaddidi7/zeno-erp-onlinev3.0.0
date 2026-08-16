const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const apartmentController =
  require('../../controllers/apartment.controller');

const {
  createApartmentSchema,
  updateApartmentSchema,
  apartmentIdParamsSchema,
  apartmentListQuerySchema,
} = require('../../validators/apartment.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: apartmentListQuerySchema,
  }),
  asyncHandler(
    apartmentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: apartmentIdParamsSchema,
  }),
  asyncHandler(
    apartmentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createApartmentSchema,
  }),
  asyncHandler(
    apartmentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: apartmentIdParamsSchema,
    body: updateApartmentSchema,
  }),
  asyncHandler(
    apartmentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: apartmentIdParamsSchema,
  }),
  asyncHandler(
    apartmentController.remove,
  ),
);

module.exports = router;
