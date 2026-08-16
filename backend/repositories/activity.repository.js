const {
  generateLocalId,
} = require('../utils/generateLocalId');

function serializeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

async function create(
  connection,
  {
    orgId,
    userId,
    action,
    tableName,
    entityId,
    oldValues = null,
    newValues = null,
    description = null,
    ipAddress = null,
    sessionId = null,
    deviceInfo = null,
    userActionId = null,
    status = 1,
    version = 1,
  },
) {
  const localId = generateLocalId();

  const [result] = await connection.execute(
    `
      INSERT INTO activity_logs (
        org_id,
        local_id,
        user_id,
        user_action_id,
        action,
        table_name,
        entity_id,
        old_values,
        new_values,
        description,
        ip_address,
        session_id,
        device_info,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      userId,
      userActionId,
      action,
      tableName,
      entityId,
      serializeValue(oldValues),
      serializeValue(newValues),
      description,
      ipAddress,
      sessionId,
      deviceInfo,
      status,
      version,
      userId,
      userId,
    ],
  );

  return {
    id: result.insertId,
    local_id: localId,
  };
}

module.exports = {
  create,
};