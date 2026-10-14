const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const helpers = require("../smart-super-admin/helpers/handlebars-helpers");
const dates = require("../smart-super-admin/helpers/date-helpers");
const database = require("../smart-super-admin/services/database");

test("database failures return a rendered 503 without leaking database details", async () => {
  const express = require("express");
  const parent = express();
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      skipAccessControl: true,
      pool: {
        execute: async () => {
          throw Object.assign(new Error("PRIVATE_DATABASE_DETAIL"), {
            code: "TEST_UNAVAILABLE",
          });
        },
      },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin`,
    );
    assert.equal(response.status, 503);
    const html = await response.text();
    assert.match(html, /database operation could not be completed/);
    assert.doesNotMatch(html, /PRIVATE_DATABASE_DETAIL|TEST_UNAVAILABLE/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("removed error-log, command, and sync-log routes return 404", async () => {
  const express = require("express");
  const parent = express();
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      skipAccessControl: true,
      pool: { execute: async () => [[]] },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/smart-super-admin`;
    for (const route of [
      "/list-error-logs/id/DESC/0/20/1",
      "/view-error-log/error_logs/1",
      "/list-commands/id/DESC/0/20/1",
      "/command/1",
      "/command-result/1",
      "/list/sync_logs/id/DESC/0/20/1",
      "/view/sync_logs/1",
    ]) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
    for (const route of [
      "/error-logs/clear",
      "/command/execute",
      "/list/sync_logs",
    ]) {
      assert.equal(
        (
          await fetch(base + route, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "",
          })
        ).status,
        404,
        route,
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("organization selection returns to the current page and updates its organization filter", async () => {
  const controller = require("../smart-super-admin/controllers/dashboard.controller")({
    select: async (id) => Number(id),
  });
  for (const [returnTo, expected] of [
    [
      "/smart-super-admin/list/products/name/ASC/0/20/2?q=soap",
      "/smart-super-admin/list/products/name/ASC/42/20/2?q=soap",
    ],
    [
      "/smart-super-admin/organization-list/name/ASC/0/20/2",
      "/smart-super-admin/organization-list/name/ASC/42/20/2",
    ],
    [
      "/smart-super-admin/list-subscriptions/id/DESC/0/20/1",
      "/smart-super-admin/list-subscriptions/id/DESC/42/20/1",
    ],
    [
      "https://example.com/unsafe",
      "/smart-super-admin",
    ],
  ]) {
    let redirect;
    const req = {
      params: { orgId: "42" },
      query: { returnTo },
      session: { save: (callback) => callback(null) },
    };
    await controller.selectOrg(req, {
      redirect: (status, url) => {
        redirect = { status, url };
      },
    });
    assert.deepEqual(redirect, { status: 303, url: expected });
  }
});

test("quick search returns bounded organization and subscription matches", async () => {
  const express = require("express");
  const parent = express();
  const statements = [];
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      skipAccessControl: true,
      pool: {
        execute: async (sql, values) => {
          statements.push({ sql, values });
          if (sql.includes("FROM organizations"))
            return [[{ id: 315, name: "Northwind" }]];
          if (sql.includes("FROM subscriptions"))
            return [
              [
                {
                  id: 87,
                  organizationId: 315,
                  organizationName: "Northwind",
                  planName: "Growth",
                  status: "active",
                },
              ],
            ];
          throw new Error("Unexpected quick-search query");
        },
      },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/smart-super-admin/quick-search`;
    const shortQuery = await fetch(`${base}?q=N`);
    assert.equal(shortQuery.status, 200);
    assert.deepEqual(await shortQuery.json(), []);
    assert.equal(statements.length, 0);

    const response = await fetch(`${base}?q=${encodeURIComponent("Northwind")}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      {
        type: "organization",
        label: "Northwind",
        detail: "#315",
        url: "/smart-super-admin/select-org/315?returnTo=%2Fsmart-super-admin%2Forganizations",
      },
      {
        type: "subscription",
        label: "Northwind",
        detail: "#87 · Growth · active",
        url: "/smart-super-admin/subscription/87/315",
      },
    ]);
    assert.equal(statements.length, 2);
    assert.ok(statements.every(({ sql, values }) => sql.includes("LIKE ?")));
    assert.ok(statements.every(({ values }) => values.every((value) => value === "%Northwind%")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("row menus provide edit links for resources with existing edit forms", async () => {
  const createCrudController = require("../smart-super-admin/controllers/crud.controller");
  const resources = [
    {
      key: "org-types",
      path: "org-type",
      table: "org_types",
      expected: "/smart-super-admin/org-type/7",
    },
    {
      key: "features",
      path: "feature",
      table: "features",
      expected: "/smart-super-admin/feature/7",
    },
    {
      key: "subscription-plans",
      path: "subscription-plan",
      table: "subscription_plans",
      expected: "/smart-super-admin/subscription-plan/7",
    },
    {
      key: "subscriptions",
      path: "subscription",
      table: "subscriptions",
      expected: "/smart-super-admin/subscription/7/42",
      org_id: 42,
    },
  ];
  for (const resource of resources) {
    const service = {
      config: { path: resource.path, table: resource.table, title: resource.key },
      list: async () => ({
        rows: [{ id: 7, org_id: resource.org_id }],
        columns: [{ name: "id" }],
        tableName: resource.table,
        total: 1,
        page: 1,
        totalPages: 1,
        limit: 20,
        org: resource.org_id || 0,
        sort: "id",
        direction: "DESC",
      }),
    };
    let model;
    await createCrudController(service, resource.key).list(
      { params: {}, query: {} },
      {
        locals: { orgId: 42 },
        render: (view, locals) => (model = locals),
      },
    );
    assert.ok(
      model.rows[0].actions.some(
        (action) => action.label === "Edit" && action.url === resource.expected,
      ),
      resource.key,
    );
  }
  const invoiceController = require("../smart-super-admin/controllers/invoices.controller")({
    list: async () => ({
      rows: [{ id: 19 }],
      columns: [{ name: "id" }],
      tableName: "subscription_invoices",
      total: 1,
      page: 1,
      totalPages: 1,
      limit: 20,
      org: 0,
      sort: "id",
      direction: "DESC",
      subscription: {},
    }),
  });
  let invoiceModel;
  await invoiceController.list(
    { params: { subscriptionId: "42" }, query: {} },
    { render: (view, locals) => (invoiceModel = locals) },
  );
  assert.ok(
    invoiceModel.rows[0].actions.some(
      (action) =>
        action.label === "Edit" &&
        action.url === "/smart-super-admin/invoice/edit/19",
    ),
  );
});

test("generic Records rows expose edit links for the generic editor", async () => {
  const controller = require("../smart-super-admin/controllers/items.controller")({
    list: async () => ({
      rows: [{ id: 7 }],
      columns: [{ name: "id" }],
      tableName: "warehouses",
      total: 1,
      page: 1,
      totalPages: 1,
      limit: 20,
      org: 0,
      sort: "id",
      direction: "DESC",
    }),
  });
  let model;
  await controller.list(
    { params: { tableName: "warehouses" }, query: {} },
    { render: (view, locals) => (model = locals) },
  );
  assert.ok(
    model.rows[0].actions.some(
      (action) =>
        action.label === "Edit" &&
        action.url === "/smart-super-admin/edit/warehouses/7",
    ),
  );
});

test("table models mark records with status zero for inactive row styling", () => {
  const { tableModel } = require("../smart-super-admin/controllers/view-models");
  const result = {
    rows: [{ id: 1, status: 0 }, { id: 2, status: "0" }, { id: 3, status: 1 }],
    columns: [{ name: "name", type: "varchar" }, { name: "status", type: "int" }],
    tableName: "products",
    total: 3,
    page: 1,
    totalPages: 1,
    limit: 20,
    org: 0,
    sort: "id",
    direction: "DESC",
  };
  const model = tableModel(result, { title: "Products", basePath: "products" });
  assert.deepEqual(
    model.rows.map((row) => row.inactive),
    [true, true, false],
  );
  assert.ok(model.rows.every((row) => !("downloadUrl" in row)));
});

test("Smart Super Admin create buttons name the type of record being created", async () => {
  const result = {
    rows: [],
    columns: [{ name: "name", type: "varchar" }],
    tableName: "features",
    total: 0,
    page: 1,
    totalPages: 1,
    limit: 20,
    org: 0,
    sort: "id",
    direction: "DESC",
  };
  const cases = [
    ["org-types", "Organization Types", "org-type", "New Type"],
    ["features", "Features", "feature", "New Feature"],
    ["subscription-plans", "Subscription Plans", "subscription-plan", "New Subscription Plan"],
    ["subscriptions", "Subscriptions", "subscription", "New Subscription"],
  ];

  for (const [key, title, path, expectedLabel] of cases) {
    const controller = require("../smart-super-admin/controllers/crud.controller")(
      {
        config: { title, path },
        list: async () => result,
      },
      key,
    );
    let model;
    await controller.list(
      { params: {}, query: {} },
      { locals: { orgId: 0 }, render: (view, locals) => (model = locals) },
    );
    assert.equal(model.createLabel, expectedLabel);
  }
});

test("generic table renders only status-zero rows with inactive styling", async () => {
  const express = require("express");
  const app = express();
  app.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      skipAccessControl: true,
      pool: {
        execute: async (sql) => {
          if (/information_schema/.test(sql))
            return [
              [
                { name: "id", type: "bigint" },
                { name: "name", type: "varchar" },
                { name: "status", type: "int" },
              ],
            ];
          if (/COUNT\(\*\)/.test(sql)) return [[{ count: 2 }]];
          return [[
            { id: 2, name: "Inactive", status: 0 },
            { id: 1, name: "Active", status: 1 },
          ]];
        },
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/list/products/id/DESC/0/20/1`,
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /class="row-clickable row-inactive"[^>]*>\s*<td[^>]*>.*?Inactive/s);
    assert.match(html, /class="row-clickable "[^>]*>\s*<td[^>]*>.*?Active/s);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("generic Records editor excludes identifiers and safely validates updates", async () => {
  const saved = [];
  const columns = [
    { name: "name", type: "varchar", nullable: "NO", maxLength: 100 },
    { name: "quantity", type: "decimal", nullable: "YES", maxLength: null },
    { name: "created_at", type: "datetime", nullable: "YES", maxLength: null },
  ];
  const db = {
    editableColumns: async () => columns,
    one: async () => ({
      id: 7,
      name: "Warehouse",
      quantity: "12.5",
      created_at: "2026-10-11 19:35:00.000",
    }),
    id: database.id,
    text: database.text,
    fail: database.fail,
    save: async (...args) => saved.push(args),
  };
  const service = require("../smart-super-admin/services/items.service")(db);
  const form = await service.editForm("warehouses", "7");
  assert.equal(form.recordId, 7);
  assert.equal(form.fields.some((field) => field.name === "id"), false);
  assert.equal(
    form.fields.find((field) => field.name === "created_at").value,
    dates.getLocalDateTime("2026-10-11 19:35:00.000"),
  );
  const id = await service.saveEdit("warehouses", "7", {
    name: " Main warehouse ",
    quantity: "",
    created_at: "2026-10-12T00:05",
  });
  assert.equal(id, 7);
  assert.deepEqual(saved[0], [
    "warehouses",
    {
      name: "Main warehouse",
      quantity: null,
      created_at: "2026-10-11 19:35:00.000",
    },
    7,
  ]);
  await assert.rejects(() =>
    service.saveEdit("warehouses", "7", {
      name: "Warehouse",
      quantity: "",
      created_at: "",
      id: "8",
    }),
  );
  await assert.rejects(() =>
    service.saveEdit("warehouses", "7", {
      name: "Warehouse",
      quantity: "not-a-number",
      created_at: "",
    }),
  );
});

test("generic Records edit route renders schema-safe fields", async () => {
  const express = require("express");
  const pool = {
    execute: async (sql) => {
      if (sql.includes("information_schema"))
        return [
          [
            {
              name: "id",
              type: "int",
              extra: "auto_increment",
              generated: "NEVER",
              nullable: "NO",
            },
            {
              name: "name",
              type: "varchar",
              extra: "",
              generated: "NEVER",
              nullable: "NO",
              maxLength: 100,
            },
            {
              name: "access_token",
              type: "varchar",
              extra: "",
              generated: "NEVER",
              nullable: "YES",
              maxLength: 255,
            },
          ],
        ];
      return [[{ id: 7, name: "Warehouse", access_token: "PRIVATE_VALUE" }]];
    },
  };
  const app = express();
  app.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({ pool, skipAccessControl: true }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/edit/warehouses/7`,
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /name="name"/);
    assert.doesNotMatch(html, /name="id"|access_token|PRIVATE_VALUE/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Kabul dates round-trip independently of host timezone and invoice IDs stay unique", () => {
  const old = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      assert.equal(
        dates.formatMySQLDateKabulToUTC("2026-10-12T00:05"),
        "2026-10-11 19:35:00.000",
      );
      assert.equal(
        dates.getLocalDateTime("2026-10-11 19:35:00.000"),
        "2026-10-12T00:05",
      );
    }
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
  assert.throws(() => dates.formatMySQLDateKabulToUTC("2026-02-30T12:00"));
  assert.equal(
    dates.generateInvoiceNumber(2, 1000001, "2026-10-11 19:35:00.000"),
    "INV-2-202610-1000001",
  );
});

test("helpers escape badges, build bounded pages, and validate decimal input", () => {
  assert.doesNotMatch(
    String(helpers.statusBadge("<script>bad</script>")),
    /<script>/,
  );
  assert.match(
    String(helpers.statusBadge("<script>bad</script>")),
    /&lt;script&gt;/,
  );
  assert.equal(helpers.accountTypeName(4), "Customer");
  assert.equal(helpers.eq(1, "1"), true);
  assert.equal(helpers.math(3, "+", 4), 7);
  assert.equal(helpers.buildPagination(50, 100, "/page/").pages.length, 5);
  assert.equal(database.money("0.100000", true), "0.100000");
  assert.equal(
    helpers.formatCurrency("99999999999999.123456", "USD"),
    "$99,999,999,999,999.123456",
  );
  for (const amount of ["-1", "1e3", "0.1234567", "NaN"])
    assert.throws(() => database.money(amount));
  assert.throws(() => database.money("0", true));
});

test("generic schema browsing rejects identifiers, bounds limits, and excludes credentials", async () => {
  assert.equal(database.TABLES.includes("error_logs"), false);
  assert.equal(database.TABLES.includes("commands"), false);
  assert.equal(database.TABLES.includes("sync_logs"), false);
  const calls = [];
  const db = database({
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("information_schema"))
        return [
          [
            { name: "id", type: "int" },
            { name: "username", type: "varchar" },
            { name: "password_hash", type: "varchar" },
            { name: "token", type: "varchar" },
          ],
        ];
      if (sql.includes("COUNT(*)")) return [[{ count: 11 }]];
      return [[{ id: 1, username: "Fixture" }]];
    },
  });
  const result = await db.list(
    "users",
    { sortcolumn: "id", sortdir: "ASC", org: 0, limit: 10, page: 999 },
    { $search: "50%_!" },
  );
  assert.equal(result.page, 2);
  assert.equal(result.columns.length, 2);
  const listing = calls.find((call) => call.sql.includes("LIMIT ? OFFSET ?"));
  assert.doesNotMatch(listing.sql, /password_hash|token|SELECT \*/);
  assert.deepEqual(listing.values.slice(-2), [10, 10]);
  assert.equal(listing.values[0], "%50!%!_!!%");
  await assert.rejects(() => db.list("users; DROP TABLE users", { limit: 20 }));
  await assert.rejects(() => db.list("users", { sortcolumn: "password_hash" }));
  await assert.rejects(() => db.list("users", { limit: 251 }));
});

test("all requested templates compile and Smart Super Admin uses the session gate", () => {
  const handlebars = require("handlebars");
  function files(root) {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? files(path.join(root, entry.name))
          : [path.join(root, entry.name)],
      );
  }
  const templates = files(
    path.join(__dirname, "../views/smart-super-admin"),
  ).filter((file) => file.endsWith(".hbs"));
  assert.ok(templates.length >= 24);
  const sharedHead = fs.readFileSync(
      path.join(
        __dirname,
        "../views/smart-super-admin/partials/head.hbs",
      ),
      "utf8",
    ),
    login = fs.readFileSync(
      path.join(__dirname, "../views/smart-super-admin/login.hbs"),
      "utf8",
    ),
    design = fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/css/modern.css"),
      "utf8",
    );
  assert.match(sharedHead, /assets\/css\/modern\.css\?v=7/);
  assert.match(login, /assets\/css\/modern\.css\?v=7/);
  assert.match(design, /\.smart-sidebar nav a\.active/);
  assert.match(design, /\.data-table th/);
  assert.match(design, /\.dashboard-metric/);
  assert.match(design, /\.form-actions/);
  assert.match(design, /\.dashboard-table \.badge\.bg-primary/);
  assert.doesNotMatch(design, /data-theme="dark"|login-theme-toggle/);
  assert.match(design, /--smart-primary:\s*#297aa0/);
  assert.match(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/css/admin.css"),
      "utf8",
    ),
    /--smart-primary:\s*#297aa0/,
  );
  assert.match(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/css/login.css"),
      "utf8",
    ),
    /background:\s*#297aa0/,
  );
  assert.doesNotMatch(sharedHead, /theme\.js/);
  assert.doesNotMatch(login, /theme\.js|data-theme-toggle/);
  assert.doesNotMatch(design, /#2563eb|#1d4ed8|#0f6efd/);
  const table = fs.readFileSync(
    path.join(
      __dirname,
      "../views/smart-super-admin/partials/table.hbs",
    ),
    "utf8",
  );
  assert.match(table, /bi-three-dots-vertical/);
  assert.match(table, /row-action-menu-items/);
  assert.match(table, /data-row-menu/);
  assert.match(table, /data-row-url="\{\{detailUrl\}\}"/);
  assert.match(table, /name="from"/);
  assert.match(table, /name="to"/);
  assert.match(table, /type="datetime-local"/);
  assert.doesNotMatch(table, /downloadUrl|>\{\{t 'Download'\}\}</);
  for (const file of templates) {
    const source = fs.readFileSync(file, "utf8");
    handlebars.precompile(source);
    assert.doesNotMatch(
      source,
      /<script(?![^>]*\bsrc=)|onclick=|\/api\/superadmin|\.blade\.php/,
    );
  }
  for (const file of files(path.join(__dirname, "../smart-super-admin")).filter(
    (file) => file.endsWith(".js"),
  )) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /loginAsUser|requirePermission/);
    if (!file.endsWith(path.join("smart-super-admin", "superadmin.js")))
      assert.doesNotMatch(source, /me@2020/);
  }
  const accessControl = fs.readFileSync(
    path.join(__dirname, "../smart-super-admin/middleware/access-control.js"),
    "utf8",
  );
  assert.match(accessControl, /requireSuperAdminSession/);
  assert.match(accessControl, /requireSameOriginForChanges/);
});

