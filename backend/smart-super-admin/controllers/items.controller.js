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
        download: (row) => `/smart-super-admin/download/${name}/${row.id}`,
      }),
    });
  },
  async download(req, res) {
    const { tableName, id } = req.params;
    const record = await service.record(tableName, id);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${tableName}-${id}.json"`,
    );
    res.send(JSON.stringify(vm.clean(record), null, 2));
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
});
