const service = require('../services/stock-adjustment.service');
const { getRequestContext } = require('../utils/requestContext');

async function list(req, res) {
  res.json({ success: true, data: await service.listStockAdjustments({ user: req.user, filters: req.validated.query }) });
}
async function getById(req, res) {
  res.json({ success: true, data: await service.getStockAdjustment({ user: req.user, adjustmentId: req.validated.params.id }) });
}
async function create(req, res) {
  const adjustment = await service.createStockAdjustment({ user: req.user, data: req.validated.body, requestContext: getRequestContext(req) });
  res.status(201).json({ success: true, message: 'Stock adjusted successfully.', data: adjustment });
}
async function zero(req, res) {
  const adjustment = await service.zeroStockAdjustment({ user: req.user, data: req.validated.body, requestContext: getRequestContext(req) });
  res.status(201).json({ success: true, message: 'Stock zeroed successfully.', data: adjustment });
}
async function zeroAll(req, res) {
  const summary = await service.zeroAllStock({ user: req.user, data: req.validated.body, requestContext: getRequestContext(req) });
  res.status(201).json({ success: true, message: 'Stock zeroed for all products.', data: summary });
}
async function report(req, res) {
  res.json({ success: true, data: await service.getAdjustmentReport({ user: req.user, filters: req.validated.query }) });
}
module.exports = { list, getById, create, zero, zeroAll, report };
