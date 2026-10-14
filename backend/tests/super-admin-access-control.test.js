const test = require("node:test");
const assert = require("node:assert/strict");
const {
  requireSameOriginForChanges,
  requireSuperAdminSession,
} = require("../smart-super-admin/middleware/access-control");

function makeResponse() {
  return {
    statusCode: null,
    location: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    redirect(code, location) {
      this.statusCode = code;
      this.location = location;
      return this;
    },
  };
}

test("Smart Super Admin requires the existing authorized session", () => {
  const response = makeResponse();
  let nextCalled = false;
  requireSuperAdminSession(
    {
      session: { user: { username: "tenant-user" } },
      accepts: () => "html",
    },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 303);
  assert.equal(response.location, "/smart-super-admin/login");
});

test("authorized Smart Super Admin session remains available", () => {
  const response = makeResponse();
  let nextCalled = false;
  requireSuperAdminSession(
    { session: { user: { id: 0, org_id: 0, username: "superadmin" } } },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
});

test("the Smart Super Admin application redirects unauthenticated visitors to its login page", async () => {
  const express = require("express");
  const parent = express();
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      pool: { execute: async () => [[]] },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin`,
      { redirect: "manual" },
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/smart-super-admin/login");
    const login = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/login`,
    );
    assert.equal(login.status, 200);
    const html = await login.text();
    assert.match(html, /Smart Super Admin/);
    assert.match(html, /action="\/smart-super-admin\/login"/);
    assert.match(html, /autocomplete="current-password"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Smart Super Admin logout destroys the session and redirects to its login", async () => {
  const express = require("express");
  const parent = express();
  let authenticated = true;
  parent.use((req, res, next) => {
    req.session = {
      user: authenticated
        ? { id: 0, org_id: 0, username: "superadmin" }
        : undefined,
      destroy(callback) {
        authenticated = false;
        callback();
      },
    };
    next();
  });
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/app")({
      pool: { execute: async () => [[]] },
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/smart-super-admin/logout`, {
      method: "POST",
      headers: { Origin: base },
      redirect: "manual",
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/smart-super-admin/login");
    const signedOut = await fetch(`${base}/smart-super-admin`, {
      redirect: "manual",
    });
    assert.equal(signedOut.status, 303);
    assert.equal(
      signedOut.headers.get("location"),
      "/smart-super-admin/login",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Smart Super Admin login is handled by its separate route module", async () => {
  const express = require("express");
  const parent = express();
  const session = {};
  parent.use(express.urlencoded({ extended: false }));
  parent.use((req, res, next) => {
    req.session = session;
    next();
  });
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/superadmin")({
      query: async () => [[]],
      execute: async () => [[]],
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "username=superadmin&password=me%402020",
        redirect: "manual",
      },
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/smart-super-admin");
    assert.deepEqual(session.user, {
      id: 0,
      org_id: 0,
      username: "superadmin",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Smart Super Admin login rejects valid tenant credentials", async () => {
  const express = require("express");
  const crypto = require("node:crypto");
  const parent = express();
  const session = {};
  parent.use(express.urlencoded({ extended: false }));
  parent.use((req, res, next) => {
    req.session = session;
    next();
  });
  parent.use(
    "/smart-super-admin",
    require("../smart-super-admin/superadmin")({
      query: async () => [[]],
      execute: async () => [
        [
          {
            password_hash: crypto
              .createHash("sha256")
              .update("tenant-password")
              .digest("hex"),
          },
        ],
      ],
    }),
  );
  const server = parent.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/smart-super-admin/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "username=tenant-user&password=tenant-password",
        redirect: "manual",
      },
    );
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "/smart-super-admin/login?error=admin",
    );
    assert.equal(session.user, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("legacy login does not mistake an existing tenant session for admin access", () => {
  const Login = require("../routes/components/Login");
  let html;
  let redirect;
  Login(
    { session: { user: { id: 5, org_id: 206, username: "tenant-user" } } },
    {
      send(value) {
        html = value;
      },
      redirect(value) {
        redirect = value;
      },
    },
    {},
  );
  assert.match(html, /Superadmin Login/);
  assert.equal(redirect, undefined);
});

test("legacy login redirects the authorized admin to its dashboard", () => {
  const Login = require("../routes/components/Login");
  let html;
  let redirect;
  Login(
    { session: { user: { id: 0, org_id: 0, username: "superadmin" } } },
    {
      send(value) {
        html = value;
      },
      redirect(value) {
        redirect = value;
      },
    },
    {},
  );
  assert.equal(redirect, "/api/superadmin/dashboard");
  assert.equal(html, undefined);
});

test("a tenant account named superadmin is not an administrator session", () => {
  const response = makeResponse();
  let nextCalled = false;
  requireSuperAdminSession(
    {
      session: { user: { id: 7, org_id: 206, username: "superadmin" } },
      accepts: () => "html",
    },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 303);
});

test("state-changing panel requests require a matching origin", () => {
  let nextCalled = false;
  const response = makeResponse();
  requireSameOriginForChanges(
    {
      method: "POST",
      protocol: "https",
      get(name) {
        if (name === "host") return "erp.example.com";
        if (name === "origin") return "https://attacker.example";
        return undefined;
      },
    },
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
});

test("same-origin panel changes and safe requests proceed", () => {
  for (const request of [
    {
      method: "POST",
      protocol: "https",
      get(name) {
        if (name === "host") return "erp.example.com";
        if (name === "origin") return "https://erp.example.com";
        return undefined;
      },
    },
    { method: "GET", protocol: "https", get: () => "erp.example.com" },
  ]) {
    let nextCalled = false;
    requireSameOriginForChanges(request, makeResponse(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  }
});
