const express = require("express");

const auth = require("../../middleware/auth");
const asyncHandler = require("../../middleware/asyncHandler");
const systemController = require("../../controllers/system.controller");

const router = express.Router();

router.get(
  "/health",
  asyncHandler(systemController.health),
);

router.get(
  "/info",
  asyncHandler(systemController.registrationInfo),
);

router.get(
  "/loadimage/:table/:fieldName/:serveid/:token",
  auth,
  asyncHandler(systemController.loadImage),
);

router.get(
  "/me",
  auth,
  asyncHandler(systemController.me),
);

router.get(
  "/inventory-method",
  auth,
  asyncHandler(systemController.inventoryMethod),
);

module.exports = router;