test("Smart Super Admin index pages keep vertical scrolling inside the table or card", () => {
  const shell = fs.readFileSync(
    path.join(__dirname, "../public/smart-super-admin/css/shell.css"),
    "utf8",
  );
  assert.match(
    shell,
    /\.smart-workspace > main:has\(> \.index-page\)[\s\S]*?overflow-y:\s*hidden;/,
  );
  assert.match(
    shell,
    /\.smart-workspace > main > \.index-page[\s\S]*?min-height:\s*0;/,
  );
  assert.match(
    shell,
    /\.data-table-wrap\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/,
  );
  assert.match(
    shell,
    /\.index-grid-content\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/,
  );
  assert.match(
    shell,
    /@media \(max-width: 767px\)[\s\S]*?\.smart-workspace > main:has\(> \.index-page\)\s*\{[^}]*overflow:\s*auto;/,
  );
});

test("browser feature editor adds/removes safe DOM rows without inline scripts", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    '<section data-feature-editor><select data-feature-picker><option value="4">Feature</option></select><button data-feature-add></button><div data-feature-rows></div><p data-feature-status></p></section>',
    { runScripts: "outside-only", url: "http://localhost/smart-super-admin" },
  );
  dom.window.matchMedia = () => ({ addEventListener() {} });
  dom.window.eval(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/js/admin.js"),
      "utf8",
    ),
  );
  const document = dom.window.document;
  document.querySelector("[data-feature-add]").click();
  document.querySelector("[data-feature-add]").click();
  assert.equal(document.querySelectorAll(".feature-row").length, 1);
  assert.equal(document.querySelector('[name="feature_id[]"]').value, "4");
  document.querySelector("[data-feature-remove]").click();
  assert.equal(document.querySelectorAll(".feature-row").length, 0);
  dom.window.close();
});

