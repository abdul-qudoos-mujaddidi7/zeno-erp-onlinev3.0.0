const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productImageRepository =
  require('../repositories/product-image.repository');

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

// Activity logs keep metadata only — image/thumbnail are base64 longtext
// payloads (potentially MB) that should not be duplicated into activity_logs.
function imageMetadata(imageRecord) {
  if (!imageRecord) return null;

  return {
    id: imageRecord.id,
    product_id: imageRecord.product_id,
    status: imageRecord.status,
    version: imageRecord.version,
    image_length: imageRecord.image ? imageRecord.image.length : 0,
    thumbnail_length: imageRecord.thumbnail ? imageRecord.thumbnail.length : 0,
  };
}

async function listProductImages({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const productIds = String(filters.product_ids || '')
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  return productImageRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      productId: filters.product_id || null,
      productIds: productIds.length ? productIds : null,
      thumbnailsOnly: Number(filters.thumbnails_only) === 1,
      pagination,
    },
  );
}

async function getProductImage({
  user,
  productImageId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const productImage =
    await productImageRepository.findByLocalId(
      db,
      {
        orgId,
        localId: productImageId,
      },
    );

  if (!productImage) {
    throw new AppError(
      'Product image not found.',
      404,
      'PRODUCT_IMAGE_NOT_FOUND',
    );
  }

  return productImage;
}

async function createProductImage({
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

    const productImage =
      await productImageRepository.create(
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
        tableName: 'product_images',
        entityId: productImage.id,

        oldValues: null,
        newValues: imageMetadata(productImage),

        description:
          `Created product image for product ${productImage.product_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return productImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProductImage({
  user,
  productImageId,
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

    const oldProductImage =
      await productImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productImageId,
          forUpdate: true,
        },
      );

    if (!oldProductImage) {
      throw new AppError(
        'Product image not found.',
        404,
        'PRODUCT_IMAGE_NOT_FOUND',
      );
    }

    const updatedProductImage =
      await productImageRepository.update(
        connection,
        {
          orgId,
          localId: productImageId,
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
        tableName: 'product_images',
        entityId: updatedProductImage.id,

        oldValues: imageMetadata(oldProductImage),
        newValues: imageMetadata(updatedProductImage),

        description:
          `Updated product image for product ${updatedProductImage.product_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedProductImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProductImage({
  user,
  productImageId,
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

    const oldProductImage =
      await productImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productImageId,
          forUpdate: true,
        },
      );

    if (!oldProductImage) {
      throw new AppError(
        'Product image not found.',
        404,
        'PRODUCT_IMAGE_NOT_FOUND',
      );
    }

    if (Number(oldProductImage.status) === 0) {
      throw new AppError(
        'Product image is already deleted.',
        409,
        'PRODUCT_IMAGE_ALREADY_DELETED',
      );
    }

    const deletedProductImage =
      await productImageRepository.softDelete(
        connection,
        {
          orgId,
          localId: productImageId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'product_images',
        entityId: deletedProductImage.id,

        oldValues: imageMetadata(oldProductImage),
        newValues: imageMetadata(deletedProductImage),

        description:
          `Deleted product image for product ${oldProductImage.product_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedProductImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceProductImage({
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

    const oldImagesResult =
      await productImageRepository.findAll(
        connection,
        {
          orgId,
          status: 1,
          productId: data.product_id,
        },
      );
    const oldImages = oldImagesResult.data;

    await productImageRepository.softDeleteByProduct(
      connection,
      {
        orgId,
        productId: data.product_id,
        userId,
      },
    );

    const localId = generateLocalId();

    const productImage =
      await productImageRepository.create(
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

        action: 'replace',
        tableName: 'product_images',
        entityId: productImage.id,

        oldValues: oldImages.map(imageMetadata),
        newValues: imageMetadata(productImage),

        description:
          `Replaced product image for product ${data.product_id} (${oldImages.length} old row(s) soft-deleted)`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return productImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listProductImages,
  getProductImage,
  createProductImage,
  updateProductImage,
  deleteProductImage,
  replaceProductImage,
};
