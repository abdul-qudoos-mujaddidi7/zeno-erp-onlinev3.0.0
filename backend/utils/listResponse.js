function sendListResponse(res, result, statusCode = 200) {
  if (Array.isArray(result)) {
    return res.status(statusCode).json({
      success: true,
      data: result,
    });
  }

  const payload = {
    success: true,
    data: result?.data ?? [],
  };

  if (result?.meta) {
    payload.meta = result.meta;
  }

  if (result?.summary != null) {
    payload.summary = result.summary;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendListResponse,
};
