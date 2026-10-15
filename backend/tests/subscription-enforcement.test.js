const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("../middleware/auth");
const {
  enforceOrganizationSubscription,
  getOrganizationSubscription,
} = require("../services/subscription-access");

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeDatabase(subscriptionStatus, tokenUserPk = 17) {
  const calls = [];
  const user = {
    id: 17,
    local_id: 5,
    org_id: 206,
    username: "tenant-user",
    auth_user_pk: tokenUserPk,
  };
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT u\.\*, t\.token/.test(sql)) return [[user]];
      if (/FROM subscriptions s/.test(sql)) {
        return [[{
          id: 31,
          org_id: 206,
          subscription_status: subscriptionStatus,
          access_status: subscriptionStatus,
        }]];
      }
      if (/SELECT sf\.feature_id/.test(sql)) return [[]];
      if (/SELECT id, feature_key, name FROM features/.test(sql)) return [[]];
      if (/SELECT pf\.feature_id/.test(sql)) return [[]];
      if (/UPDATE subscriptions/.test(sql)) return [{ affectedRows: 1 }];
      if (/DELETE FROM auth_tokens/.test(sql)) return [{ affectedRows: 1 }];
      if (/UPDATE auth_tokens/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

async function runAuth(db, authorization = "Bearer test-token") {
  const req = {
    headers: authorization ? { authorization } : {},
    params: {},
  };
  const res = makeResponse();
  let nextCalled = false;
  await auth.createAuth(db)(req, res, (error) => {
    if (error) throw error;
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test("valid active and trial subscriptions allow tenant requests", async () => {
  for (const status of ["active", "trial"]) {
    const db = makeDatabase(status, 17);
    const { req, res, nextCalled } = await runAuth(db);
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.user.org_id, 206);
    assert.equal(req.subscription.access_status, status);
    assert.equal(db.calls.some(({ sql }) => /DELETE FROM auth_tokens/.test(sql)), false);
  }
});

test("cancelled, suspended, expired, and expired-trial subscriptions revoke only that organization", async () => {
  for (const [status, responseStatus] of [
    ["cancelled", "cancelled"],
    ["suspended", "suspended"],
    ["expired", "expired"],
    ["trial_expired", "trial_expired"],
  ]) {
    const db = makeDatabase(status, 17);
    const { res, nextCalled } = await runAuth(db);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.subscription_status, responseStatus);
    const revoke = db.calls.find(({ sql }) => /DELETE FROM auth_tokens/.test(sql));
    assert.deepEqual(revoke.params, [206, 206, 206]);
  }
});

test("legacy unambiguous tokens are upgraded to a tenant-specific user key", async () => {
  const db = makeDatabase("active", null);
  const { nextCalled } = await runAuth(db);
  assert.equal(nextCalled, true);
  const upgrade = db.calls.find(({ sql }) => /UPDATE auth_tokens SET user_pk/.test(sql));
  assert.deepEqual(upgrade.params, [17, "test-token"]);
});

test("a legacy token matching users in multiple organizations is rejected", async () => {
  const db = makeDatabase("active", null);
  const originalExecute = db.execute.bind(db);
  db.execute = async (sql, params = []) => {
    if (/SELECT u\.\*, t\.token/.test(sql)) {
      db.calls.push({ sql, params });
      return [[
        { id: 17, local_id: 5, org_id: 206, auth_user_pk: null },
        { id: 99, local_id: 5, org_id: 275, auth_user_pk: null },
      ]];
    }
    return originalExecute(sql, params);
  };

  const { res, nextCalled } = await runAuth(db);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "AMBIGUOUS_TOKEN");
  assert.ok(db.calls.some(({ sql }) => /DELETE FROM auth_tokens WHERE token/.test(sql)));
});

test("subscription expiration is decided by database time and latest subscription", async () => {
  let query;
  const db = {
    async execute(sql, params) {
      query = { sql, params };
      return [[{ id: 42, access_status: "active" }]];
    },
  };
  const subscription = await getOrganizationSubscription(db, 206);
  assert.equal(subscription.id, 42);
  assert.deepEqual(query.params, [206]);
  assert.match(query.sql, /NOW\(\)/);
  assert.match(query.sql, /ORDER BY s\.id DESC/);
});

test("automatic expiration updates status and revokes organization tokens", async () => {
  const db = makeDatabase("expired");
  const result = await enforceOrganizationSubscription(db, 206);
  assert.equal(result.allowed, false);
  assert.ok(db.calls.some(({ sql }) => /UPDATE subscriptions/.test(sql)));
  assert.ok(db.calls.some(({ sql, params }) =>
    /DELETE FROM auth_tokens/.test(sql) && params[0] === 206,
  ));
});

test("direct protected API requests are blocked for inactive organizations", async () => {
  const express = require("express");
  const db = makeDatabase("suspended", 17);
  const app = express();
  app.get("/api/v2/products", auth.createAuth(db), (req, res) => {
    res.json({ success: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v2/products`,
      { headers: { Authorization: "Bearer test-token" } },
    );
    assert.equal(response.status, 402);
    assert.equal((await response.json()).code, "SUBSCRIPTION_SUSPENDED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