test("sidebar navigation restores its scroll position and expanded group", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    '<aside id="smart-sidebar"><div class="sidebar-menu" data-sidebar-scroll><details data-sidebar-group="records"><summary>Records</summary><a href="/smart-super-admin/list/warehouses/id/DESC/0/20/1" aria-current="page">Warehouse</a></details></div></aside>',
    { runScripts: "outside-only", url: "http://localhost/smart-super-admin/list/warehouses/id/DESC/0/20/1" },
  );
  dom.window.matchMedia = () => ({ addEventListener() {} });
  dom.window.sessionStorage.setItem(
    "smartSuperAdmin.sidebarState",
    JSON.stringify({ scrollTop: 128, groups: { records: true } }),
  );
  dom.window.eval(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/js/admin.js"),
      "utf8",
    ),
  );
  const menu = dom.window.document.querySelector("[data-sidebar-scroll]"),
    group = dom.window.document.querySelector("[data-sidebar-group]");
  assert.equal(menu.scrollTop, 128);
  assert.equal(group.open, true);
  menu.scrollTop = 176;
  menu.addEventListener("click", (event) => event.preventDefault());
  menu.querySelector("a").dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  assert.equal(
    JSON.parse(
      dom.window.sessionStorage.getItem("smartSuperAdmin.sidebarState"),
    ).scrollTop,
    176,
  );
  dom.window.close();
});

