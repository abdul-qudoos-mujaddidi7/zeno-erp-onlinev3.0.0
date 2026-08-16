const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const rentInvoiceRepository =
  require('../repositories/rent-invoice.repository');

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

async function listRentInvoices({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return rentInvoiceRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      leaseId: filters.lease_id || null,
      invoiceStatus: filters.invoice_status || null,
      pagination,
    },
  );
}

async function getRentInvoice({
  user,
  rentInvoiceId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await rentInvoiceRepository.findByLocalId(
      db,
      {
        orgId,
        localId: rentInvoiceId,
      },
    );

  if (!record) {
    throw new AppError(
      'Rent invoice not found.',
      404,
      'RENT_INVOICES_NOT_FOUND',
    );
  }

  return record;
}

async function createRentInvoice({
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
      await rentInvoiceRepository.create(
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
        tableName: 'rent_invoices',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created rent invoice ${record.invoice_number || record.id}`,

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

async function updateRentInvoice({
  user,
  rentInvoiceId,
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
      await rentInvoiceRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: rentInvoiceId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Rent invoice not found.',
        404,
        'RENT_INVOICES_NOT_FOUND',
      );
    }

    const updated =
      await rentInvoiceRepository.update(
        connection,
        {
          orgId,
          localId: rentInvoiceId,
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
        tableName: 'rent_invoices',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated rent invoice ${updated.invoice_number || updated.id}`,

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

async function deleteRentInvoice({
  user,
  rentInvoiceId,
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
      await rentInvoiceRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: rentInvoiceId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Rent invoice not found.',
        404,
        'RENT_INVOICES_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Rent invoice is already deleted.',
        409,
        'RENT_INVOICES_ALREADY_DELETED',
      );
    }

    const deleted =
      await rentInvoiceRepository.softDelete(
        connection,
        {
          orgId,
          localId: rentInvoiceId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'rent_invoices',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted rent invoice ${oldRecord.invoice_number || oldRecord.id}`,

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
  listRentInvoices,
  getRentInvoice,
  createRentInvoice,
  updateRentInvoice,
  deleteRentInvoice,
};
