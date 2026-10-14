import { describe, expect, it } from 'vitest';

import {
  getSubscriptionDaysRemaining,
  getSubscriptionExpiryReminder,
} from './subscriptionExpiry.js';

const NOW = Date.parse('2026-09-29T10:00:00.000Z');

function activeSubscription(overrides = {}) {
  return {
    subscription_status: 'active',
    end_date: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('getSubscriptionDaysRemaining', () => {
  it('returns the remaining days for any active subscription, including a free plan', () => {
    expect(getSubscriptionDaysRemaining(activeSubscription({
      subscription_plan: { name: 'Zeno Free', billing_cycle_unit: 'month', billing_cycle_count: 1 },
    }), NOW)).toBe(14);
  });

  describe('getSubscriptionExpiryReminder trial notices', () => {
    it('returns a free-trial reminder when four or fewer days remain', () => {
      const trial = {
        subscription_status: 'trial',
        end_date: '2026-10-29T10:00:00.000Z',
        trial_end_date: '2026-10-02T10:00:00.000Z',
      };

      expect(getSubscriptionExpiryReminder(trial, NOW)).toEqual({
        status: 'trial',
        daysRemaining: 3,
      });
    });

    it('shows two days when the trial expires on October 16', () => {
      expect(getSubscriptionExpiryReminder({
        subscription_status: 'trial',
        trial_end_date: '2026-10-16T10:28:00.000Z',
      }, Date.parse('2026-10-14T10:27:00.000Z'))).toEqual({
        status: 'trial',
        daysRemaining: 2,
      });
    });

    it('does not show trial notices when more than four days remain or the trial has ended', () => {
      expect(getSubscriptionExpiryReminder({
        subscription_status: 'trial',
        trial_end_date: '2026-10-04T10:00:00.000Z',
      }, NOW)).toBeNull();
      expect(getSubscriptionExpiryReminder({
        subscription_status: 'trial',
        trial_end_date: '2026-09-29T09:59:59.000Z',
      }, NOW)).toBeNull();
    });
  });

  it('accepts a stored JSON subscription', () => {
    const subscription = activeSubscription({
      end_date: '2026-10-10T10:00:00.000Z',
    });

    expect(getSubscriptionDaysRemaining(JSON.stringify(subscription), NOW)).toBe(11);
  });

  it('does not show for non-active subscriptions or expired dates', () => {
    expect(getSubscriptionDaysRemaining(activeSubscription({
      subscription_status: 'trial',
    }), NOW)).toBeNull();
    expect(getSubscriptionDaysRemaining(activeSubscription({
      end_date: '2026-09-29T09:59:59.000Z',
    }), NOW)).toBeNull();
  });

  it('shows nothing when more than 14 days remain or subscription data is invalid', () => {
    expect(getSubscriptionDaysRemaining(activeSubscription({
      end_date: '2026-10-14T10:00:00.000Z',
    }), NOW)).toBeNull();
    expect(getSubscriptionDaysRemaining('not-json', NOW)).toBeNull();
  });
});
