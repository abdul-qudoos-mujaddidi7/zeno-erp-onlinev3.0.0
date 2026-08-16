const apartmentService =
  require('../services/apartment.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await apartmentService.listApartments({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await apartmentService.getApartment({
      user: req.user,
      apartmentId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await apartmentService.createApartment({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Apartment created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await apartmentService.updateApartment({
      user: req.user,
      apartmentId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Apartment updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await apartmentService.deleteApartment({
      user: req.user,
      apartmentId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Apartment deleted successfully.',
    data: record,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
