import { describe, expect, it } from 'vitest';
import {
  isSubscriptionFeatureEnabled,
  moduleForFrontendPath,
  permissionsWithSubscriptionFeatures,
} from './permissions.js';

const featureCatalog = [{ id: 4, feature_key: 'accounts', name: 'Accounts' }];
const activePlanFeatures = [{ feature_id: 4, status: 1 }];
const samadSubscription = {
  feature_catalog: featureCatalog,
  plan_features: activePlanFeatures,
  features: [],
};
const otherOrganizationSubscription = {
  feature_catalog: featureCatalog,
  plan_features: activePlanFeatures,
  features: [{ feature_id: 4, status: 1 }],
};

describe('organization subscription feature access', () => {
  it('hides an unassigned feature only for the organization whose subscription removed it', () => {
    expect(isSubscriptionFeatureEnabled('Accounts', samadSubscription)).toBe(false);
    expect(isSubscriptionFeatureEnabled('Accounts', otherOrganizationSubscription)).toBe(true);
    expect(permissionsWithSubscriptionFeatures(
      [{ code: 'Accounts', view: true }],
      samadSubscription,
    )).toEqual([]);
  });

  it('maps direct Accounts pages to the subscription feature', () => {
    expect(moduleForFrontendPath('/dashboard/accounts/list')).toBe('Accounts');
    expect(moduleForFrontendPath('/dashboard/account/123')).toBe('Accounts');
    expect(moduleForFrontendPath('/dashboard/treasury')).toBe('Accounts');
  });

  it('hides a feature for every organization when it is disabled in their shared plan', () => {
    const disabledPlan = { ...activePlanFeatures[0], status: 0 };
    const samad = { ...otherOrganizationSubscription, plan_features: [disabledPlan] };
    const other = { ...otherOrganizationSubscription, plan_features: [disabledPlan] };

    expect(isSubscriptionFeatureEnabled('Accounts', samad)).toBe(false);
    expect(isSubscriptionFeatureEnabled('Accounts', other)).toBe(false);
  });
});
