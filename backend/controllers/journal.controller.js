const journalService =
  require('../services/journal.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

const {
  sendListResponse,
} = require('../utils/listResponse');

async function list(req, res) {
  const result =
    await journalService.listJournals({
      user: req.user,
      filters: req.validated.query,
    });

  return sendListResponse(res, result);
}

async function getById(req, res) {
  const journal =
    await journalService.getJournal({
      user: req.user,
      journalId: req.params.id,
    });

  return res.json({
    success: true,
    data: journal,
  });
}

async function create(req, res) {
  const journal =
    await journalService.createJournal({
      user: req.user,
      data: req.body,
      requestContext: getRequestContext(req),
    });

  return res.status(201).json({
    success: true,
    data: journal,
  });
}

async function update(req, res) {
  const journal =
    await journalService.updateJournal({
      user: req.user,
      journalId: req.params.id,
      data: req.body,
      requestContext: getRequestContext(req),
    });

  return res.json({
    success: true,
    data: journal,
  });
}

async function remove(req, res) {
  const journal =
    await journalService.deleteJournal({
      user: req.user,
      journalId: req.params.id,
      requestContext: getRequestContext(req),
    });

  return res.json({
    success: true,
    data: journal,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
