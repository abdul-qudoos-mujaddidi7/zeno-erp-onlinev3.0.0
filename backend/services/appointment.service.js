const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const appointmentRepository =
  require('../repositories/appointment.repository');

const journalRepository =
  require('../repositories/journal.repository');

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

async function createJournalEntry(
  connection,
  {
    orgId,
    userId,
    requestContext,
    data,
    description,
  },
) {
  const localId = generateLocalId();

  const journal =
    await journalRepository.create(
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
      tableName: 'journals',
      entityId: journal.id,

      oldValues: null,
      newValues: journal,

      description:
        description || `Created journal entry ${journal.id}`,

      ipAddress:
        requestContext.ipAddress,

      sessionId:
        requestContext.sessionId,

      deviceInfo:
        requestContext.deviceInfo,
    },
  );

  return journal;
}

async function upsertAppointmentFeeJournals(
  connection,
  {
    orgId,
    userId,
    requestContext,
    appointmentId,
    data,
    isCreate,
  },
) {
  const fee = Number(data.fee || 0);
  const paidAmount = Number(data.paid_amount || 0);

  const receivableAccount =
    await appointmentRepository.findAccountByCode(
      connection,
      {
        orgId,
        code: 'RECEIVABLE',
      },
    );

  if (!receivableAccount) {
    throw new AppError(
      'RECEIVABLE account not found.',
      500,
      'RECEIVABLE_ACCOUNT_NOT_FOUND',
    );
  }

  const feeJournalsResult =
      await journalRepository.findAll(
      connection,
      {
        orgId,
        referenceId: appointmentId,
        referenceType: 'appointment_fee',
      },
      );
    const feeJournals = feeJournalsResult.data;

  const activeFeeJournal = feeJournals.find(
    (journal) => Number(journal.status) === 1,
  );

  if (activeFeeJournal) {
    await journalRepository.update(
      connection,
      {
        orgId,
        localId: activeFeeJournal.id,
        userId,
        data: {
          date: data.date || null,
          currency: data.currency || null,
          first_entry_account: data.patient_id,
          first_entry_debit: fee,
          first_entry_credit: 0,
          second_entry_debit: 0,
          second_entry_credit: fee,
          description:
            data.description || `Appointment Fee for patient ID ${data.patient_id}`,
        },
      },
    );
  } else if (isCreate || fee !== 0) {
    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: data.date || null,
          reference_id: appointmentId,
          reference_type: 'appointment_fee',
          description:
            data.description || `Appointment Fee for patient ID ${data.patient_id}`,
          currency: data.currency || null,
          first_entry_account: data.patient_id,
          first_entry_debit: fee,
          first_entry_credit: 0,
          second_entry_account: receivableAccount.id,
          second_entry_debit: 0,
          second_entry_credit: fee,
          status: 1,
        },
        description:
          `Created appointment fee journal for ${appointmentId}`,
      },
    );
  }

  const paymentJournalsResult =
      await journalRepository.findAll(
      connection,
      {
        orgId,
        referenceId: appointmentId,
        referenceType: 'appointment_fee_payment',
      },
      );
    const paymentJournals = paymentJournalsResult.data;

  const activePaymentJournal = paymentJournals.find(
    (journal) => Number(journal.status) === 1,
  );

  if (activePaymentJournal) {
    await journalRepository.update(
      connection,
      {
        orgId,
        localId: activePaymentJournal.id,
        userId,
        data: {
          date: data.date || null,
          description:
            data.description || `Appointment Fee Payment for patient ID ${data.patient_id}`,
          reference_id: appointmentId,
          reference_type: 'appointment_fee_payment',
          currency: data.currency || null,
          first_entry_account: data.patient_id,
          first_entry_debit: 0,
          first_entry_credit: paidAmount,
          second_entry_account: userId,
          second_entry_debit: paidAmount,
          second_entry_credit: 0,
          status: data.status ?? 1,
        },
      },
    );
  } else if (isCreate || paidAmount !== 0) {
    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: data.date || null,
          description:
            data.description || `Appointment Fee Payment for patient ID ${data.patient_id}`,
          reference_id: appointmentId,
          reference_type: 'appointment_fee_payment',
          currency: data.currency || null,
          first_entry_account: data.patient_id,
          first_entry_debit: 0,
          first_entry_credit: paidAmount,
          second_entry_account: userId,
          second_entry_debit: paidAmount,
          second_entry_credit: 0,
          status: data.status ?? 1,
        },
        description:
          `Created appointment fee payment journal for ${appointmentId}`,
      },
    );
  }
}

