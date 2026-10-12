const validators = require('../validators/auth');
const passwords = require('./passwords');

module.exports = repository => ({
  async create(input) {
    try {
      const validated = validators.provisioning.parse(input);
      const hash = await passwords.hash(validated.password);
      return await repository.transaction(async connection => {
        const roleId = await repository.ensurePolicy(connection);
        const id = await repository.createAccount(connection, { username: validated.username, displayName: validated.displayName, hash }, roleId);
        await repository.audit({ event: 'account.provisioned', outcome: 'success', origin: 'operator', targetId: id }, connection);
        await repository.audit({ event: 'access.changed', outcome: 'success', origin: 'operator', targetId: id, detailCode: 'initial_role_granted' }, connection);
        return id;
      });
    } catch (error) {
      await repository.audit({ event: 'account.provisioning_failed', outcome: 'denied', origin: 'operator', detailCode: 'operation_failed' });
      throw error;
    }
  },
  async change(username, change, value) {
    try {
      const normalized = validators.username.parse(username);
      if (!['active', 'access'].includes(change) || typeof value !== 'boolean') throw new Error('INVALID_CHANGE');
      return await repository.transaction(async connection => {
        const id = await repository.changeAccess(connection, normalized, change, value);
        await repository.audit({ event: 'access.changed', outcome: 'success', origin: 'operator', targetId: id,
          detailCode: change === 'active' ? (value ? 'account_enabled' : 'account_disabled') : (value ? 'role_granted' : 'role_revoked') }, connection);
        return id;
      });
    } catch (error) {
      await repository.audit({ event: 'access.change_failed', outcome: 'denied', origin: 'operator', detailCode: 'operation_failed' });
      throw error;
    }
  },
});
