const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 14;
const TRIAL_REMINDER_WINDOW_DAYS = 4;

function readSubscription(subscription) {
  if (typeof subscription !== 'string') return subscription;

  try {
    return JSON.parse(subscription);
  } catch {
    return null;
  }
}

export function getSubscriptionDaysRemaining(subscription, now = Date.now()) {
  return getSubscriptionExpiryReminder(subscription, now)?.daysRemaining ?? null;
}

export function getSubscriptionExpiryReminder(subscription, now = Date.now()) {
  const currentSubscription = readSubscription(subscription);
  if (!currentSubscription || typeof currentSubscription !== 'object') return null;

  const status = String(currentSubscription.subscription_status || '').trim().toLowerCase();
  const isTrial = status === 'trial';
  if (!isTrial && status !== 'active') return null;

  const endDate = Date.parse(isTrial ? currentSubscription.trial_end_date : currentSubscription.end_date);
  if (!Number.isFinite(endDate)) return null;

  if (endDate <= now) return null;

  const end = new Date(endDate);
  const current = new Date(now);
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const currentDay = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  const daysRemaining = Math.max(1, Math.round((endDay - currentDay) / DAY_MS));
  const reminderWindowDays = isTrial ? TRIAL_REMINDER_WINDOW_DAYS : REMINDER_WINDOW_DAYS;

  return daysRemaining <= reminderWindowDays
    ? { status, daysRemaining }
    : null;
}
