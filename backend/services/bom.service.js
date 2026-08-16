const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const bomRepository =
  require('../repositories/bom.repository');

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

async function replaceNested(
  connection,
  {
    orgId,
    userId,
    bomId,
    items = [],
    operations = [],
  },
) {
  await bomRepository.softDeleteItemsByBom(
    connection,
    {
      orgId,
      bomId,
      userId,
    },
  );

  await bomRepository.softDeleteOperationsByBom(
    connection,
    {
      orgId,
      bomId,
      userId,
    },
  );

  const createdItems = [];
  const createdOperations = [];

  for (const item of items) {
    const itemLocalId = generateLocalId();

    const createdItem =
      await bomRepository.createItem(
        connection,
        {
          orgId,
          localId: itemLocalId,
          userId,
          data: {
            ...item,
            bom_id: bomId,
          },
        },
      );

    createdItems.push(createdItem);
  }

  for (const operation of operations) {
    const operationLocalId = generateLocalId();

    const createdOperation =
      await bomRepository.createOperation(
        connection,
        {
          orgId,
          localId: operationLocalId,
          userId,
          data: {
            ...operation,
            bom_id: bomId,
          },
        },
      );

    createdOperations.push(createdOperation);
  }

  return {
    createdItems,
    createdOperations,
  };
}

async function listBoms({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return bomRepository.findAll(
    db,
    {
      orgId,
      status: filters.status ?? 1,
      billStatus: filters.bill_status || null,
      search: filters.search || '',
    },
  );
}

async function getBom({
  user,
  bomId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const bom =
    await bomRepository.findByLocalId(
      db,
      {
        orgId,
        localId: bomId,
      },
    );

  if (!bom) {
    throw new AppError(
      'BOM not found.',
      404,
      'BOM_NOT_FOUND',
    );
  }

  const [
    items,
    operations,
  ] = await Promise.all([
    bomRepository.findItemsByBom(
      db,
      {
        orgId,
        bomId,
      },
    ),
    bomRepository.findOperationsByBom(
      db,
      {
        orgId,
        bomId,
      },
    ),
  ]);

  return {
    ...bom,
    items,
    operations,
  };
}

async function createBom({
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

    const bom =
      await bomRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    const {
      createdItems,
      createdOperations,
    } = await replaceNested(
      connection,
      {
        orgId,
        userId,
        bomId: localId,
        items: data.items || [],
        operations: data.operations || [],
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'boms',
        entityId: bom.id,

        oldValues: null,
        newValues: {
          ...bom,
          items: createdItems,
          operations: createdOperations,
        },

        description:
          `Created BOM ${bom.bill_number || `#${bom.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...bom,
      items: createdItems,
      operations: createdOperations,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateBom({
  user,
  bomId,
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

    const oldBom =
      await bomRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: bomId,
          forUpdate: true,
        },
      );

    if (!oldBom) {
      throw new AppError(
        'BOM not found.',
        404,
        'BOM_NOT_FOUND',
      );
    }

    const [
      oldItems,
      oldOperations,
    ] = await Promise.all([
      bomRepository.findItemsByBom(
        connection,
        {
          orgId,
          bomId,
        },
      ),
      bomRepository.findOperationsByBom(
        connection,
        {
          orgId,
          bomId,
        },
      ),
    ]);

    const updatedBom =
      await bomRepository.update(
        connection,
        {
          orgId,
          localId: bomId,
          userId,
          data,
        },
      );

    const {
      createdItems,
      createdOperations,
    } = await replaceNested(
      connection,
      {
        orgId,
        userId,
        bomId,
        items: data.items || [],
        operations: data.operations || [],
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'boms',
        entityId: bomId,

        oldValues: {
          ...oldBom,
          items: oldItems,
          operations: oldOperations,
        },
        newValues: {
          ...updatedBom,
          items: createdItems,
          operations: createdOperations,
        },

        description:
          `Updated BOM ${updatedBom.bill_number || `#${bomId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...updatedBom,
      items: createdItems,
      operations: createdOperations,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteBom({
  user,
  bomId,
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

    const oldBom =
      await bomRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: bomId,
          forUpdate: true,
        },
      );

    if (!oldBom) {
      throw new AppError(
        'BOM not found.',
        404,
        'BOM_NOT_FOUND',
      );
    }

    if (Number(oldBom.status) === 0) {
      throw new AppError(
        'BOM is already deleted.',
        409,
        'BOM_ALREADY_DELETED',
      );
    }

    const [
      oldItems,
      oldOperations,
    ] = await Promise.all([
      bomRepository.findItemsByBom(
        connection,
        {
          orgId,
          bomId,
        },
      ),
      bomRepository.findOperationsByBom(
        connection,
        {
          orgId,
          bomId,
        },
      ),
    ]);

    const deletedBom =
      await bomRepository.softDelete(
        connection,
        {
          orgId,
          localId: bomId,
          userId,
        },
      );

    await bomRepository.softDeleteItemsByBom(
      connection,
      {
        orgId,
        bomId,
        userId,
      },
    );

    await bomRepository.softDeleteOperationsByBom(
      connection,
      {
        orgId,
        bomId,
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'boms',
        entityId: bomId,

        oldValues: {
          ...oldBom,
          items: oldItems,
          operations: oldOperations,
        },
        newValues: deletedBom,

        description:
          `Deleted BOM ${oldBom.bill_number || `#${bomId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedBom;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listBoms,
  getBom,
  createBom,
  updateBom,
  deleteBom,
};
