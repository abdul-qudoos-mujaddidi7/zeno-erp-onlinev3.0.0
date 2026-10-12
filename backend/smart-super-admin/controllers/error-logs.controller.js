const vm = require("./view-models");
module.exports = (service) => ({
  async list(req, res) {
    const result = await service.list(req.params, req.query);
    res.render("error-logs/list", {
      ...vm.tableModel(result, {
        title: "Error Logs",
        basePath: "list-error-logs",
        query: req.query,
        detail: (row) =>
          "/smart-super-admin/view-error-log/error_logs/" + row.id,
      }),
      errorLogs: true,
    });
  },
  async detail(req, res) {
    const record = await service.detail(req.params.tableName, req.params.id);
    res.render("error-logs/detail", {
      title: "Error Log #" + record.id,
      fields: vm.recordModel(record),
      commandUrl:
        "/smart-super-admin/command/0?org_id=" +
        record.org_id +
        "&user_id=" +
        record.user_id +
        "&tab_ses_id=" +
        encodeURIComponent(record.tab_ses_id || ""),
    });
  },
  async clear(req, res) {
    await service.clear(req.body.action);
    res.redirect(303, "/smart-super-admin/list-error-logs/id/DESC/0/20/1");
  },
});
