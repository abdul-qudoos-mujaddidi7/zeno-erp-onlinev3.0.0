const vm = require("./view-models");
module.exports = (service) => ({
  async list(req, res) {
    const result = await service.list(req.params, req.query);
    res.render(
      "commands/list",
      vm.tableModel(result, {
        title: "Commands",
        basePath: "list-commands",
        query: req.query,
        detail: (row) => "/smart-super-admin/command/" + row.id,
        createUrl: "/smart-super-admin/command/0",
      }),
    );
  },
  async detail(req, res) {
    const record = await service.detail(req.params.commandId, res.locals.orgId);
    if (!record.id) {
      record.user_id = /^\d+$/.test(req.query.user_id || "")
        ? req.query.user_id
        : "";
      record.tab_ses_id =
        typeof req.query.tab_ses_id === "string" ? req.query.tab_ses_id : "";
      if (/^\d+$/.test(req.query.org_id || ""))
        record.org_id = req.query.org_id;
    }
    res.render("commands/detail", {
      title: "Command editor",
      command: record,
      fields: vm.recordModel(record),
      monaco: true,
    });
  },
  async execute(req, res) {
    const id = await service.execute(req.body, res.locals.userName);
    res.json({ success: true, id });
  },
  async result(req, res) {
    res.json(await service.result(req.params.commandId));
  },
});
