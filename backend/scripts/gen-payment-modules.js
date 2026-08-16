const fs = require("fs");
const path = require("path");

const OUT = "C:/zeno-erp-online/backend";

const SPECS = [
  {
    name: "sale-payment",
    table: "sale_payments",
    fk: "sale_id",
    fkLabel: "sale_id",
    noun: "sale payment",
    code: "SALE_PAYMENT",
    route: "/sale-payments",
  },
  {
    name: "purchase-payment",
    table: "purchase_payments",
    fk: "purchase_id",
    fkLabel: "purchase_id",
    noun: "purchase payment",
    code: "PURCHASE_PAYMENT",
    route: "/purchase-payments",
  },
];

function validator(s) {
  return `const { z } = require('zod');

const nullableNumber = z.preprocess(
  (value) => {
    if (value === '' || value === undefined || value === null) {
      return null;
    }

    const number = Number(value);

    return Number.isNaN(number) ? null : number;
  },
  z.number().nullable(),
);

const paymentBodySchema = z.object({
  ${s.fk}: nullableNumber,

  account_id: nullableNumber,

  amount: z
    .coerce
    .number()
    .nonnegative()
    .max(1e18)
    .nullable()
    .optional(),

  currency: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional(),

  payment_date: z
    .string()
    .max(50)
    .nullable()
    .optional(),

  description: z
    .string()
    .max(65535)
    .nullable()
    .optional(),

  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const createPaymentSchema = z.object({
  ...paymentBodySchema,
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .default(1),
});

const updatePaymentSchema = z
  .object(paymentBodySchema)
  .partial();

const paymentIdParamsSchema = z.object({
  id: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const paymentListQuerySchema = z.object({
  status: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .optional(),

  ${s.fk}: z
    .coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

module.exports = {
  createPaymentSchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  paymentListQuerySchema,
};
`;
}

function repository(s) {
  return `const PAYMENT_COLUMNS = \`
  local_id AS id,
  local_id,
  ${s.fk},
  account_id,
  amount,
  currency,
  payment_date,
  description,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
\`;

async function findAll(
  executor,
  {
    orgId,
    status,
    parentId,
  },
) {
  const conditions = [
    'org_id = ?',
  ];

  const values = [
    orgId,
  ];

  if (status !== undefined && status !== null) {
    conditions.push('status = ?');
    values.push(status);
  }

  if (parentId) {
    conditions.push('${s.fk} = ?');
    values.push(parentId);
  }

  const [rows] = await executor.execute(
    \`
      SELECT
        \${PAYMENT_COLUMNS}
      FROM ${s.table}
      WHERE \${conditions.join(' AND ')}
      ORDER BY id DESC
    \`,
    values,
  );

  return rows;
}

async function findByLocalId(
  executor,
  {
    orgId,
    localId,
    forUpdate = false,
  },
) {
  const [rows] = await executor.execute(
    \`
      SELECT
        \${PAYMENT_COLUMNS}
      FROM ${s.table}
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
      \${forUpdate ? 'FOR UPDATE' : ''}
    \`,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function create(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  await connection.execute(
    \`
      INSERT INTO ${s.table} (
        org_id,
        local_id,
        ${s.fk},
        account_id,
        amount,
        currency,
        payment_date,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    \`,
    [
      orgId,
      localId,
      data.${s.fk},
      data.account_id,
      data.amount,
      data.currency,
      data.payment_date,
      data.description,
      data.status,
      userId,
      userId,
    ],
  );

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function update(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const [result] = await connection.execute(
    \`
      UPDATE ${s.table}
      SET
        ${s.fk} = ?,
        account_id = ?,
        amount = ?,
        currency = ?,
        payment_date = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    \`,
    [
      data.${s.fk},
      data.account_id,
      data.amount,
      data.currency,
      data.payment_date,
      data.description,
      data.status,
      userId,
      orgId,
      localId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDelete(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    \`
      UPDATE ${s.table}
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    \`,
    [
      userId,
      orgId,
      localId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
};
`;
}

