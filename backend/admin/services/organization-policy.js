module.exports = repository => async () => repository.transaction(async connection => {
  await repository.grantOrganizationPolicy(connection);
  await repository.audit({ event: 'access.policy_changed', outcome: 'success', origin: 'operator', detailCode: 'organization_permissions_granted' }, connection);
});
