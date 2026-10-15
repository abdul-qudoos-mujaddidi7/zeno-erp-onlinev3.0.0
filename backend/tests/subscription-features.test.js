const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../middleware/auth');

const accountFeature = { id: 4, feature_key: 'accounts', name: 'Accounts' };

function organizationDatabase() {
  let planFeatureEnabled = true;
  const organizations = {
    'samad-token': { userId: 17, orgId: 206, subscriptionId: 31, planId: 9, enabled: false },
    'other-token': { userId: 18, orgId: 275, subscriptionId: 42, planId: 9, enabled: true },
  };

  const db = {
    async execute(sql, params = []) {
      if (/SELECT u\.\*, t\.token/.test(sql)) {
        const tenant = organizations[params[0]];
        return tenant ? [[{
          id: tenant.userId,
          local_id: tenant.userId,
          org_id: tenant.orgId,
          auth_user_pk: tenant.userId,
        }]] : [[]];
      }
      if (/FROM subscriptions s/.test(sql)) {
        const tenant = Object.values(organizations).find((item) => item.orgId === params[0]);
        return tenant ? [[{
          id: tenant.subscriptionId,
          org_id: tenant.orgId,
          plan_id: tenant.planId,
          access_status: 'active',
          subscription_status: 'active',
        }]] : [[]];
      }
      if (/SELECT sf\.feature_id/.test(sql)) {
        const tenant = Object.values(organizations).find((item) => item.subscriptionId === params[0]);
        return tenant?.enabled ? [[{
          feature_id: accountFeature.id,
          status: 1,
          feature_key: accountFeature.feature_key,
          name: accountFeature.name,
        }]] : [[]];
      }
      if (/SELECT id, feature_key, name FROM features/.test(sql)) return [[accountFeature]];
      if (/SELECT pf\.feature_id/.test(sql)) {
        return planFeatureEnabled ? [[{
          feature_id: accountFeature.id,
          status: 1,
          feature_key: accountFeature.feature_key,
          name: accountFeature.name,
        }]] : [[]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return {
    db,
    enableFeature(orgId) {
      const tenant = Object.values(organizations).find((item) => item.orgId === orgId);
      tenant.enabled = true;
    },
    disablePlanFeature() {
      planFeatureEnabled = false;
    },
    enablePlanFeature() {
      planFeatureEnabled = true;
    },
  };
}

async function requestAccounts(db, token) {
  const req = {
    headers: { authorization: `Bearer ${token}` },
    params: {},
    originalUrl: '/api/v2/accounts',
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let reachedAccountsApi = false;

  await auth.createAuth(db)(req, res, (error) => {
    if (error) throw error;
    reachedAccountsApi = true;
  });

  return { res, reachedAccountsApi };
}

test('disabling Accounts for one organization does not disable it for another', async () => {
  const { db } = organizationDatabase();
  const samad = await requestAccounts(db, 'samad-token');
  const other = await requestAccounts(db, 'other-token');

  assert.equal(samad.reachedAccountsApi, false);
  assert.equal(samad.res.statusCode, 403);
  assert.equal(samad.res.body.code, 'SUBSCRIPTION_FEATURE_DISABLED');
  assert.equal(other.reachedAccountsApi, true);
  assert.equal(other.res.statusCode, 200);
});

test('re-enabling Accounts in the organization subscription restores access', async () => {
  const { db, enableFeature } = organizationDatabase();
  enableFeature(206);
  const samad = await requestAccounts(db, 'samad-token');
  assert.equal(samad.reachedAccountsApi, true);
  assert.equal(samad.res.statusCode, 200);
});

test('disabling Accounts on the shared plan blocks every organization using that plan', async () => {
  const { db, disablePlanFeature } = organizationDatabase();
  disablePlanFeature();
  const samad = await requestAccounts(db, 'samad-token');
  const other = await requestAccounts(db, 'other-token');

  assert.equal(samad.res.body.code, 'SUBSCRIPTION_FEATURE_DISABLED');
  assert.equal(other.res.body.code, 'SUBSCRIPTION_FEATURE_DISABLED');
  assert.equal(samad.reachedAccountsApi, false);
  assert.equal(other.reachedAccountsApi, false);
});

test('reactivating a plan feature restores assigned organizations but preserves local disables', async () => {
  const { db, disablePlanFeature, enablePlanFeature } = organizationDatabase();
  disablePlanFeature();
  enablePlanFeature();

  const samad = await requestAccounts(db, 'samad-token');
  const other = await requestAccounts(db, 'other-token');
  assert.equal(samad.res.body.code, 'SUBSCRIPTION_FEATURE_DISABLED');
  assert.equal(other.reachedAccountsApi, true);
});
