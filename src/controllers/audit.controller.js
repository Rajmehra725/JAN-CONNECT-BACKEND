const AuditLog = require('../models/AuditLog');
const { successResponse, errorResponse } = require('../utils/response');

async function getAuditLogs(req, res) {
  try {
    const { action, resourceType, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('userId', 'fullName mobileNumber role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(filter)
    ]);

    return successResponse(res, {
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'ऑडिट लॉग प्राप्त हुए।');
  } catch (error) {
    return errorResponse(res, 'ऑडिट लॉग लोड करने में त्रुटि।', 500);
  }
}

module.exports = {
  getAuditLogs
};
