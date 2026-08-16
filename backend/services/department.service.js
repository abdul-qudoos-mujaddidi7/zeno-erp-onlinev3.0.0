const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const departmentRepository =
  require('../repositories/department.repository');

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

async function listDepartments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return departmentRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getDepartment({
  user,
  departmentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const department =
    await departmentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: departmentId,
      },
    );

  if (!department) {
    throw new AppError(
      'Department not found.',
      404,
      'DEPARTMENT_NOT_FOUND',
    );
  }

  return department;
}

async function createDepartment({
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

    const department =
      await departmentRepository.create(
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
        tableName: 'departments',
        entityId: department.id,

        oldValues: null,
        newValues: department,

        description:
          `Created department ${department.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return department;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateDepartment({
  user,
  departmentId,
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

    const oldDepartment =
      await departmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: departmentId,
          forUpdate: true,
        },
      );

    if (!oldDepartment) {
      throw new AppError(
        'Department not found.',
        404,
        'DEPARTMENT_NOT_FOUND',
      );
    }

    const updatedDepartment =
      await departmentRepository.update(
        connection,
        {
          orgId,
          localId: departmentId,
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
        tableName: 'departments',
        entityId: updatedDepartment.id,

        oldValues: oldDepartment,
        newValues: updatedDepartment,

        description:
          `Updated department ${updatedDepartment.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedDepartment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteDepartment({
  user,
  departmentId,
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

    const oldDepartment =
      await departmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: departmentId,
          forUpdate: true,
        },
      );

    if (!oldDepartment) {
      throw new AppError(
        'Department not found.',
        404,
        'DEPARTMENT_NOT_FOUND',
      );
    }

    if (Number(oldDepartment.status) === 0) {
      throw new AppError(
        'Department is already deleted.',
        409,
        'DEPARTMENT_ALREADY_DELETED',
      );
    }

    const deletedDepartment =
      await departmentRepository.softDelete(
        connection,
        {
          orgId,
          localId: departmentId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'departments',
        entityId: deletedDepartment.id,

        oldValues: oldDepartment,
        newValues: deletedDepartment,

        description:
          `Deleted department ${oldDepartment.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedDepartment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
