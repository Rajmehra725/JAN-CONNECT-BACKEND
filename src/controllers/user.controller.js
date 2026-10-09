const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { buildScopeFilter } = require('../middleware/scope.middleware');

/**
 * POST /api/v1/users
 * Administrative user provisioning for POLITICIAN, PA_STAFF, BOOTH_WORKER
 */
async function createUser(req, res) {
  try {
    const {
      fullName,
      mobileNumber,
      password,
      role,
      constituencyId,
      wardId,
      boothId,
      officeId,
      alternateMobile,
      email,
      gender,
      occupation,
      address,
      district,
      pincode
    } = req.body;

    if (!fullName || !mobileNumber || !password || !role) {
      return errorResponse(res, 'पूरा नाम, मोबाइल नंबर, पासवर्ड और भूमिका (Role) अनिवार्य हैं।', 400);
    }

    const cleanMobile = String(mobileNumber).trim();
    if (!/^\d{10}$/.test(cleanMobile)) {
      return errorResponse(res, 'कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें।', 400);
    }

    // Role creation permission rules
    const creatorRole = req.user.role;
    if (creatorRole === 'CITIZEN' || creatorRole === 'BOOTH_WORKER') {
      return errorResponse(res, 'आपको उपयोगकर्ता बनाने की अनुमति नहीं है।', 403);
    }

    if (creatorRole === 'PA_STAFF' && !['BOOTH_WORKER', 'CITIZEN'].includes(role)) {
      return errorResponse(res, 'स्टाफ केवल बूथ कार्यकर्ता अथवा नागरिक खाता बना सकता है।', 403);
    }

    if (creatorRole === 'POLITICIAN' && !['PA_STAFF', 'BOOTH_WORKER', 'CITIZEN'].includes(role)) {
      return errorResponse(res, 'जनप्रतिनिधि केवल पीए स्टाफ या बूथ कार्यकर्ता बना सकते हैं।', 403);
    }

    if (role === 'SUPER_ADMIN' && creatorRole !== 'SUPER_ADMIN') {
      return errorResponse(res, 'केवल मुख्य सुपर एडमिन ही नया सुपर एडमिन बना सकता है।', 403);
    }

    // Check duplicate mobile
    const existing = await User.findOne({ mobileNumber: cleanMobile });
    if (existing) {
      return errorResponse(res, 'यह मोबाइल नंबर पहले से पंजीकृत है।', 409);
    }

    // Scope check: If creator has a specific constituency, enforce it
    let targetConstituency = constituencyId;
    if (creatorRole !== 'SUPER_ADMIN' && req.user.constituencyId) {
      targetConstituency = req.user.constituencyId;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName: fullName.trim(),
      mobileNumber: cleanMobile,
      passwordHash,
      role,
      accountStatus: 'ACTIVE',
      constituencyId: targetConstituency || null,
      wardId: wardId || null,
      boothId: boothId || null,
      officeId: officeId || null,
      alternateMobile: alternateMobile ? String(alternateMobile).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      gender,
      occupation,
      address,
      district,
      pincode,
      createdBy: req.user._id
    });

    await newUser.save();

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'ADMIN_CREATE_USER',
      resourceType: 'User',
      resourceId: newUser._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { targetRole: role, mobileNumber: cleanMobile }
    });

    return successResponse(res, { user: newUser.toJSON() }, `उपयोगकर्ता (${role}) सफलतापूर्वक बनाया गया।`, 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'यह मोबाइल नंबर पहले से पंजीकृत है।', 409);
    }
    return errorResponse(res, `उपयोगकर्ता निर्माण में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/users
 * Scoped user list with pagination and filters
 */
async function getUsers(req, res) {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build base query enforcing role scope
    let filter = buildScopeFilter(req.user);

    if (role) {
      filter.role = role;
    }
    if (status) {
      filter.accountStatus = status;
    }
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: regex },
        { mobileNumber: regex },
        { email: regex }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .populate('constituencyId', 'name code')
        .populate('wardId', 'name number')
        .populate('boothId', 'name number')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(filter)
    ]);

    return successResponse(res, {
      users: users.map(u => u.toJSON()),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'उपयोगकर्ता सूची प्राप्त हुई।');
  } catch (error) {
    return errorResponse(res, `उपयोगकर्ता सूची लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/users/:id
 */
async function getUserById(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .populate('constituencyId', 'name code district')
      .populate('wardId', 'name number')
      .populate('boothId', 'name number')
      .populate('officeId', 'name address');

    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    // Role-based authorization: Can this user view this record?
    if (req.user.role !== 'SUPER_ADMIN') {
      if (req.user.role === 'CITIZEN' && user._id.toString() !== req.user._id.toString()) {
        return errorResponse(res, 'अन्य उपयोगकर्ता का डेटा देखने की अनुमति नहीं है।', 403);
      }
      if (req.user.constituencyId && user.constituencyId &&
          user.constituencyId.toString() !== req.user.constituencyId.toString()) {
        return errorResponse(res, 'अन्य क्षेत्र के उपयोगकर्ता का विवरण देखने की अनुमति नहीं है।', 403);
      }
    }

    return successResponse(res, { user: user.toJSON() }, 'उपयोगकर्ता विवरण प्राप्त हुआ।');
  } catch (error) {
    return errorResponse(res, 'उपयोगकर्ता विवरण प्राप्त करने में त्रुटि।', 500);
  }
}

