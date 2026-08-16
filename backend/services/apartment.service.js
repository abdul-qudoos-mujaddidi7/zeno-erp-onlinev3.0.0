const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const apartmentRepository =
  require('../repositories/apartment.repository');

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

async function listApartments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return apartmentRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      buildingId: filters.building_id ?? null,
      floorId: filters.floor_id ?? null,
      pagination,
    },
  );
}

async function getApartment({
  user,
  apartmentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await apartmentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: apartmentId,
      },
    );

  if (!record) {
    throw new AppError(
      'Apartment not found.',
      404,
      'APARTMENTS_NOT_FOUND',
    );
  }

  return record;
}

async function createApartment({
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
      await apartmentRepository.create(
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
        tableName: 'apartments',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created apartment ${record.unit_number || record.id}`,

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

async function updateApartment({
  user,
  apartmentId,
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
      await apartmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: apartmentId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Apartment not found.',
        404,
        'APARTMENTS_NOT_FOUND',
      );
    }

    const updated =
      await apartmentRepository.update(
        connection,
        {
          orgId,
          localId: apartmentId,
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
        tableName: 'apartments',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated apartment ${updated.unit_number || updated.id}`,

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

async function deleteApartment({
  user,
  apartmentId,
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
      await apartmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: apartmentId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Apartment not found.',
        404,
        'APARTMENTS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Apartment is already deleted.',
        409,
        'APARTMENTS_ALREADY_DELETED',
      );
    }

    const deleted =
      await apartmentRepository.softDelete(
        connection,
        {
          orgId,
          localId: apartmentId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'apartments',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted apartment ${oldRecord.unit_number || oldRecord.id}`,

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
  listApartments,
  getApartment,
  createApartment,
  updateApartment,
  deleteApartment,
};
