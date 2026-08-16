const AppError = require("../errors/AppError");

function errorHandler(error, req, res, next) {
  let finalError = error;

  if (error?.code === "ER_DUP_ENTRY") {
    finalError = new AppError(
      "This record already exists.",
      409,
      "DUPLICATE_RECORD",
    );
  }

  const statusCode = Number(finalError.statusCode || 500);

  if (statusCode >= 500) {
    console.error("Unhandled API error:", finalError);
  }

  const response = {
    success: false,
    message:
      process.env.NODE_ENV === "production" && statusCode >= 500
        ? "An unexpected server error occurred."
        : finalError.message || "An unexpected server error occurred.",
    code: finalError.code || "INTERNAL_ERROR",
  };

  if (finalError.details) {
    response.errors = finalError.details;
  }

  if (process.env.NODE_ENV !== "production" && finalError.stack) {
    response.stack = finalError.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
