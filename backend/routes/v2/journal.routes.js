const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const journalController =
  require('../../controllers/journal.controller');

const {
  createJournalSchema,
  updateJournalSchema,
  journalIdParamsSchema,
  journalListQuerySchema,
} = require('../../validators/journal.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: journalListQuerySchema,
  }),
  asyncHandler(
    journalController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: journalIdParamsSchema,
  }),
  asyncHandler(
    journalController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createJournalSchema,
  }),
  asyncHandler(
    journalController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: journalIdParamsSchema,
    body: updateJournalSchema,
  }),
  asyncHandler(
    journalController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: journalIdParamsSchema,
  }),
  asyncHandler(
    journalController.remove,
  ),
);

module.exports = router;
