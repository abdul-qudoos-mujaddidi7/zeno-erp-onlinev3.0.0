const vm = require("./view-models");
module.exports = (service) => ({
  async grid(req, res) {
    const result = await service.grid(req.query);
    res.render("organizations/grid", {
      title: "Organizations",
      organizations: result.rows,
      total: result.total,
      pagination: require("../helpers/handlebars-helpers").buildPagination(
        result.page,
        result.totalPages,
        "/smart-super-admin/organizations?page=",
      ),
    });
  },
  async list(req, res) {
    const result = await service.list(req.params, req.query);
    res.render(
      "organizations/list",
      vm.tableModel(result, {
        title: "Organization List",
        basePath: "organization-list",
        query: req.query,
        detail: (row) => "/smart-super-admin/select-org/" + row.id,
        extraActions: (row) => [
          {
            label: "Users",
            url: `/smart-super-admin/list/users/id/DESC/${row.id}/20/1`,
          },
          {
            label: row.subscription_id ? "Subscription" : "New subscription",
            url: `/smart-super-admin/subscription/${row.subscription_id || 0}/${row.id}`,
          },
        ],
      }),
    );
  },
});
