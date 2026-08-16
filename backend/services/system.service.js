const systemRepository = require("../repositories/system.repository");
const AppError = require("../errors/AppError");

async function getHealth() {
  const database = await systemRepository.pingDatabase();

  return {
    api: "online",
    database: Number(database.database_ok) === 1 ? "online" : "unknown",
    database_time: database.database_time,
    environment: process.env.NODE_ENV || "development",
  };
}

function getAuthenticatedUser(user) {
  return {
    local_id: user?.local_id ?? null,
    org_id: user?.org_id ?? null,
    username: user?.username ?? null,
  };
}

async function getInventoryMethod(user) {
  const orgId = Number(user?.org_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError(
      "Invalid organization.",
      401,
      "INVALID_ORGANIZATION",
    );
  }

  const method = await systemRepository.getOrganizationInventoryMethod(orgId);

  return {
    inventory_method: method,
  };
}

async function getRegistrationInfo() {
  return systemRepository.getRegistrationInfo();
}

async function loadImage(params) {
  try {
    return await systemRepository.loadImage(params);
  } catch (error) {
    if (error.statusCode) {
      throw new AppError(
        error.message,
        error.statusCode,
        error.code || "IMAGE_ERROR",
      );
    }

    throw error;
  }
}

module.exports = {
  getHealth,
  getAuthenticatedUser,
  getInventoryMethod,
  getRegistrationInfo,
  loadImage,
};