async function replaceItems(
  connection,
  {
    orgId,
    userId,
    appointmentId,
    items,
  },
) {
  await appointmentRepository.softDeleteItemsByAppointment(
    connection,
    {
      orgId,
      appointmentId,
      userId,
    },
  );

  const createdItems = [];

  for (const item of items || []) {
    const itemLocalId = generateLocalId();

    const createdItem =
      await appointmentRepository.createItem(
        connection,
        {
          orgId,
          localId: itemLocalId,
          userId,
          data: {
            ...item,
            appointment_id: appointmentId,
          },
        },
      );

    createdItems.push(createdItem);
  }

  return createdItems;
}

async function listAppointments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const result =
    await appointmentRepository.findAll(
      db,
      {
        orgId,
        status: filters.status,
        search: filters.search,
        patientId: filters.patient_id || null,
        doctorId: filters.doctor_id || null,
        departmentId: filters.department_id || null,
        pagination,
      },
    );

  if (Number(filters.relations) === 1) {
    const appointments = result.data;
    const items =
      await appointmentRepository.findItemsByAppointmentIds(
        db,
        {
          orgId,
          appointmentIds: appointments.map(
            (appointment) => appointment.id,
          ),
        },
      );

    return {
      data: appointments.map((appointment) => ({
        ...appointment,
        items: items.filter(
          (item) =>
            item.appointment_id === appointment.id,
        ),
      })),
      meta: result.meta,
    };
  }

  return result;
}

async function getAppointment({
  user,
  appointmentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const appointment =
    await appointmentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: appointmentId,
      },
    );

  if (!appointment) {
    throw new AppError(
      'Appointment not found.',
      404,
      'APPOINTMENT_NOT_FOUND',
    );
  }

  const items =
    await appointmentRepository.findItemsByAppointment(
      db,
      {
        orgId,
        appointmentId,
      },
    );

  return {
    ...appointment,
    items,
  };
}

async function createAppointment({
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

    const appointment =
      await appointmentRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    const createdItems = await replaceItems(
      connection,
      {
        orgId,
        userId,
        appointmentId: localId,
        items: data.items,
      },
    );

    await upsertAppointmentFeeJournals(
      connection,
      {
        orgId,
        userId,
        requestContext,
        appointmentId: localId,
        data,
        isCreate: true,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'appointments',
        entityId: appointment.id,

        oldValues: null,
        newValues: {
          ...appointment,
          items: createdItems,
        },

        description:
          `Created appointment ${appointment.serial_no || appointment.id}`,

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
      ...appointment,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAppointment({
  user,
  appointmentId,
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

    const oldAppointment =
      await appointmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: appointmentId,
          forUpdate: true,
        },
      );

    if (!oldAppointment) {
      throw new AppError(
        'Appointment not found.',
        404,
        'APPOINTMENT_NOT_FOUND',
      );
    }

    const updated =
      await appointmentRepository.update(
        connection,
        {
          orgId,
          localId: appointmentId,
          userId,
          data,
        },
      );

    const createdItems = await replaceItems(
      connection,
      {
        orgId,
        userId,
        appointmentId,
        items: data.items,
      },
    );

    await upsertAppointmentFeeJournals(
      connection,
      {
        orgId,
        userId,
        requestContext,
        appointmentId,
        data,
        isCreate: false,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'appointments',
        entityId: updated.id,

        oldValues: oldAppointment,
        newValues: {
          ...updated,
          items: createdItems,
        },

        description:
          `Updated appointment ${updated.serial_no || updated.id}`,

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
      ...updated,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAppointment({
  user,
  appointmentId,
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

    const oldAppointment =
      await appointmentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: appointmentId,
          forUpdate: true,
        },
      );

    if (!oldAppointment) {
      throw new AppError(
        'Appointment not found.',
        404,
        'APPOINTMENT_NOT_FOUND',
      );
    }

    if (Number(oldAppointment.status) === 0) {
      throw new AppError(
        'Appointment is already deleted.',
        409,
        'APPOINTMENT_ALREADY_DELETED',
      );
    }

    const deleted =
      await appointmentRepository.softDelete(
        connection,
        {
          orgId,
          localId: appointmentId,
          userId,
        },
      );

    await appointmentRepository.softDeleteItemsByAppointment(
      connection,
      {
        orgId,
        appointmentId,
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: appointmentId,
        referenceType: 'appointment_fee',
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: appointmentId,
        referenceType: 'appointment_fee_payment',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'appointments',
        entityId: deleted.id,

        oldValues: oldAppointment,
        newValues: deleted,

        description:
          `Deleted appointment ${oldAppointment.serial_no || oldAppointment.id}`,

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
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
};
