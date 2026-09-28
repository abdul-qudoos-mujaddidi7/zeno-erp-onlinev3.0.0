const AppError = require('../errors/AppError');
const accountRepository = require('../repositories/account.repository');
const accountTypeRepository = require('../repositories/account-type.repository');

async function assertAccountRole(executor, { orgId, accountId, role }) {
  const account = await accountRepository.findByLocalId(executor, {
    orgId, localId: Number(accountId), forUpdate: true,
  });
  if (!account || Number(account.status) !== 1 || account.account_status === 'inactive') {
    throw new AppError('Active account not found.', 400, 'ACTIVE_ACCOUNT_NOT_FOUND');
  }
  const type = await accountTypeRepository.findByLocalId(executor, {
    orgId, localId: Number(account.account_type_id),
  });
  const capable = role === 'customer'
    ? Number(account.account_type_id) === 4 || Number(type?.can_be_customer) === 1
    : Number(account.account_type_id) === 3 || Number(type?.can_be_supplier) === 1;
  if (!capable) {
    throw new AppError(
      `The selected account cannot be used as a ${role}.`,
      400,
      role === 'customer' ? 'ACCOUNT_NOT_CUSTOMER_CAPABLE' : 'ACCOUNT_NOT_SUPPLIER_CAPABLE',
    );
  }
  return account;
}

module.exports = { assertAccountRole };
