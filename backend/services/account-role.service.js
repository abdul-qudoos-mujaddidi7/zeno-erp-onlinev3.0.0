const AppError = require('../errors/AppError');
const accountRepository = require('../repositories/account.repository');
const accountTypeRepository = require('../repositories/account-type.repository');
const { isVisitorAccountType } = require('../constants/accountTypes');

const ROLE_ERROR_CODES = {
  customer: 'ACCOUNT_NOT_CUSTOMER_CAPABLE',
  supplier: 'ACCOUNT_NOT_SUPPLIER_CAPABLE',
  visitor: 'ACCOUNT_NOT_VISITOR_CAPABLE',
};

/*
 * `visitor` is decided by the account TYPE code, not by can_be_customer /
 * can_be_supplier: a visitor is neither of those, it is the account that
 * receives a share of a sale's benefit.
 */
function isCapable(type, account, role) {
  if (role === 'visitor') {
    return isVisitorAccountType(type);
  }

  if (role === 'customer') {
    return Number(account.account_type_id) === 4 || Number(type?.can_be_customer) === 1;
  }

  return Number(account.account_type_id) === 3 || Number(type?.can_be_supplier) === 1;
}

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
  if (!isCapable(type, account, role)) {
    throw new AppError(
      `The selected account cannot be used as a ${role}.`,
      400,
      ROLE_ERROR_CODES[role] || 'ACCOUNT_NOT_CAPABLE',
    );
  }
  return account;
}

module.exports = { assertAccountRole, isCapable, ROLE_ERROR_CODES };