function recordingPool(columns) {
  const calls = [];
  return {
    calls,
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (/information_schema/.test(sql)) return [columns];
      if (/COUNT\(\*\)/.test(sql)) return [[{ count: 0 }]];
      return [[]];
    },
  };
}

test("list date range filters bind to the table's temporal column in Kabul time", async () => {
  const pool = recordingPool([
    { name: "id", type: "bigint" },
    { name: "name", type: "varchar" },
    { name: "created_at", type: "datetime" },
  ]);
  const db = database(pool);
  const result = await db.list(
    "products",
    { sortcolumn: "id", sortdir: "DESC", org: 0, limit: 20, page: 1 },
    { $from: "2026-10-01T00:00", $to: "2026-10-02T12:30" },
  );
  assert.equal(result.dateColumn, "created_at");
  const query = pool.calls.find(
    (call) => /FROM `products`/.test(call.sql) && !/COUNT/.test(call.sql),
  );
  assert.match(query.sql, /`created_at`>=\?/);
  assert.match(query.sql, /`created_at`<=\?/);
  assert.deepEqual(query.params, [
    "2026-09-30 19:30:00.000",
    "2026-10-02 08:00:00.000",
    20,
    0,
  ]);
});

test("subscription search matches organization IDs", async () => {
  const pool = recordingPool([
    { name: "id", type: "bigint" },
    { name: "org_id", type: "bigint" },
    { name: "subscription_status", type: "varchar" },
  ]);
  await database(pool).list(
    "subscriptions",
    { sortcolumn: "id", sortdir: "DESC", org: 0, limit: 20, page: 1 },
    { $search: "276" },
  );

  const listing = pool.calls.find((call) =>
    /FROM `subscriptions`/.test(call.sql) && !/COUNT/.test(call.sql),
  );
  assert.match(listing.sql, /CAST\(`org_id` AS CHAR\) LIKE \? ESCAPE '!'/);
  assert.ok(listing.params.includes("%276%"));
});

