const { id } = require('../validators/organizations');
module.exports = repository => async (req, res, next) => {
  res.locals.canReadOrganizations = req.platformAdmin.permissions.includes('organizations.read');
  res.locals.canSelectOrganization = res.locals.canReadOrganizations && req.platformAdmin.permissions.includes('organizations.select');
  res.locals.overviewActive = req.path === '/';
  res.locals.contextName = res.locals.labels.allOrganizations;
  res.locals.allOrganizationsMode = true;
  const stored = req.session.selectedOrganizationId;
  if (stored !== undefined && res.locals.canReadOrganizations) {
    const parsed = id.safeParse(String(stored));
    const organization = parsed.success ? await repository.find(parsed.data) : null;
    if (organization) {
      req.selectedOrganizationId = organization.id;
      res.locals.contextName = organization.name;
      res.locals.allOrganizationsMode = false;
    } else {
      delete req.session.selectedOrganizationId;
      res.locals.contextReset = true;
    }
  }
  if (!res.locals.canReadOrganizations) delete req.session.selectedOrganizationId;
  next();
};
