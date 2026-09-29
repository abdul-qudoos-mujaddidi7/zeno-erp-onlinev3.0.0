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

    // Used for human-readable descriptions written by backend workflows.
    language:
      req.user?.language ||
      req.headers['accept-language'] ||
      'en',
  };
}

module.exports = {
  getClientIp,
  getRequestContext,
};
