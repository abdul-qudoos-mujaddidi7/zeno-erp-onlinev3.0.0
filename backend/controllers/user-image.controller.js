const userImageService =
  require('../services/user-image.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const userImages =
    await userImageService.listUserImages({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: userImages,
  });
}

async function getById(req, res) {
  const userImage =
    await userImageService.getUserImage({
      user: req.user,
      userImageId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: userImage,
  });
}

async function create(req, res) {
  const userImage =
    await userImageService.createUserImage({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'User image created successfully.',
    data: userImage,
  });
}

async function update(req, res) {
  const userImage =
    await userImageService.updateUserImage({
      user: req.user,
      userImageId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User image updated successfully.',
    data: userImage,
  });
}

async function remove(req, res) {
  const userImage =
    await userImageService.deleteUserImage({
      user: req.user,
      userImageId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'User image deleted successfully.',
    data: userImage,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
