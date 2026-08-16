const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const documentRepository =
  require('../repositories/document.repository');

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

async function listDocuments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return documentRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      referenceId: filters.reference_id || null,
      referenceType: filters.reference_type || null,
      pagination,
    },
  );
}

async function getDocument({
  user,
  documentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await documentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: documentId,
      },
    );

  if (!record) {
    throw new AppError(
      'Document not found.',
      404,
      'DOCUMENTS_NOT_FOUND',
    );
  }

  return record;
}

async function createDocument({
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
      await documentRepository.create(
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
        tableName: 'documents',
        entityId: record.id,

        oldValues: null,
        newValues: {
          id: record.id,
          name: record.name,
          description: record.description,
          reference_type: record.reference_type,
          reference_id: record.reference_id,
          file_type: record.file_type,
          file_size: record.file_size,
          status: record.status,
          file_length: record.file ? record.file.length : 0,
          thumbnail_length: record.thumbnail ? record.thumbnail.length : 0,
        },

        description:
          `Created document ${record.name || record.id}`,

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

async function updateDocument({
  user,
  documentId,
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
      await documentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: documentId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Document not found.',
        404,
        'DOCUMENTS_NOT_FOUND',
      );
    }

    const updated =
      await documentRepository.update(
        connection,
        {
          orgId,
          localId: documentId,
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
        tableName: 'documents',
        entityId: updated.id,

        oldValues: {
          id: oldRecord.id,
          name: oldRecord.name,
          reference_type: oldRecord.reference_type,
          reference_id: oldRecord.reference_id,
          file_type: oldRecord.file_type,
          file_size: oldRecord.file_size,
          status: oldRecord.status,
        },
        newValues: {
          id: updated.id,
          name: updated.name,
          reference_type: updated.reference_type,
          reference_id: updated.reference_id,
          file_type: updated.file_type,
          file_size: updated.file_size,
          status: updated.status,
          file_length: updated.file ? updated.file.length : 0,
          thumbnail_length: updated.thumbnail ? updated.thumbnail.length : 0,
        },

        description:
          `Updated document ${updated.name || updated.id}`,

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

async function deleteDocument({
  user,
  documentId,
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
      await documentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: documentId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Document not found.',
        404,
        'DOCUMENTS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Document is already deleted.',
        409,
        'DOCUMENTS_ALREADY_DELETED',
      );
    }

    const deleted =
      await documentRepository.softDelete(
        connection,
        {
          orgId,
          localId: documentId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'documents',
        entityId: deleted.id,

        oldValues: {
          id: oldRecord.id,
          name: oldRecord.name,
          reference_type: oldRecord.reference_type,
          reference_id: oldRecord.reference_id,
          file_type: oldRecord.file_type,
          file_size: oldRecord.file_size,
          status: oldRecord.status,
        },
        newValues: {
          id: deleted.id,
          name: deleted.name,
          reference_type: deleted.reference_type,
          reference_id: deleted.reference_id,
          file_type: deleted.file_type,
          file_size: deleted.file_size,
          status: deleted.status,
        },

        description:
          `Deleted document ${oldRecord.name || oldRecord.id}`,

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
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
};
