const leaseService =
  require('../services/lease.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await leaseService.listLeases({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const record =
    await leaseService.getLease({
      user: req.user,
      leaseId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: record,
  });
}

async function create(req, res) {
  const record =
    await leaseService.createLease({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Lease created successfully.',
    data: record,
  });
}

async function update(req, res) {
  const record =
    await leaseService.updateLease({
      user: req.user,
      leaseId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lease updated successfully.',
    data: record,
  });
}

async function remove(req, res) {
  const record =
    await leaseService.deleteLease({
      user: req.user,
      leaseId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Lease deleted successfully.',
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
