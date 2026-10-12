module.exports = (service) => ({
  async index(req, res) {
    const result = await service.index();
    res.render("dashboard", {
      title: "Dashboard",
      organizations: result.rows,
      total: result.total,
    });
  },
  async selectOrg(req, res) {
    const selected = await service.select(req.params.orgId);
    if (!req.session)
      throw Object.assign(new Error("Host session middleware is required"), {
        status: 503,
      });
    req.session.selectedOrganizationId = selected;
    await new Promise((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    res.redirect(303, "/smart-super-admin");
  },
  async options(req, res) {
    res.json(await service.options(req.query.q || ""));
  },
});
