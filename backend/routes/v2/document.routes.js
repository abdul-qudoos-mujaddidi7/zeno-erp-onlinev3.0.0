const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const documentController =
  require('../../controllers/document.controller');

const {
  createDocumentSchema,
  updateDocumentSchema,
  documentIdParamsSchema,
  documentListQuerySchema,
} = require('../../validators/document.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: documentListQuerySchema,
  }),
  asyncHandler(
    documentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: documentIdParamsSchema,
  }),
  asyncHandler(
    documentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createDocumentSchema,
  }),
  asyncHandler(
    documentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: documentIdParamsSchema,
    body: updateDocumentSchema,
  }),
  asyncHandler(
    documentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: documentIdParamsSchema,
  }),
  asyncHandler(
    documentController.remove,
  ),
);

module.exports = router;
