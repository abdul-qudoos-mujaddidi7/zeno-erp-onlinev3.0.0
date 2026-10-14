function isSuperAdminSession(session) {
  return (
    session?.user?.username === "superadmin" &&
    Number(session.user.id) === 0 &&
    Number(session.user.org_id) === 0
  );
}

function requireSuperAdminSession(req, res, next) {
  if (isSuperAdminSession(req.session)) {
    return next();
  }

  if (req.accepts("html")) {
    return res.redirect(303, "/smart-super-admin/login");
  }

  return res.status(403).send("Only an authenticated superadmin can access this panel.");
}

function requireSameOriginForChanges(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const requestHost = req.get("host");
  const source = req.get("origin") || req.get("referer");
  const forwardedProtocol = req.get("x-forwarded-proto");
  const requestProtocol = (forwardedProtocol || req.protocol || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  let sourceOrigin;

  try {
    sourceOrigin = source ? new URL(source).origin : null;
  } catch (error) {
    sourceOrigin = null;
  }

  if (
    requestHost &&
    ["http", "https"].includes(requestProtocol) &&
    sourceOrigin === `${requestProtocol}://${requestHost.toLowerCase()}`
  ) {
    return next();
  }

  return res.status(403).send("The request origin could not be verified.");
}

module.exports = {
  isSuperAdminSession,
  requireSameOriginForChanges,
  requireSuperAdminSession,
};
