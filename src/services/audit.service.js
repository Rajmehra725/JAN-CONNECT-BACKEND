const AuditLog = require("../models/AuditLog");

/**
 * Safely records security and business actions in the database
 */
async function logAudit({
  userId = null,
  userRole = "ANONYMOUS",
  actor = null,
  action,
  resourceType = "GENERAL",
  targetType = null,
  resourceId = null,
  targetId = null,
  ipAddress = null,
  userAgent = null,
  req = null,
  details = {},
  metadata = null,
}) {
  try {
    const finalActorId = userId || actor?._id || actor?.id || null;
    const finalActorRole = userRole || actor?.role || "ANONYMOUS";
    const finalTargetType = targetType || resourceType || "GENERAL";
    const finalTargetId = targetId || resourceId || null;

    let finalIp = ipAddress;
    let finalUa = userAgent;

    if (req) {
      finalIp = req.ip || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress;
      finalUa = req.headers?.["user-agent"] || null;
    }

    // Sanitize metadata/details - strip any passwords, tokens or secrets
    const cleanMeta = { ...(metadata || details || {}) };
    delete cleanMeta.password;
    delete cleanMeta.passwordHash;
    delete cleanMeta.token;
    delete cleanMeta.otp;
    delete cleanMeta.cookie;

    await AuditLog.create({
      actorId: finalActorId,
      userId: finalActorId,
      actorRole: finalActorRole,
      userRole: finalActorRole,
      action: action || "UNKNOWN_ACTION",
      targetType: finalTargetType,
      resourceType: finalTargetType,
      targetId: finalTargetId ? String(finalTargetId) : null,
      resourceId: finalTargetId ? String(finalTargetId) : null,
      ipAddress: finalIp || null,
      userAgent: finalUa || null,
      metadata: cleanMeta,
      details: cleanMeta,
    });
  } catch (err) {
    console.error("[Audit Service] Non-critical audit write warning:", err.message);
  }
}

module.exports = {
  logAudit,
  recordAudit: logAudit,
};
