const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const leaseRepository =
  require('../repositories/lease.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError('Invalid authenticated user.', 401, 'INVALID_USER');
  }

  return { orgId, userId };
}

async function listLeases({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return leaseRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      apartmentId: filters.apartment_id || null,
      tenantAccountId: filters.tenant_account_id || null,
      pagination,
    },
  );
}

async function getLease({
  user,
  leaseId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await leaseRepository.findByLocalId(
      db,
      {
        orgId,
        localId: leaseId,
      },
    );

  if (!record) {
    throw new AppError(
      'Lease not found.',
      404,
      'LEASES_NOT_FOUND',
    );
  }

  return record;
}

async function createLease({
  user,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const localId = generateLocalId();

    const record =
      await leaseRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'leases',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created lease ${record.lease_number || record.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return record;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateLease({
  user,
  leaseId,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldRecord =
      await leaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: leaseId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lease not found.',
        404,
        'LEASES_NOT_FOUND',
      );
    }

    const updated =
      await leaseRepository.update(
        connection,
        {
          orgId,
          localId: leaseId,
          userId,
          data,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'leases',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated lease ${updated.lease_number || updated.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteLease({
  user,
  leaseId,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldRecord =
      await leaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: leaseId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lease not found.',
        404,
        'LEASES_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Lease is already deleted.',
        409,
        'LEASES_ALREADY_DELETED',
      );
    }

    const deleted =
      await leaseRepository.softDelete(
        connection,
        {
          orgId,
          localId: leaseId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'leases',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted lease ${oldRecord.lease_number || oldRecord.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deleted;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listLeases,
  getLease,
  createLease,
  updateLease,
  deleteLease,
};
