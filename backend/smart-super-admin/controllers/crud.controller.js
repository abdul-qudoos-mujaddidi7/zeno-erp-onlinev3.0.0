const vm = require("./view-models");
const createLabels = {
  "org-types": "New Type",
  features: "New Feature",
  "subscription-plans": "New Subscription Plan",
  subscriptions: "New Subscription",
};

module.exports = (service, key) => ({
  async list(req, res) {
    const result = await service.list(req.params, req.query);
    const path = service.config.path;
    res.render(key + "/list", {
      ...vm.tableModel(result, {
        title: service.config.title,
        basePath: "list-" + key,
        detail: (row) =>
          `/smart-super-admin/${path}/${row.id}${key === "subscriptions" ? "/" + (row.org_id || 0) : ""}`,
        createUrl: `/smart-super-admin/${path}${key === "subscriptions" ? "/0/" + res.locals.orgId : ""}`,
        createLabel: createLabels[key] || "New",
        query: req.query,
        extraActions: (row) => [
          {
            label: "Edit",
            url: `/smart-super-admin/${path}/${row.id}${key === "subscriptions" ? "/" + (row.org_id || 0) : ""}`,
          },
          ...(key === "subscriptions"
            ? [
                {
                  label: "Invoices",
                  url: "/smart-super-admin/invoices/" + row.id,
                },
                {
                  label: "New invoice",
                  url: "/smart-super-admin/invoice/new/" + row.id,
                },
              ]
            : []),
        ],
      }),
      filterEnabled: true,
    });
  },
  async form(req, res) {
    res.render(
      key + "/form",
      await service.form(
        req.params.id || 0,
        req.params.orgId || res.locals.orgId,
      ),
    );
  },
  async save(req, res) {
    await service.save(req.body);
    res.redirect(303, `/smart-super-admin/list-${key}/id/DESC/0/20/1`);
  },
});
