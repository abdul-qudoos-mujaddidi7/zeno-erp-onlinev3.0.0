const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productGenericRepository =
  require('../repositories/product-generic.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
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

async function listGenerics({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return productGenericRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getGeneric({
  user,
  genericId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const generic =
    await productGenericRepository.findByLocalId(
      db,
      {
        orgId,
        localId: genericId,
      },
    );

  if (!generic) {
    throw new AppError(
      'Product generic not found.',
      404,
      'PRODUCT_GENERIC_NOT_FOUND',
    );
  }

  return generic;
}

async function createGeneric({
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

    const generic =
      await productGenericRepository.create(
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
        tableName: 'product_generics',
        entityId: generic.id,

        oldValues: null,
        newValues: generic,

        description:
          `Created product generic ${generic.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return generic;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateGeneric({
  user,
  genericId,
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

    const oldGeneric =
      await productGenericRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: genericId,
          forUpdate: true,
        },
      );

    if (!oldGeneric) {
      throw new AppError(
        'Product generic not found.',
        404,
        'PRODUCT_GENERIC_NOT_FOUND',
      );
    }

    const updatedGeneric =
      await productGenericRepository.update(
        connection,
        {
          orgId,
          localId: genericId,
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
        tableName: 'product_generics',
        entityId: updatedGeneric.id,

        oldValues: oldGeneric,
        newValues: updatedGeneric,

        description:
          `Updated product generic ${updatedGeneric.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedGeneric;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteGeneric({
  user,
  genericId,
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

    const oldGeneric =
      await productGenericRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: genericId,
          forUpdate: true,
        },
      );

    if (!oldGeneric) {
      throw new AppError(
        'Product generic not found.',
        404,
        'PRODUCT_GENERIC_NOT_FOUND',
      );
    }

    if (Number(oldGeneric.status) === 0) {
      throw new AppError(
        'Product generic is already deleted.',
        409,
        'PRODUCT_GENERIC_ALREADY_DELETED',
      );
    }

    const deletedGeneric =
      await productGenericRepository.softDelete(
        connection,
        {
          orgId,
          localId: genericId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'product_generics',
        entityId: deletedGeneric.id,

        oldValues: oldGeneric,
        newValues: deletedGeneric,

        description:
          `Deleted product generic ${oldGeneric.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedGeneric;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listGenerics,
  getGeneric,
  createGeneric,
  updateGeneric,
  deleteGeneric,
};
