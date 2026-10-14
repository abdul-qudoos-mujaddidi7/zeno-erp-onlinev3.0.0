const vm = require("./view-models");
const dates = require("../helpers/date-helpers");
const INVOICE_FIELDS = [
  ["invoice_number", "text"],
  ["invoice_status", "select"],
  ["billing_start_date", "datetime-local"],
  ["billing_end_date", "datetime-local"],
  ["invoice_date", "datetime-local"],
  ["due_date", "datetime-local"],
  ["total_amount", "number"],
  ["paid_amount", "number"],
  ["currency", "text"],
  ["description", "textarea"],
];
function formModel(model) {
  return {
    ...model,
    title: model.record.id ? "Edit invoice" : "New invoice",
    fields: INVOICE_FIELDS.map(([name, type]) => ({
      name,
      label: name.replaceAll("_", " "),
      value:
        type === "datetime-local"
          ? dates.getLocalDateTime(model.record[name])
          : (model.record[name] ?? ""),
      inputType: type,
      textarea: type === "textarea",
      select: type === "select",
      choices:
        type === "select"
          ? ["draft", "sent", "paid", "partial", "overdue", "cancelled"].map(
              (id) => ({ id, label: id, selected: id === model.record[name] }),
            )
          : [],
    })),
    paymentDate: dates.getLocalDateTime(new Date()),
  };
}
module.exports = (service) => ({
  async list(req, res) {
    const result = await service.list(req.params.subscriptionId, req.query);
    const model = vm.tableModel(result, {
      title: "Invoices",
      basePath: "invoices",
      query: req.query,
      detail: (row) => "/smart-super-admin/invoice/view/" + row.id,
      createLabel: "New Invoice",
      extraActions: (row) => [
        {
          label: "Edit",
          url: "/smart-super-admin/invoice/edit/" + row.id,
        },
      ],
      createUrl: "/smart-super-admin/invoice/new/" + req.params.subscriptionId,
    });
    const url = (sort, dir, limit, page) =>
      "/smart-super-admin/invoices/" +
      req.params.subscriptionId +
      "?" +
      new URLSearchParams({
        sort,
        dir,
        limit,
        page,
        q: typeof req.query.q === "string" ? req.query.q : "",
      });
    model.columns = model.columns.map((column) => ({
      ...column,
      url: url(
        column.name,
        result.sort === column.name && result.direction === "ASC"
          ? "DESC"
          : "ASC",
        result.limit,
        1,
      ),
    }));
    model.limits = model.limits.map((item) => ({
      ...item,
      url: url(result.sort, result.direction, item.limit, 1),
    }));
    const pagination = require("../helpers/handlebars-helpers").buildPagination(
      result.page,
      result.totalPages,
      "",
    );
    pagination.pages = pagination.pages.map((page) => ({
      ...page,
      url: url(result.sort, result.direction, result.limit, page.number),
    }));
    pagination.previous =
      result.page > 1
        ? url(result.sort, result.direction, result.limit, result.page - 1)
        : null;
    pagination.next =
      result.page < result.totalPages
        ? url(result.sort, result.direction, result.limit, result.page + 1)
        : null;
    res.render("invoices/list", {
      ...model,
      subscription: result.subscription,
      pagination,
    });
  },
  async form(req, res) {
    res.render(
      "invoices/form",
      formModel(await service.form(req.params.subscriptionId)),
    );
  },
  async editForm(req, res) {
    res.render(
      "invoices/form",
      formModel(await service.form(null, req.params.invoiceId)),
    );
  },
  async view(req, res) {
    const model = await service.invoice(req.params.invoiceId);
    res.render("invoices/view", {
      ...model,
      title: "Invoice " + model.record.invoice_number,
      fields: vm.recordModel(model.record),
      paymentDate: dates.getLocalDateTime(new Date()),
    });
  },
  async save(req, res) {
    const id = await service.save(req.body);
    res.redirect(303, "/smart-super-admin/invoice/view/" + id);
  },
  async savePayment(req, res) {
    const id = await service.savePayment(req.body);
    res.redirect(303, "/smart-super-admin/invoice/view/" + id);
  },
});
