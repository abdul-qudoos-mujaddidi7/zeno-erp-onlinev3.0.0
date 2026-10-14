module.exports = (service) => ({
  async index(req, res) {
    const result = await service.summary();
    res.render("dashboard", {
      title: "Dashboard",
      ...result,
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
    const redirectTo = organizationReturnPath(req.query.returnTo, selected);
    res.redirect(303, redirectTo);
  },
  async options(req, res) {
    res.json(await service.options(req.query.q || ""));
  },
  async quickSearch(req, res) {
    res.json(await service.quickSearch(req.query.q || ""));
  },
});

function organizationReturnPath(value, orgId) {
  const fallback = "/smart-super-admin";
  if (typeof value !== "string") return fallback;
  let url;
  try {
    url = new URL(value, "http://smart-super-admin.local");
  } catch {
    return fallback;
  }
  if (
    url.origin !== "http://smart-super-admin.local" ||
    !(
      url.pathname === "/smart-super-admin" ||
      url.pathname.startsWith("/smart-super-admin/")
    )
  )
    return fallback;
  const pathname = url.pathname
    .replace(
      /^(\/smart-super-admin\/list\/[^/]+\/[^/]+\/[^/]+\/)\d+(\/[^/]+\/[^/]+)$/,
      (match, prefix, suffix) => prefix + orgId + suffix,
    )
    .replace(
      /^(\/smart-super-admin\/(?:organization-list|list-subscriptions)\/[^/]+\/[^/]+\/)\d+(\/[^/]+\/[^/]+)$/,
      (match, prefix, suffix) => prefix + orgId + suffix,
    );
  return pathname + url.search + url.hash;
}