function service(s) {
  return `const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const paymentRepository =
  require('../repositories/${s.name}.repository');

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

async function listPayments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return paymentRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      parentId: filters.${s.fk} || null,
    },
  );
}

async function getPayment({
  user,
  paymentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const payment =
    await paymentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: paymentId,
      },
    );

  if (!payment) {
    throw new AppError(
      '${s.code} not found.',
      404,
      '${s.code}_NOT_FOUND',
    );
  }

  return payment;
}

async function createPayment({
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

    const payment =
      await paymentRepository.create(
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
        tableName: '${s.table}',
        entityId: payment.id,

        oldValues: null,
        newValues: payment,

        description:
          'Created ${s.noun}',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return payment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePayment({
  user,
  paymentId,
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

    const oldPayment =
      await paymentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: paymentId,
          forUpdate: true,
        },
      );

    if (!oldPayment) {
      throw new AppError(
        '${s.code} not found.',
        404,
        '${s.code}_NOT_FOUND',
      );
    }

    const updatedPayment =
      await paymentRepository.update(
        connection,
        {
          orgId,
          localId: paymentId,
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
        tableName: '${s.table}',
        entityId: updatedPayment.id,

        oldValues: oldPayment,
        newValues: updatedPayment,

        description:
          'Updated ${s.noun}',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedPayment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePayment({
  user,
  paymentId,
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

    const oldPayment =
      await paymentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: paymentId,
          forUpdate: true,
        },
      );

    if (!oldPayment) {
      throw new AppError(
        '${s.code} not found.',
        404,
        '${s.code}_NOT_FOUND',
      );
    }

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        '${s.code} is already deleted.',
        409,
        '${s.code}_ALREADY_DELETED',
      );
    }

    const deletedPayment =
      await paymentRepository.softDelete(
        connection,
        {
          orgId,
          localId: paymentId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: '${s.table}',
        entityId: deletedPayment.id,

        oldValues: oldPayment,
        newValues: deletedPayment,

        description:
          'Deleted ${s.noun}',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedPayment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
};
`;
}

function controller(s) {
  return `const paymentService =
  require('../services/${s.name}.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const payments =
    await paymentService.listPayments({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: payments,
  });
}

async function getById(req, res) {
  const payment =
    await paymentService.getPayment({
      user: req.user,
      paymentId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: payment,
  });
}

async function create(req, res) {
  const payment =
    await paymentService.createPayment({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      '${s.code} created successfully.',
    data: payment,
  });
}

async function update(req, res) {
  const payment =
    await paymentService.updatePayment({
      user: req.user,
      paymentId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      '${s.code} updated successfully.',
    data: payment,
  });
}

async function remove(req, res) {
  const payment =
    await paymentService.deletePayment({
      user: req.user,
      paymentId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      '${s.code} deleted successfully.',
    data: payment,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
`;
}

function routes(s) {
  return `const express = require('express');

const validate =
  require('../../middleware/validate');

const asyncHandler =
  require('../../middleware/asyncHandler');

const paymentController =
  require('../../controllers/${s.name}.controller');

const {
  createPaymentSchema,
  updatePaymentSchema,
  paymentIdParamsSchema,
  paymentListQuerySchema,
} = require('../../validators/${s.name}.validator');

const router = express.Router();

router.get(
  '/',
  validate({
    query: paymentListQuerySchema,
  }),
  asyncHandler(
    paymentController.list,
  ),
);

router.get(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    paymentController.getById,
  ),
);

router.post(
  '/',
  validate({
    body: createPaymentSchema,
  }),
  asyncHandler(
    paymentController.create,
  ),
);

router.put(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
    body: updatePaymentSchema,
  }),
  asyncHandler(
    paymentController.update,
  ),
);

router.delete(
  '/:id',
  validate({
    params: paymentIdParamsSchema,
  }),
  asyncHandler(
    paymentController.remove,
  ),
);

module.exports = router;
`;
}

for (const s of SPECS) {
  const files = {
    [`validators/${s.name}.validator.js`]: validator(s),
    [`repositories/${s.name}.repository.js`]: repository(s),
    [`services/${s.name}.service.js`]: service(s),
    [`controllers/${s.name}.controller.js`]: controller(s),
    [`routes/v2/${s.name}.routes.js`]: routes(s),
  };
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    console.log("wrote:", rel);
  }
}
console.log("modules generated");
