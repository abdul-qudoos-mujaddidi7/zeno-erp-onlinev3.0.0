const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const returnsController =
  require('../../controllers/returns.controller');

const {
  returnsListQuerySchema,
} = require('../../validators/returns.validator');

const router = express.Router();

router.get(
  '/items',
  validate({
    query: returnsListQuerySchema,
  }),
  asyncHandler(
    returnsController.listItems,
  ),
);

module.exports = router;
