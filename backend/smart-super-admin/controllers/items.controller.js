const vm = require("./view-models");
module.exports = (service) => ({
  async list(req, res) {
    const result = await service.list(req.params, req.query);
    const name = req.params.tableName;
    res.render("items/list", {
      ...vm.tableModel(result, {
        title: name.replaceAll("_", " "),
        basePath: "list/" + name,
        query: req.query,
        detail: (row) => `/smart-super-admin/view/${name}/${row.id}`,
      }),
      syncLogs: name === "sync_logs",
    });
  },
  async detail(req, res) {
    const { record, related } = await service.detail(
      req.params.tableName,
      req.params.id,
    );
    res.render("items/detail", {
      title: req.params.tableName.replaceAll("_", " ") + " #" + record.id,
      fields: vm.recordModel(record, req.params.tableName),
      changes: vm.changes(record),
      related: related.map((section) => ({
        ...section,
        rows: section.rows.map((row) => vm.recordModel(row)),
      })),
    });
  },
  async clearSync(req, res) {
    if (req.body.action !== "clear_logs")
      throw Object.assign(new Error("Invalid log action"), { status: 400 });
    await service.clearSync();
    res.redirect(303, "/smart-super-admin/list/sync_logs/id/DESC/0/20/1");
  },
});
