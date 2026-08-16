const AppError = require("../errors/AppError");

function validate(schemas = {}) {
  return function validationMiddleware(req, res, next) {
    const validated = {};

    for (const source of ["params", "query", "body"]) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);

      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));

        return next(
          new AppError(
            "The submitted data is invalid.",
            422,
            "VALIDATION_ERROR",
            details,
          ),
        );
      }

      validated[source] = result.data;
    }

    req.validated = {
      ...(req.validated || {}),
      ...validated,
    };

    next();
  };
}

module.exports = validate;
