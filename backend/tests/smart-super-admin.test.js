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

test("all requested templates compile and source has no legacy links or authentication gates", () => {
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
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /requireAuth|loginAsUser|me@2020|requirePermission|\/api\/superadmin/,
    );
  }
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
