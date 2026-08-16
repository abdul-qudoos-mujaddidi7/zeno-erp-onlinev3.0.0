const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const patientTypeRepository =
  require('../repositories/patient-type.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

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

async function listPatientTypes({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return patientTypeRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getPatientType({
  user,
  patientTypeId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await patientTypeRepository.findByLocalId(
      db,
      {
        orgId,
        localId: patientTypeId,
      },
    );

  if (!record) {
    throw new AppError(
      'Patient type not found.',
      404,
      'PATIENT_TYPES_NOT_FOUND',
    );
  }

  return record;
}

async function createPatientType({
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
      await patientTypeRepository.create(
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
        tableName: 'patient_types',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created patient type ${record.name || record.id}`,

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

async function updatePatientType({
  user,
  patientTypeId,
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
      await patientTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: patientTypeId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Patient type not found.',
        404,
        'PATIENT_TYPES_NOT_FOUND',
      );
    }

    const updated =
      await patientTypeRepository.update(
        connection,
        {
          orgId,
          localId: patientTypeId,
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
        tableName: 'patient_types',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated patient type ${updated.name || updated.id}`,

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

async function deletePatientType({
  user,
  patientTypeId,
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
      await patientTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: patientTypeId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Patient type not found.',
        404,
        'PATIENT_TYPES_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Patient type is already deleted.',
        409,
        'PATIENT_TYPES_ALREADY_DELETED',
      );
    }

    const deleted =
      await patientTypeRepository.softDelete(
        connection,
        {
          orgId,
          localId: patientTypeId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'patient_types',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted patient type ${oldRecord.name || oldRecord.id}`,

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
  listPatientTypes,
  getPatientType,
  createPatientType,
  updatePatientType,
  deletePatientType,
};
