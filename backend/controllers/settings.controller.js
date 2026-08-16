const settingsService =
  require('../services/settings.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const settings =
    await settingsService.listSettings({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: settings,
  });
}

async function getById(req, res) {
  const setting =
    await settingsService.getSetting({
      user: req.user,
      settingId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: setting,
  });
}

async function create(req, res) {
  const setting =
    await settingsService.createSetting({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Setting created successfully.',
    data: setting,
  });
}

async function update(req, res) {
  const setting =
    await settingsService.updateSetting({
      user: req.user,
      settingId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Setting updated successfully.',
    data: setting,
  });
}

async function remove(req, res) {
  const setting =
    await settingsService.deleteSetting({
      user: req.user,
      settingId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Setting deleted successfully.',
    data: setting,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
