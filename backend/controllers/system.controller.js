const systemService = require("../services/system.service");

async function health(req, res) {
  const data = await systemService.getHealth();

  res.status(200).json({
    success: true,
    data,
  });
}

async function me(req, res) {
  res.status(200).json({
    success: true,
    data: systemService.getAuthenticatedUser(req.user),
  });
}

async function inventoryMethod(req, res) {
  const data = await systemService.getInventoryMethod(req.user);

  res.status(200).json({
    success: true,
    inventory_method: data.inventory_method,
    data,
  });
}

async function registrationInfo(req, res) {
  const data = await systemService.getRegistrationInfo();

  res.status(200).json({
    success: true,
    data,
  });
}

async function loadImage(req, res) {
  const image = await systemService.loadImage({
    table: req.params.table,
    fieldName: req.params.fieldName,
    serveId: req.params.serveid,
    token: req.params.token,
  });

  res.set("Content-Type", image.mimeType);
  res.send(image.buffer);
}

module.exports = {
  health,
  me,
  inventoryMethod,
  registrationInfo,
  loadImage,
};
