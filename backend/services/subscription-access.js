const SUBSCRIPTION_MESSAGES = {
  missing: "This organization does not have a subscription. Contact your administrator.",
  not_started: "This organization's subscription has not started yet.",
  expired: "This organization's subscription has expired.",
  trial_expired: "This organization's trial has expired. Contact your administrator to renew.",
  cancelled: "This organization's subscription has been cancelled.",
  suspended: "This organization's subscription has been suspended.",
  inactive: "This organization's subscription is not active.",
};

async function getOrganizationSubscription(db, orgId) {
  const [rows] = await db.execute(
    `SELECT s.*,
       CASE
         WHEN s.subscription_status = 'active'
           AND (s.start_date IS NULL OR s.start_date > NOW())
           THEN 'not_started'
         WHEN s.subscription_status = 'active'
           AND (s.end_date IS NULL OR s.end_date <= NOW())
           THEN 'expired'
         WHEN s.subscription_status = 'active' THEN 'active'
         WHEN s.subscription_status = 'trial'
           AND (s.start_date IS NULL OR s.start_date > NOW())
           THEN 'not_started'
         WHEN s.subscription_status = 'trial'
           AND (s.trial_end_date IS NULL OR s.trial_end_date <= NOW())
           THEN 'trial_expired'
         WHEN s.subscription_status = 'trial' THEN 'trial'
         WHEN s.subscription_status IN ('cancelled', 'suspended')
           THEN s.subscription_status
         ELSE 'inactive'
       END AS access_status
     FROM subscriptions s
     WHERE s.org_id = ?
     ORDER BY s.id DESC
     LIMIT 1`,
    [orgId],
  );

  return rows[0] || null;
}

async function revokeOrganizationTokens(db, orgId) {
  await db.execute(
    `DELETE FROM auth_tokens
     WHERE user_pk IN (
       SELECT id FROM users WHERE org_id = ?
     )
     OR (
       user_pk IS NULL
       AND user_id IN (
         SELECT user_row.local_id
         FROM users user_row
         WHERE user_row.org_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM users other_org_user
             WHERE other_org_user.local_id = user_row.local_id
               AND other_org_user.org_id <> ?
           )
       )
     )`,
    [orgId, orgId, orgId],
  );
}

async function markExpired(db, subscription) {
  if (!subscription || !["expired", "trial_expired"].includes(subscription.access_status)) {
    return;
  }

  await db.execute(
    `UPDATE subscriptions
     SET subscription_status = 'expired'
     WHERE id = ?
       AND subscription_status IN ('active', 'trial')`,
    [subscription.id],
  );
}

function accessResult(subscription) {
  const status = subscription?.access_status || "missing";
  const allowed = status === "active" || status === "trial";

  return {
    allowed,
    status,
    subscription,
    message: allowed ? null : SUBSCRIPTION_MESSAGES[status] || SUBSCRIPTION_MESSAGES.inactive,
    code: allowed ? null : `SUBSCRIPTION_${status.toUpperCase()}`,
  };
}

async function enforceOrganizationSubscription(db, orgId) {
  const subscription = await getOrganizationSubscription(db, orgId);
  const access = accessResult(subscription);

  if (!access.allowed) {
    await markExpired(db, subscription);
    await revokeOrganizationTokens(db, orgId);
  }

  return access;
}

module.exports = {
  accessResult,
  enforceOrganizationSubscription,
  getOrganizationSubscription,
  markExpired,
  revokeOrganizationTokens,
};
