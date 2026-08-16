function getClientIp(req) {
  const forwardedFor =
    req.headers['x-forwarded-for'];

  if (
    typeof forwardedFor === 'string' &&
    forwardedFor.trim()
  ) {
    return forwardedFor
      .split(',')[0]
      .trim();
  }

  return (
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

function getRequestContext(req) {
  return {
    ipAddress: getClientIp(req),

    sessionId:
      req.sessionID ||
      req.headers['x-session-id'] ||
      null,

    deviceInfo:
      req.headers['user-agent'] ||
      null,
  };
}

module.exports = {
  getClientIp,
  getRequestContext,
};