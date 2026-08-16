const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const stockReturnItemRepository =
  require('../repositories/stock-return-item.repository');

const {
  resolvePagination,
} = require('../utils/pagination');

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

async function listReturnItems({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters) || {
    page: 1,
    limit: 15,
    offset: 0,
  };

  return stockReturnItemRepository.findItems(
    db,
    {
      orgId,
      accountId: filters.account_id,
      returnType: filters.return_type || 'all',
      search: filters.search || '',
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      pagination,
    },
  );
}

module.exports = {
  listReturnItems,
};
