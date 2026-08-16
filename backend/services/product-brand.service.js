const db = require('../database/pool');
const AppError = require('../errors/AppError');

const productBrandRepository =
  require('../repositories/product-brand.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);

  const userId = Number(
    user?.local_id ??
      user?.id,
  );

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'The authenticated organization is invalid.',
      401,
      'INVALID_AUTHENTICATED_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'The authenticated user is invalid.',
      401,
      'INVALID_AUTHENTICATED_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

function normalizeBrandData(data) {
  return {
    name: String(data.name || '').trim(),

    code:
      data.code === null ||
      data.code === undefined ||
      String(data.code).trim() === ''
        ? null
        : String(data.code).trim(),

    description:
      data.description === null ||
      data.description === undefined ||
      String(data.description).trim() === ''
        ? null
        : String(data.description).trim(),

    status:
      Number(data.status) === 0
        ? 0
        : 1,
  };
}

async function createActivity(
  executor,
  payload,
) {
  if (
    typeof activityRepository.create ===
    'function'
  ) {
    return activityRepository.create(
      executor,
      payload,
    );
  }

  if (
    typeof activityRepository.insert ===
    'function'
  ) {
    return activityRepository.insert(
      executor,
      payload,
    );
  }

  throw new Error(
    'activity.repository.js must export create() or insert().',
  );
}

async function listBrands({
  user,
  filters,
}) {
  const { orgId } =
    getAuthenticatedIdentity(user);

  return productBrandRepository.findAll(
    db,
    {
      orgId,
      status:
        filters?.status ?? 1,
      search:
        filters?.search ?? '',
    },
  );
}

async function getBrand({
  user,
  brandId,
}) {
  const { orgId } =
    getAuthenticatedIdentity(user);

  const brand =
    await productBrandRepository.findByLocalId(
      db,
      {
        orgId,
        localId: brandId,
      },
    );

  if (!brand) {
    throw new AppError(
      'Product brand not found.',
      404,
      'PRODUCT_BRAND_NOT_FOUND',
    );
  }

  return brand;
}

async function createBrand({
  user,
  data,
  requestContext = {},
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const localId =
      generateLocalId();

    const normalizedData =
      normalizeBrandData(data);

    await productBrandRepository.create(
      connection,
      {
        orgId,
        localId,
        userId,
        data: normalizedData,
      },
    );

    const createdBrand =
      await productBrandRepository.findByLocalId(
        connection,
        {
          orgId,
          localId,
          forUpdate: true,
        },
      );

    await createActivity(
      connection,
      {
        orgId,
        userId,
        action: 'create',
        tableName: 'product_brands',
        entityId: localId,
        oldValues: null,
        newValues: createdBrand,
        description:
          `Created product brand ${createdBrand.name}`,
        ipAddress:
          requestContext.ipAddress || null,
        sessionId:
          requestContext.sessionId || null,
        deviceInfo:
          requestContext.deviceInfo || null,
      },
    );

    await connection.commit();

    return createdBrand;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateBrand({
  user,
  brandId,
  data,
  requestContext = {},
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldBrand =
      await productBrandRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: brandId,
          forUpdate: true,
        },
      );

    if (!oldBrand) {
      throw new AppError(
        'Product brand not found.',
        404,
        'PRODUCT_BRAND_NOT_FOUND',
      );
    }

    const normalizedData =
      normalizeBrandData(data);

    await productBrandRepository.update(
      connection,
      {
        orgId,
        localId: brandId,
        userId,
        data: normalizedData,
      },
    );

    const updatedBrand =
      await productBrandRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: brandId,
        },
      );

    await createActivity(
      connection,
      {
        orgId,
        userId,
        action: 'update',
        tableName: 'product_brands',
        entityId: brandId,
        oldValues: oldBrand,
        newValues: updatedBrand,
        description:
          `Updated product brand ${updatedBrand.name}`,
        ipAddress:
          requestContext.ipAddress || null,
        sessionId:
          requestContext.sessionId || null,
        deviceInfo:
          requestContext.deviceInfo || null,
      },
    );

    await connection.commit();

    return updatedBrand;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteBrand({
  user,
  brandId,
  requestContext = {},
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldBrand =
      await productBrandRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: brandId,
          forUpdate: true,
        },
      );

    if (!oldBrand) {
      throw new AppError(
        'Product brand not found.',
        404,
        'PRODUCT_BRAND_NOT_FOUND',
      );
    }

    if (Number(oldBrand.status) === 0) {
      throw new AppError(
        'Product brand is already deleted.',
        409,
        'PRODUCT_BRAND_ALREADY_DELETED',
      );
    }

    await productBrandRepository.softDelete(
      connection,
      {
        orgId,
        localId: brandId,
        userId,
      },
    );

    const deletedBrand =
      await productBrandRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: brandId,
        },
      );

    await createActivity(
      connection,
      {
        orgId,
        userId,
        action: 'delete',
        tableName: 'product_brands',
        entityId: brandId,
        oldValues: oldBrand,
        newValues: deletedBrand,
        description:
          `Deleted product brand ${oldBrand.name}`,
        ipAddress:
          requestContext.ipAddress || null,
        sessionId:
          requestContext.sessionId || null,
        deviceInfo:
          requestContext.deviceInfo || null,
      },
    );

    await connection.commit();

    return deletedBrand;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
};
