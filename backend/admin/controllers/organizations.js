module.exports = (service, authService) => ({
  async list(req, res) { res.render('organizations/list', await service.list(req.query, res.locals.labels, req.selectedOrganizationId)); },
  async detail(req, res) { res.render('organizations/detail', await service.detail(req.params.id, res.locals.labels, req.selectedOrganizationId)); },
  async select(req, res) {
    const selectedId = await service.select(req.body);
    await authService.audit('organization.selected', 'success', { ip: req.ip }, {
      actorId: req.platformAdmin.id, targetId: req.platformAdmin.id,
      detailCode: selectedId === null ? 'all_organizations' : 'organization_id_' + selectedId,
    });
    if (selectedId === null) delete req.session.selectedOrganizationId;
    else req.session.selectedOrganizationId = selectedId;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect(303, '/superadmin/organizations');
  },
});