test("a date-typed column compares on the day and unusable ranges fail with 400", async () => {
  const dayPool = recordingPool([
    { name: "id", type: "bigint" },
    { name: "date", type: "date" },
  ]);
  const dayResult = await database(dayPool).list(
    "journals",
    { org: 0, limit: 20, page: 1 },
    { $from: "2026-10-01T00:00" },
  );
  assert.equal(dayResult.dateColumn, "date");
  assert.ok(
    dayPool.calls
      .find((call) => /FROM `journals`/.test(call.sql))
      .params.includes("2026-09-30"),
  );

  const plain = database(
    recordingPool([
      { name: "id", type: "bigint" },
      { name: "name", type: "varchar" },
    ]),
  );
  await assert.rejects(
    () =>
      plain.list(
        "features",
        { org: 0, limit: 20, page: 1 },
        { $from: "2026-10-01T00:00" },
      ),
    (error) => error.status === 400,
    "a table without a temporal column rejects a range filter",
  );
  await assert.rejects(
    () =>
      plain.list(
        "products",
        { org: 0, limit: 20, page: 1 },
        { $from: "not-a-date" },
      ),
    (error) => error.status === 400,
    "an unparsable range value is rejected",
  );
});

test("row download streams an attachment without credential columns", async () => {
  const express = require("express");
  const parent = express();
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      skipAccessControl: true,
      pool: {
        execute: async (sql) => {
          if (/information_schema/.test(sql))
            return [
              [
                { name: "id", type: "bigint" },
                { name: "name", type: "varchar" },
                { name: "api_token", type: "varchar" },
              ],
            ];
          return [[{ id: 7, name: "Acme Trading", api_token: "PRIVATE" }]];
        },
      },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/download/organizations/7`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(
      response.headers.get("content-disposition"),
      'attachment; filename="organizations-7.json"',
    );
    assert.deepEqual(await response.json(), { id: 7, name: "Acme Trading" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("table rows open their record on click and the action menu on right-click", () => {
  const { JSDOM, VirtualConsole } = require("jsdom");
  const virtualConsole = new VirtualConsole();
  const navigations = [];
  virtualConsole.on("jsdomError", (error) => navigations.push(error.message));
  const dom = new JSDOM(
    '<table><tbody><tr class="row-clickable" data-row-url="/smart-super-admin/view/products/3"><td>Soap</td><td><details class="row-action-menu" data-row-menu><summary>menu</summary><div class="row-action-menu-items"><a class="row-action-menu-item" href="/smart-super-admin/view/products/3">Details</a></div></details></td></tr></tbody></table>',
    {
      runScripts: "outside-only",
      url: "http://localhost/smart-super-admin/list/products/id/DESC/0/20/1",
      virtualConsole,
    },
  );
  dom.window.matchMedia = () => ({ addEventListener() {} });
  dom.window.eval(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/js/admin.js"),
      "utf8",
    ),
  );
  const document = dom.window.document,
    row = document.querySelector("tr"),
    menu = document.querySelector(".row-action-menu"),
    items = document.querySelector(".row-action-menu-items");
  document.querySelector("td").dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  assert.match(navigations.join(" | "), /navigation/i);
  navigations.length = 0;
  menu.querySelector("summary").dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  assert.equal(
    navigations.length,
    0,
    "opening the row menu must not navigate away",
  );
  row.dispatchEvent(
    new dom.window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      clientY: 40,
    }),
  );
  assert.equal(menu.open, true);
  assert.equal(items.style.position, "fixed");
  assert.match(items.style.left, /^\d+px$/);
  assert.match(items.style.top, /^\d+px$/);
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(menu.open, false);
  dom.window.close();
});

test("table search refreshes results live after typing and resets pagination", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    '<form method="get" action="/smart-super-admin/list/products/id/DESC/0/20/4" data-filter-form><div data-filter-search><input name="q" data-filter-input><button type="button" data-filter-clear hidden></button></div><span data-filter-status hidden></span></form><span class="index-record-count"><strong>4</strong></span><div class="index-content">old results</div><footer class="index-footer">old pages</footer>',
    {
      runScripts: "outside-only",
      url: "http://localhost/smart-super-admin/list/products/id/DESC/0/20/4",
    },
  );
  dom.window.matchMedia = () => ({ addEventListener() {} });
  const requests = [];
  dom.window.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      text: async () =>
        '<span class="index-record-count"><strong>2</strong></span><div class="index-content">new results</div><footer class="index-footer">new pages</footer>',
    };
  };
  dom.window.eval(
    fs.readFileSync(
      path.join(__dirname, "../public/smart-super-admin/js/admin.js"),
      "utf8",
    ),
  );

  const input = dom.window.document.querySelector("[data-filter-input]");
  input.value = "soap";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  input.value = "soap powder";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));

  assert.equal(requests.length, 1, "typing is debounced into one fetch");
  assert.match(requests[0].url, /q=soap\+powder$/);
  assert.equal(
    dom.window.document.querySelector(".index-content").textContent,
    "new results",
    "results update without replacing the page",
  );
  assert.equal(
    dom.window.document.querySelector(".index-record-count strong").textContent,
    "2",
  );
  assert.equal(
    new URL(dom.window.location.href).pathname,
    "/smart-super-admin/list/products/id/DESC/0/20/1",
    "search submits from the first page",
  );
  dom.window.close();
});