/**
 * PATCH /api/v1/users/:id
 * Update user profile or assignment
 */
async function updateUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    // Authorization
    const isSelf = req.user._id.toString() === user._id.toString();
    const isAdmin = ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'].includes(req.user.role);

    if (!isSelf && !isAdmin) {
      return errorResponse(res, 'इस प्रोफाइल को संशोधित करने की अनुमति नहीं है।', 403);
    }

    const {
      fullName,
      email,
      alternateMobile,
      gender,
      occupation,
      preferredLanguage,
      address,
      villageMohalla,
      district,
      pincode,
      wardId,
      boothId,
      officeId,
      accountStatus
    } = req.body;

    if (fullName) user.fullName = fullName.trim();
    if (email !== undefined) user.email = email ? email.trim().toLowerCase() : undefined;
    if (alternateMobile !== undefined) user.alternateMobile = alternateMobile ? String(alternateMobile).trim() : undefined;
    if (gender) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (address !== undefined) user.address = address;
    if (villageMohalla !== undefined) user.villageMohalla = villageMohalla;
    if (district !== undefined) user.district = district;
    if (pincode !== undefined) user.pincode = pincode;

    // Only Admin can update organizational assignments or status
    if (isAdmin) {
      if (wardId !== undefined) user.wardId = wardId || null;
      if (boothId !== undefined) user.boothId = boothId || null;
      if (officeId !== undefined) user.officeId = officeId || null;
      if (accountStatus && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(accountStatus)) {
        user.accountStatus = accountStatus;
      }
    }

    await user.save();

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'USER_UPDATE',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { updatedFields: Object.keys(req.body) }
    });

    return successResponse(res, { user: user.toJSON() }, 'प्रोफाइल सफलतापूर्वक अपडेट की गई।');
  } catch (error) {
    return errorResponse(res, `प्रोफाइल अपडेट विफल: ${error.message}`, 500);
  }
}

/**
 * PATCH /api/v1/users/:id/status
 * Toggle account status: ACTIVE / SUSPENDED / DEACTIVATED
 */
async function updateAccountStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
      return errorResponse(res, 'अमान्य स्थिति। मान्य स्थितियां: ACTIVE, SUSPENDED, DEACTIVATED', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    if (user.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'सुपर एडमिन की स्थिति केवल सुपर एडमिन बदल सकता है।', 403);
    }

    user.accountStatus = status;
    await user.save();

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'USER_STATUS_CHANGE',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { newStatus: status }
    });

    return successResponse(res, { user: user.toJSON() }, `उपयोगकर्ता स्थिति बदलकर [${status}] कर दी गई।`);
  } catch (error) {
    return errorResponse(res, 'स्थिति बदलने में त्रुटि।', 500);
  }
}

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  updateAccountStatus
};
