const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const User = require('../models/User');
const Designation = require('../models/Designation');
const Department = require('../models/Department');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { buildScopeFilter } = require('../middleware/scope.middleware');
const { normalizePhoneNumber } = require('../utils/phone');

/**
 * Sanitize cell value to prevent CSV / Excel Formula Injection (CWE-1236)
 */
function sanitizeCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/**
 * POST /api/v1/users
 * Administrative user provisioning with full professional, geographical, and verification fields.
 * Roles and designations are completely decoupled.
 */
async function createUser(req, res) {
  try {
    const {
      fullName,
      mobileNumber,
      password,
      role = 'CITIZEN',
      // Legacy / Account linkage
      constituencyId,
      wardId,
      boothId,
      officeId,
      alternateMobile,
      email,
      gender,
      occupation,
      address,
      pincode,
      voterId,
      familyId,
      dateOfBirth,
      preferredLanguage,
      villageMohalla,
      gpsLocation,
      emergencyContact,
      profilePhoto,
      // Professional / Designation Fields
      designationId,
      designation,
      designationCategory,
      departmentId,
      department,
      officialEmail,
      officeAddress,
      officeContact,
      termStartDate,
      termEndDate,
      // Geographical Master Fields
      state = 'Madhya Pradesh',
      division,
      district,
      assemblyConstituency,
      parliamentaryConstituency,
      areaType,
      tehsil,
      developmentBlock,
      localBodyType,
      localBody,
      gramPanchayat,
      village,
      wardNumber,
      wardName,
      boothNumber,
      // Record & Verification
      verificationStatus = 'UNVERIFIED',
      verificationNotes,
      sourceOfInformation = 'ADMIN_MANUAL',
      isPublicDirectoryVisible = false
    } = req.body;

    if (!fullName || !mobileNumber || !password || !role) {
      return errorResponse(res, 'पूरा नाम, मोबाइल नंबर, पासवर्ड और भूमिका (Role) अनिवार्य हैं।', 400);
    }

    const { isValid: isPhoneValid, normalized: cleanMobile, error: phoneErr } = normalizePhoneNumber(mobileNumber);
    if (!isPhoneValid) {
      return errorResponse(res, phoneErr || 'कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें।', 400);
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

    // If designationId is provided, enrich designation details
    let resolvedDesignation = designation ? designation.trim() : '';
    let resolvedCategory = designationCategory || 'POLITICAL';
    if (designationId) {
      try {
        const desDoc = await Designation.findById(designationId);
        if (desDoc) {
          resolvedDesignation = desDoc.title;
          resolvedCategory = desDoc.category;
        }
      } catch (err) {
        // Ignore lookup error if invalid ObjectId
      }
    }

    // If departmentId is provided, enrich department name
    let resolvedDepartment = department ? department.trim() : '';
    if (departmentId) {
      try {
        const deptDoc = await Department.findById(departmentId);
        if (deptDoc) {
          resolvedDepartment = deptDoc.name;
        }
      } catch (err) {
        // Ignore lookup error
      }
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
      // Organization / Links
      constituencyId: targetConstituency || null,
      wardId: wardId || null,
      boothId: boothId || null,
      officeId: officeId || null,
      alternateMobile: alternateMobile ? String(alternateMobile).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      gender,
      occupation: occupation ? occupation.trim() : '',
      address: address ? address.trim() : '',
      pincode: pincode ? pincode.trim() : '',
      voterId: voterId ? voterId.trim().toUpperCase() : '',
      familyId: familyId ? familyId.trim() : '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      preferredLanguage: preferredLanguage || 'hi',
      villageMohalla: villageMohalla ? villageMohalla.trim() : '',
      gpsLocation: gpsLocation ? gpsLocation.trim() : '',
      emergencyContact: emergencyContact ? emergencyContact.trim() : '',
      profilePhoto: profilePhoto || null,
      // Professional / Designation Fields
      designationId: designationId || null,
      designation: resolvedDesignation,
      designationCategory: resolvedCategory,
      departmentId: departmentId || null,
      department: resolvedDepartment,
      officialEmail: officialEmail ? officialEmail.trim().toLowerCase() : undefined,
      officeAddress: officeAddress ? officeAddress.trim() : '',
      officeContact: officeContact ? officeContact.trim() : '',
      termStartDate: termStartDate ? new Date(termStartDate) : undefined,
      termEndDate: termEndDate ? new Date(termEndDate) : undefined,
      // Geographical Master Fields
      state: state ? state.trim() : 'Madhya Pradesh',
      division: division ? division.trim() : '',
      district: district ? district.trim() : '',
      assemblyConstituency: assemblyConstituency ? assemblyConstituency.trim() : '',
      parliamentaryConstituency: parliamentaryConstituency ? parliamentaryConstituency.trim() : '',
      areaType: areaType || 'RURAL',
      tehsil: tehsil ? tehsil.trim() : '',
      developmentBlock: developmentBlock ? developmentBlock.trim() : '',
      localBodyType: localBodyType ? localBodyType.trim() : '',
      localBody: localBody ? localBody.trim() : '',
      gramPanchayat: gramPanchayat ? gramPanchayat.trim() : '',
      village: village ? village.trim() : '',
      wardNumber: wardNumber ? wardNumber.trim() : '',
      wardName: wardName ? wardName.trim() : '',
      boothNumber: boothNumber ? boothNumber.trim() : '',
      // Verification & Audit
      verificationStatus: verificationStatus || 'UNVERIFIED',
      verifiedBy: verificationStatus === 'VERIFIED' ? req.user._id : null,
      verifiedAt: verificationStatus === 'VERIFIED' ? new Date() : null,
      verificationNotes: verificationNotes ? verificationNotes.trim() : '',
      sourceOfInformation: sourceOfInformation || 'ADMIN_MANUAL',
      isPublicDirectoryVisible: Boolean(isPublicDirectoryVisible),
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
      details: { targetRole: role, mobileNumber: cleanMobile, designation: resolvedDesignation }
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
 * Build Mongoose query filter from rich hierarchical cascading query parameters
 */
function buildUserFilter(query, userScope) {
  let filter = buildScopeFilter(userScope, { isUserQuery: true });

  const {
    role,
    status,
    verificationStatus,
    isPublicDirectoryVisible,
    // Geography filters
    state,
    division,
    district,
    assemblyConstituency,
    parliamentaryConstituency,
    areaType,
    tehsil,
    developmentBlock,
    localBodyType,
    localBody,
    gramPanchayat,
    village,
    wardNumber,
    wardName,
    boothNumber,
    constituencyId,
    wardId,
    boothId,
    // Professional filters
    designationCategory,
    designation,
    designationId,
    departmentId,
    department,
    // Missing info filters
    designationStatus,
    locationStatus,
    // Date filters
    startDate,
    endDate,
    search
  } = query;

  if (role && role !== 'ALL') {
    filter.role = role;
  }
  if (status && status !== 'ALL') {
    filter.accountStatus = status;
  }
  if (verificationStatus && verificationStatus !== 'ALL') {
    filter.verificationStatus = verificationStatus;
  }
  if (isPublicDirectoryVisible !== undefined && isPublicDirectoryVisible !== 'ALL' && isPublicDirectoryVisible !== '') {
    filter.isPublicDirectoryVisible = String(isPublicDirectoryVisible) === 'true';
  }

  // Geography filters
  if (state && state !== 'ALL') filter.state = new RegExp(`^${state.trim()}$`, 'i');
  if (division && division !== 'ALL') filter.division = new RegExp(`^${division.trim()}$`, 'i');
  if (district && district !== 'ALL') filter.district = new RegExp(`^${district.trim()}$`, 'i');
  if (assemblyConstituency && assemblyConstituency !== 'ALL') {
    filter.assemblyConstituency = new RegExp(`^${assemblyConstituency.trim()}$`, 'i');
  }
  if (parliamentaryConstituency && parliamentaryConstituency !== 'ALL') {
    filter.parliamentaryConstituency = new RegExp(`^${parliamentaryConstituency.trim()}$`, 'i');
  }
  if (areaType && areaType !== 'ALL') filter.areaType = areaType;
  if (tehsil && tehsil !== 'ALL') filter.tehsil = new RegExp(`^${tehsil.trim()}$`, 'i');
  if (developmentBlock && developmentBlock !== 'ALL') {
    filter.developmentBlock = new RegExp(`^${developmentBlock.trim()}$`, 'i');
  }
  if (localBodyType && localBodyType !== 'ALL') filter.localBodyType = localBodyType;
  if (localBody && localBody !== 'ALL') filter.localBody = new RegExp(`^${localBody.trim()}$`, 'i');
  if (gramPanchayat && gramPanchayat !== 'ALL') {
    filter.gramPanchayat = new RegExp(`^${gramPanchayat.trim()}$`, 'i');
  }
  if (village && village !== 'ALL') filter.village = new RegExp(`^${village.trim()}$`, 'i');
  if (wardNumber && wardNumber !== 'ALL') filter.wardNumber = String(wardNumber).trim();
  if (wardName && wardName !== 'ALL') filter.wardName = new RegExp(`^${wardName.trim()}$`, 'i');
  if (boothNumber && boothNumber !== 'ALL') filter.boothNumber = String(boothNumber).trim();

  // Legacy Object IDs
  if (constituencyId) filter.constituencyId = constituencyId;
  if (wardId) filter.wardId = wardId;
  if (boothId) filter.boothId = boothId;

  // Professional filters
  if (designationCategory && designationCategory !== 'ALL') {
    filter.designationCategory = designationCategory;
  }
  if (designation && designation !== 'ALL') {
    filter.designation = new RegExp(`^${designation.trim()}$`, 'i');
  }
  if (designationId && designationId !== 'ALL') {
    filter.designationId = designationId;
  }
  if (departmentId && departmentId !== 'ALL') {
    filter.departmentId = departmentId;
  }
  if (department && department !== 'ALL') {
    filter.department = new RegExp(`^${department.trim()}$`, 'i');
  }

  // Missing Info Filters
  if (designationStatus === 'ASSIGNED') {
    filter.designation = { $nin: ['', null], $exists: true };
  } else if (designationStatus === 'NOT_ASSIGNED') {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { designation: { $exists: false } },
        { designation: '' },
        { designation: null }
      ]
    });
  }

  if (locationStatus === 'COMPLETE') {
    filter.district = { $nin: ['', null], $exists: true };
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { developmentBlock: { $nin: ['', null], $exists: true } },
        { localBody: { $nin: ['', null], $exists: true } }
      ]
    });
  } else if (locationStatus === 'INCOMPLETE') {
    filter.district = { $nin: ['', null], $exists: true };
    filter.$and = filter.$and || [];
    filter.$and.push({
      $and: [
        { $or: [{ developmentBlock: { $exists: false } }, { developmentBlock: '' }, { developmentBlock: null }] },
        { $or: [{ localBody: { $exists: false } }, { localBody: '' }, { localBody: null }] }
      ]
    });
  } else if (locationStatus === 'NOT_ASSIGNED') {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { district: { $exists: false } },
        { district: '' },
        { district: null }
      ]
    });
  }

  // Date filters
  if (startDate || endDate) {
    filter.createdAt = filter.createdAt || {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Multi-column Search
  if (search && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { fullName: regex },
      { mobileNumber: regex },
      { email: regex },
      { officialEmail: regex },
      { voterId: regex },
      { familyId: regex },
      { designation: regex },
      { department: regex },
      { district: regex },
      { gramPanchayat: regex },
      { village: regex },
      { localBody: regex },
      { developmentBlock: regex },
      { wardNumber: regex },
      { assemblyConstituency: regex }
    ];
  }

  return filter;
}

/**
 * GET /api/v1/users
 * Scoped user list with comprehensive cascading filters, missing info filters, and pagination
 */
async function getUsers(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = buildUserFilter(req.query, req.user);

    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(filter)
        .populate('constituencyId', 'name code district')
        .populate('wardId', 'name wardNumber')
        .populate('boothId', 'name boothNumber')
        .populate('officeId', 'name address')
        .populate('designationId', 'title titleHi category level')
        .populate('departmentId', 'name nameHi code')
        .populate('verifiedBy', 'fullName role')
        .sort(sortObj)
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
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .populate('officeId', 'name address')
      .populate('designationId', 'title titleHi category level')
      .populate('departmentId', 'name nameHi code')
      .populate('verifiedBy', 'fullName role')
      .populate('createdBy', 'fullName role');

    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    // Role-based authorization
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
 * Partial update for user profile, professional, geographical, and administrative fields
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
      // Basic Info
      fullName,
      email,
      alternateMobile,
      gender,
      occupation,
      voterId,
      familyId,
      dateOfBirth,
      preferredLanguage,
      address,
      villageMohalla,
      pincode,
      gpsLocation,
      emergencyContact,
      profilePhoto,
      // Professional / Designation
      designationId,
      designation,
      designationCategory,
      departmentId,
      department,
      officialEmail,
      officeAddress,
      officeContact,
      termStartDate,
      termEndDate,
      // Geography
      state,
      division,
      district,
      assemblyConstituency,
      parliamentaryConstituency,
      areaType,
      tehsil,
      developmentBlock,
      localBodyType,
      localBody,
      gramPanchayat,
      village,
      wardNumber,
      wardName,
      boothNumber,
      // Privileged Administrative / Organization fields
      wardId,
      boothId,
      officeId,
      constituencyId,
      role,
      accountStatus,
      // Verification fields
      verificationStatus,
      verificationNotes,
      sourceOfInformation,
      isPublicDirectoryVisible
    } = req.body;

    // Basic updates
    if (fullName) user.fullName = fullName.trim();
    if (email !== undefined) user.email = email ? email.trim().toLowerCase() : undefined;
    if (alternateMobile !== undefined) user.alternateMobile = alternateMobile ? String(alternateMobile).trim() : undefined;
    if (gender) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation ? occupation.trim() : '';
    if (voterId !== undefined) user.voterId = voterId ? voterId.trim().toUpperCase() : '';
    if (familyId !== undefined) user.familyId = familyId ? familyId.trim() : '';
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (address !== undefined) user.address = address ? address.trim() : '';
    if (villageMohalla !== undefined) user.villageMohalla = villageMohalla ? villageMohalla.trim() : '';
    if (pincode !== undefined) user.pincode = pincode ? pincode.trim() : '';
    if (gpsLocation !== undefined) user.gpsLocation = gpsLocation ? gpsLocation.trim() : '';
    if (emergencyContact !== undefined) user.emergencyContact = emergencyContact ? emergencyContact.trim() : '';
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto || null;

    // Professional updates
    if (designation !== undefined) user.designation = designation ? designation.trim() : '';
    if (designationCategory !== undefined) user.designationCategory = designationCategory;
    if (designationId !== undefined) {
      user.designationId = designationId || null;
      if (designationId) {
        try {
          const desDoc = await Designation.findById(designationId);
          if (desDoc) {
            user.designation = desDoc.title;
            user.designationCategory = desDoc.category;
          }
        } catch (e) {}
      }
    }
    if (department !== undefined) user.department = department ? department.trim() : '';
    if (departmentId !== undefined) {
      user.departmentId = departmentId || null;
      if (departmentId) {
        try {
          const depDoc = await Department.findById(departmentId);
          if (depDoc) user.department = depDoc.name;
        } catch (e) {}
      }
    }
    if (officialEmail !== undefined) user.officialEmail = officialEmail ? officialEmail.trim().toLowerCase() : undefined;
    if (officeAddress !== undefined) user.officeAddress = officeAddress ? officeAddress.trim() : '';
    if (officeContact !== undefined) user.officeContact = officeContact ? officeContact.trim() : '';
    if (termStartDate !== undefined) user.termStartDate = termStartDate ? new Date(termStartDate) : null;
    if (termEndDate !== undefined) user.termEndDate = termEndDate ? new Date(termEndDate) : null;

    // Geographical updates
    if (state !== undefined) user.state = state ? state.trim() : 'Madhya Pradesh';
    if (division !== undefined) user.division = division ? division.trim() : '';
    if (district !== undefined) user.district = district ? district.trim() : '';
    if (assemblyConstituency !== undefined) user.assemblyConstituency = assemblyConstituency ? assemblyConstituency.trim() : '';
    if (parliamentaryConstituency !== undefined) user.parliamentaryConstituency = parliamentaryConstituency ? parliamentaryConstituency.trim() : '';
    if (areaType !== undefined) user.areaType = areaType;
    if (tehsil !== undefined) user.tehsil = tehsil ? tehsil.trim() : '';
    if (developmentBlock !== undefined) user.developmentBlock = developmentBlock ? developmentBlock.trim() : '';
    if (localBodyType !== undefined) user.localBodyType = localBodyType ? localBodyType.trim() : '';
    if (localBody !== undefined) user.localBody = localBody ? localBody.trim() : '';
    if (gramPanchayat !== undefined) user.gramPanchayat = gramPanchayat ? gramPanchayat.trim() : '';
    if (village !== undefined) user.village = village ? village.trim() : '';
    if (wardNumber !== undefined) user.wardNumber = wardNumber ? wardNumber.trim() : '';
    if (wardName !== undefined) user.wardName = wardName ? wardName.trim() : '';
    if (boothNumber !== undefined) user.boothNumber = boothNumber ? boothNumber.trim() : '';

    // Administrative privileged updates
    if (isAdmin) {
      if (wardId !== undefined) user.wardId = wardId || null;
      if (boothId !== undefined) user.boothId = boothId || null;
      if (officeId !== undefined) user.officeId = officeId || null;
      if (constituencyId !== undefined) user.constituencyId = constituencyId || null;
      if (accountStatus && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(accountStatus)) {
        user.accountStatus = accountStatus;
      }
      if (role && req.user.role === 'SUPER_ADMIN' && ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER', 'CITIZEN'].includes(role)) {
        user.role = role;
      }
      if (verificationStatus && ['UNVERIFIED', 'VERIFIED', 'REJECTED', 'FLAGGED'].includes(verificationStatus)) {
        user.verificationStatus = verificationStatus;
        if (verificationStatus === 'VERIFIED') {
          user.verifiedBy = req.user._id;
          user.verifiedAt = new Date();
        } else if (verificationStatus === 'UNVERIFIED') {
          user.verifiedBy = null;
          user.verifiedAt = null;
        }
      }
      if (verificationNotes !== undefined) user.verificationNotes = verificationNotes ? verificationNotes.trim() : '';
      if (sourceOfInformation !== undefined) user.sourceOfInformation = sourceOfInformation;
      if (isPublicDirectoryVisible !== undefined) user.isPublicDirectoryVisible = Boolean(isPublicDirectoryVisible);
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
 * PATCH /api/v1/users/:id/verify
 * Verification management for member / representative records
 */
async function verifyUser(req, res) {
  try {
    const { verificationStatus, verificationNotes, isPublicDirectoryVisible } = req.body;

    if (!verificationStatus || !['UNVERIFIED', 'VERIFIED', 'REJECTED', 'FLAGGED'].includes(verificationStatus)) {
      return errorResponse(res, 'अमान्य सत्यापन स्थिति। मान्य: UNVERIFIED, VERIFIED, REJECTED, FLAGGED', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    user.verificationStatus = verificationStatus;
    if (verificationStatus === 'VERIFIED') {
      user.verifiedBy = req.user._id;
      user.verifiedAt = new Date();
    } else if (verificationStatus === 'UNVERIFIED') {
      user.verifiedBy = null;
      user.verifiedAt = null;
    }

    if (verificationNotes !== undefined) {
      user.verificationNotes = verificationNotes ? verificationNotes.trim() : '';
    }

    if (isPublicDirectoryVisible !== undefined) {
      user.isPublicDirectoryVisible = Boolean(isPublicDirectoryVisible);
    }

    await user.save();

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'USER_VERIFY',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { verificationStatus, isPublicDirectoryVisible: user.isPublicDirectoryVisible }
    });

    return successResponse(res, { user: user.toJSON() }, `सत्यापन स्थिति [${verificationStatus}] में अपडेट हुई।`);
  } catch (error) {
    return errorResponse(res, `सत्यापन विफल: ${error.message}`, 500);
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

/**
 * DELETE /api/v1/users/:id
 * Delete or deactivate member account with safety retention rules
 */
async function deleteUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    if (user._id.toString() === req.user._id.toString()) {
      return errorResponse(res, 'आप अपना स्वयं का खाता नहीं हटा सकते।', 400);
    }

    if (user.role === 'SUPER_ADMIN') {
      return errorResponse(res, 'सुपर एडमिन खाते को हटाया नहीं जा सकता।', 403);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      if (req.user.role === 'POLITICIAN' && !['BOOTH_WORKER', 'CITIZEN', 'PA_STAFF'].includes(user.role)) {
        return errorResponse(res, 'आपको इस उपयोगकर्ता को हटाने की अनुमति नहीं है।', 403);
      }
      if (req.user.role === 'PA_STAFF' && !['BOOTH_WORKER', 'CITIZEN'].includes(user.role)) {
        return errorResponse(res, 'स्टाफ केवल बूथ कार्यकर्ता अथवा नागरिक खाता हटा सकता है।', 403);
      }
    }

    const { hardDelete } = req.query;
    const Complaint = require('../models/Complaint');
    const complaintCount = await Complaint.countDocuments({ citizenId: user._id });

    // If user has existing records or hardDelete is not explicitly requested by Super Admin, soft-deactivate
    if (complaintCount > 0 || String(hardDelete) !== 'true' || req.user.role !== 'SUPER_ADMIN') {
      user.accountStatus = 'DEACTIVATED';
      user.isDeleted = true;
      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
      await user.save();

      await logAudit({
        userId: req.user._id,
        userRole: req.user.role,
        action: 'USER_DEACTIVATE',
        resourceType: 'User',
        resourceId: user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        details: { targetRole: user.role, reason: complaintCount > 0 ? 'RETENTION_PRESERVE_HISTORY' : 'DEACTIVATE_BY_ADMIN' }
      });

      return successResponse(
        res,
        { user: user.toJSON(), deactivated: true },
        'उपयोगकर्ता खाता सफलतापूर्वक निष्क्रिय (Deactivated) कर दिया गया है।'
      );
    }

    await User.findByIdAndDelete(user._id);

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'USER_DELETE',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { deletedMobile: user.mobileNumber, role: user.role }
    });

    return successResponse(res, { deleted: true }, 'उपयोगकर्ता खाता डेटाबेस से सफलतापूर्वक हटा दिया गया है।');
  } catch (error) {
    return errorResponse(res, `उपयोगकर्ता हटाने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * PATCH /api/v1/users/:id/restore
 * Restore soft-deleted / deactivated user account
 */
async function restoreUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    user.accountStatus = 'ACTIVE';
    user.isDeleted = false;
    user.deletedAt = null;
    user.deletedBy = null;
    await user.save();

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'USER_RESTORE',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { restoredMobile: user.mobileNumber, role: user.role }
    });

    return successResponse(
      res,
      { user: user.toJSON(), restored: true },
      'उपयोगकर्ता खाता सफलतापूर्वक पुनः सक्रिय (Restored) कर दिया गया है।'
    );
  } catch (error) {
    return errorResponse(res, `खाता पुनर्प्राप्ति में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET or POST /api/v1/users/export
 * Export users with support for ALL, FILTERED, or SELECTED export modes.
 * Formats: Excel (.xlsx) or CSV. Prevents formula injection and scientific notation on mobile numbers.
 */
async function exportUsers(req, res) {
  try {
    const queryParams = { ...req.query, ...(req.body || {}) };
    const {
      exportType = 'FILTERED', // 'ALL' | 'FILTERED' | 'SELECTED'
      userIds,
      format = 'xlsx'
    } = queryParams;

    let filter = {};

    if (exportType === 'SELECTED') {
      let ids = [];
      if (Array.isArray(userIds)) {
        ids = userIds;
      } else if (typeof userIds === 'string' && userIds.trim()) {
        ids = userIds.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (ids.length === 0) {
        return errorResponse(res, 'निर्यात के लिए कम से कम एक सदस्य का चयन करें।', 400);
      }
      filter = { _id: { $in: ids } };
    } else if (exportType === 'ALL') {
      filter = buildScopeFilter(req.user, { isUserQuery: true });
    } else {
      // FILTERED mode: Apply all user filters
      filter = buildUserFilter(queryParams, req.user);
    }

    const users = await User.find(filter)
      .populate('constituencyId', 'name')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .sort({ createdAt: -1 })
      .limit(10000);

    const data = users.map((u, idx) => ({
      'क्रमांक (S.No)': idx + 1,
      'पूरा नाम (Full Name)': sanitizeCell(u.fullName),
      // Prefixing single quote ensures Excel/Sheets renders text without scientific notation
      'मोबाइल नंबर (Mobile)': `'${u.mobileNumber || ''}`,
      'भूमिका (Role)': sanitizeCell(u.role),
      'स्थिति (Status)': sanitizeCell(u.accountStatus),
      'सत्यापन स्थिति (Verification)': sanitizeCell(u.verificationStatus || 'UNVERIFIED'),
      'पदनाम (Designation)': sanitizeCell(u.designation || ''),
      'श्रेणी (Category)': sanitizeCell(u.designationCategory || ''),
      'विभाग (Department)': sanitizeCell(u.department || ''),
      'क्षेत्र प्रकार (Area Type)': sanitizeCell(u.areaType || ''),
      'राज्य (State)': sanitizeCell(u.state || 'Madhya Pradesh'),
      'संभाग (Division)': sanitizeCell(u.division || ''),
      'जिला (District)': sanitizeCell(u.district || ''),
      'तहसील (Tehsil)': sanitizeCell(u.tehsil || ''),
      'विकासखंड (Block)': sanitizeCell(u.developmentBlock || ''),
      'ग्राम पंचायत (Gram Panchayat)': sanitizeCell(u.gramPanchayat || ''),
      'गांव (Village)': sanitizeCell(u.village || ''),
      'निकाय (Local Body)': sanitizeCell(u.localBody || ''),
      'वार्ड नंबर (Ward)': sanitizeCell(u.wardNumber || u.wardId?.wardNumber || ''),
      'विधानसभा (Constituency)': sanitizeCell(u.assemblyConstituency || u.constituencyId?.name || ''),
      'लोकसभा (Parliamentary)': sanitizeCell(u.parliamentaryConstituency || ''),
      'बूथ नंबर (Booth)': sanitizeCell(u.boothNumber || u.boothId?.boothNumber || ''),
      'मतदाता पहचान पत्र (Voter ID)': sanitizeCell(u.voterId || ''),
      'लिंग (Gender)': sanitizeCell(u.gender || ''),
      'ईमेल (Email)': sanitizeCell(u.email || ''),
      'कार्यालयीन ईमेल (Official Email)': sanitizeCell(u.officialEmail || ''),
      'पता (Address)': sanitizeCell(u.address || ''),
      'पंजीकरण तिथि (Registered At)': u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Members');

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'ADMIN_EXPORT_USERS',
      resourceType: 'User',
      resourceId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { exportType, format, count: users.length }
    });

    if (String(format).toLowerCase() === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="jan-connect-members-${Date.now()}.csv"`);
      return res.status(200).send('\uFEFF' + csv);
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="jan-connect-members-${Date.now()}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return errorResponse(res, `सदस्य निर्यात में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/users/import/template
 * Download standardized Excel template for member import
 */
async function getImportTemplate(req, res) {
  try {
    const sampleData = [
      {
        'नाम (Name)': 'रमेश कुमार शर्मा',
        'मोबाइल नंबर (Mobile)': '9876543210',
        'भूमिका (Role)': 'CITIZEN',
        'पदनाम (Designation)': 'सक्रिय नागरिक',
        'विभाग (Department)': '',
        'श्रेणी (Category)': 'POLITICAL',
        'क्षेत्र प्रकार (Area Type)': 'RURAL',
        'जिला (District)': 'सतना',
        'तहसील (Tehsil)': 'रघुराजनगर',
        'विकासखंड (Block)': 'सोहावल',
        'ग्राम पंचायत (Gram Panchayat)': 'सज्जनपुर',
        'गांव (Village)': 'सज्जनपुर',
        'विधानसभा (Constituency)': 'सतना',
        'वार्ड नंबर (Ward)': '',
        'पता (Address)': 'मुख्य मार्ग, सज्जनपुर'
      },
      {
        'नाम (Name)': 'सुनीता देवी',
        'मोबाइल नंबर (Mobile)': '9876543211',
        'भूमिका (Role)': 'CITIZEN',
        'पदनाम (Designation)': 'वार्ड प्रभारी',
        'विभाग (Department)': '',
        'श्रेणी (Category)': 'POLITICAL',
        'क्षेत्र प्रकार (Area Type)': 'URBAN',
        'जिला (District)': 'सतना',
        'तहसील (Tehsil)': 'रघुराजनगर',
        'विकासखंड (Block)': '',
        'निकाय (Local Body)': 'नगर पालिक निगम सतना',
        'वार्ड नंबर (Ward)': '12',
        'विधानसभा (Constituency)': 'सतना',
        'पता (Address)': 'मकान नं 45, गांधी नगर'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Template');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="jan-connect-members-template.xlsx"');
    return res.status(200).send(buffer);
  } catch (error) {
    return errorResponse(res, `टेम्पलेट डाउनलोड में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * Helper to detect column mappings in arbitrary Excel sheet
 */
function detectColumnMappings(headers, customMapping = {}) {
  const mapping = {
    nameCol: customMapping.nameCol || null,
    phoneCol: customMapping.phoneCol || null,
    roleCol: customMapping.roleCol || null,
    designationCol: customMapping.designationCol || null,
    categoryCol: customMapping.categoryCol || null,
    departmentCol: customMapping.departmentCol || null,
    districtCol: customMapping.districtCol || null,
    areaTypeCol: customMapping.areaTypeCol || null,
    blockCol: customMapping.blockCol || null,
    tehsilCol: customMapping.tehsilCol || null,
    panchayatCol: customMapping.panchayatCol || null,
    villageCol: customMapping.villageCol || null,
    localBodyCol: customMapping.localBodyCol || null,
    wardCol: customMapping.wardCol || null,
    constituencyCol: customMapping.constituencyCol || null,
    addressCol: customMapping.addressCol || null,
    voterIdCol: customMapping.voterIdCol || null
  };

  const dictionary = {
    nameCol: ['name', 'fullname', 'full name', 'नाम', 'पूरा नाम', 'सदस्य नाम', 'सदस्य का नाम', 'member name', 'first name'],
    phoneCol: ['phone', 'phonenumber', 'phone number', 'mobile', 'mobilenumber', 'mobile number', 'contact', 'contact number', 'मोबाइल', 'फ़ोन', 'फोन', 'मोबाइल नंबर', 'सम्पर्क', 'संपर्क', 'mobile no', 'phone no', 'contact no'],
    roleCol: ['role', 'भूमिका', 'user role'],
    designationCol: ['designation', 'पद', 'पदनाम', 'post', 'designation name'],
    categoryCol: ['category', 'श्रेणी', 'वर्ग', 'designation category'],
    departmentCol: ['department', 'विभाग', 'dept'],
    districtCol: ['district', 'जिला', 'dist'],
    areaTypeCol: ['area type', 'areatype', 'क्षेत्र प्रकार', 'क्षेत्र'],
    blockCol: ['block', 'development block', 'विकासखंड', 'ब्लॉक'],
    tehsilCol: ['tehsil', 'तहसील'],
    panchayatCol: ['gram panchayat', 'grampanchayat', 'पंचायत', 'ग्राम पंचायत', 'panchayat'],
    villageCol: ['village', 'गांव', 'ग्राम'],
    localBodyCol: ['local body', 'localbody', 'ulb', 'नगर पालिका', 'नगर निगम', 'नगर परिषद', 'निकाय'],
    wardCol: ['ward', 'ward number', 'ward no', 'वार्ड', 'वार्ड नंबर'],
    constituencyCol: ['constituency', 'assembly', 'विधानसभा', 'विधानसभा क्षेत्र', 'ac'],
    addressCol: ['address', 'पता', 'निवास'],
    voterIdCol: ['voter id', 'voterid', 'epic', 'मतदाता पहचान']
  };

  for (const [key, candidates] of Object.entries(dictionary)) {
    if (!mapping[key]) {
      mapping[key] = headers.find(h => {
        const clean = String(h).trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
        return candidates.some(c => clean === c.replace(/[^a-z0-9\u0900-\u097F]/g, ''));
      }) || null;
    }
  }

  // Fallback for simple 2-column sheets
  if (headers.length === 2) {
    if (!mapping.nameCol && !mapping.phoneCol) {
      mapping.nameCol = headers[0];
      mapping.phoneCol = headers[1];
    } else if (!mapping.nameCol) {
      mapping.nameCol = headers.find(h => h !== mapping.phoneCol) || headers[0];
    } else if (!mapping.phoneCol) {
      mapping.phoneCol = headers.find(h => h !== mapping.nameCol) || headers[1];
    }
  }

  return mapping;
}

/**
 * Split multi-person rows if cell contains multiple names or phone numbers
 * e.g., "राम / श्याम" & "9893000001, 9893000002"
 */
function expandMultiPersonRows(rawRows, nameCol, phoneCol) {
  const expanded = [];

  rawRows.forEach(row => {
    const rawName = nameCol ? String(row[nameCol] || '').trim() : String(Object.values(row)[0] || '').trim();
    const rawPhone = phoneCol ? String(row[phoneCol] || '').trim() : String(Object.values(row)[1] || '').trim();

    // Check for delimiters: / , ; |
    const splitRegex = /[\/;,|\n]+/;
    const nameParts = rawName.split(splitRegex).map(s => s.trim()).filter(Boolean);
    const phoneParts = rawPhone.split(splitRegex).map(s => s.trim()).filter(Boolean);

    if (nameParts.length > 1 || phoneParts.length > 1) {
      const count = Math.max(nameParts.length, phoneParts.length);
      for (let i = 0; i < count; i++) {
        const rowClone = { ...row };
        const subName = nameParts[i] || nameParts[0] || rawName;
        const subPhone = phoneParts[i] || phoneParts[0] || rawPhone;
        if (nameCol) rowClone[nameCol] = subName;
        if (phoneCol) rowClone[phoneCol] = subPhone;
        expanded.push(rowClone);
      }
    } else {
      expanded.push(row);
    }
  });

  return expanded;
}

/**
 * POST /api/v1/users/import/preview
 * Validate and preview uploaded Excel / CSV rows with auto header detection,
 * manual column mapping, multi-person separation, in-file and DB duplicate identification.
 */
async function previewImport(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(res, 'कृपया एक वैध Excel (.xlsx, .xls) अथवा .csv फाइल अपलोड करें।', 400);
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return errorResponse(res, 'अपलोड की गई फाइल में कोई शीट नहीं मिली।', 400);
    }

    const worksheet = workbook.Sheets[sheetName];
    const initialRawRows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    if (!initialRawRows || initialRawRows.length === 0) {
      return errorResponse(res, 'शीट में कोई डेटा पंक्ति (data row) नहीं मिली।', 400);
    }

    const headers = Object.keys(initialRawRows[0] || {});
    const customMapping = req.body || {};
    const mapping = detectColumnMappings(headers, customMapping);

    // Expand rows if multiple names / numbers were packaged into single cells
    const rawRows = expandMultiPersonRows(initialRawRows, mapping.nameCol, mapping.phoneCol);

    if (rawRows.length > 5000) {
      return errorResponse(res, 'एक समय में अधिकतम 5000 पंक्तियों का पूर्वावलोकन समर्थित है।', 400);
    }

    // Extract all candidate phone numbers for batch database lookup
    const candidateMobiles = [];
    rawRows.forEach(row => {
      const rawVal = mapping.phoneCol ? row[mapping.phoneCol] : Object.values(row)[1];
      const { isValid, normalized } = normalizePhoneNumber(rawVal);
      if (isValid && !candidateMobiles.includes(normalized)) {
        candidateMobiles.push(normalized);
      }
    });

    const existingUsers = await User.find({ mobileNumber: { $in: candidateMobiles } })
      .select('mobileNumber fullName role accountStatus designation district');
    const existingMobileMap = new Map();
    existingUsers.forEach(u => {
      existingMobileMap.set(u.mobileNumber, {
        id: u._id,
        fullName: u.fullName,
        role: u.role,
        accountStatus: u.accountStatus,
        designation: u.designation,
        district: u.district
      });
    });

    const seenInFile = new Map();
    const validatedRows = [];
    const errorList = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2;

      // Extract Name
      const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '').trim() : String(Object.values(row)[0] || '').trim();

      // Extract Phone
      const rawPhone = mapping.phoneCol ? row[mapping.phoneCol] : Object.values(row)[1];
      const { isValid: isPhoneValid, normalized: cleanMobile, error: phoneErr } = normalizePhoneNumber(rawPhone);

      const rowErrors = [];

      if (!rawName || rawName.length < 2) {
        rowErrors.push('नाम अनिवार्य है (कम से कम 2 अक्षर)');
      }

      if (!isPhoneValid) {
        rowErrors.push(phoneErr || '10 अंकों का वैध भारतीय मोबाइल नंबर अनिवार्य है');
      }

      // Check duplicates in uploaded file
      let isDuplicateInFile = false;
      let duplicateOfRow = null;
      if (isPhoneValid && cleanMobile) {
        if (seenInFile.has(cleanMobile)) {
          isDuplicateInFile = true;
          duplicateOfRow = seenInFile.get(cleanMobile);
          rowErrors.push(`फाइल में दोहराया गया मोबाइल नंबर (पंक्ति ${duplicateOfRow} पर पहले से मौजूद)`);
        } else {
          seenInFile.set(cleanMobile, rowNum);
        }
      }

      // Check database presence
      let isExistingInDb = false;
      let existingRecord = null;
      if (isPhoneValid && cleanMobile && existingMobileMap.has(cleanMobile)) {
        isExistingInDb = true;
        existingRecord = existingMobileMap.get(cleanMobile);
      }

      const isValid = rowErrors.length === 0;

      // Extract rich columns if available
      const parsedRow = {
        rowNumber: rowNum,
        fullName: rawName,
        mobileNumber: cleanMobile || String(rawPhone || '').trim(),
        rawMobile: String(rawPhone || ''),
        role: (mapping.roleCol && row[mapping.roleCol]) ? String(row[mapping.roleCol]).trim().toUpperCase() : 'CITIZEN',
        designation: mapping.designationCol ? String(row[mapping.designationCol] || '').trim() : '',
        designationCategory: mapping.categoryCol ? String(row[mapping.categoryCol] || '').trim().toUpperCase() : 'POLITICAL',
        department: mapping.departmentCol ? String(row[mapping.departmentCol] || '').trim() : '',
        district: mapping.districtCol ? String(row[mapping.districtCol] || '').trim() : '',
        areaType: mapping.areaTypeCol ? (String(row[mapping.areaTypeCol]).toUpperCase().includes('URBAN') || String(row[mapping.areaTypeCol]).includes('शहरी') ? 'URBAN' : 'RURAL') : 'RURAL',
        tehsil: mapping.tehsilCol ? String(row[mapping.tehsilCol] || '').trim() : '',
        developmentBlock: mapping.blockCol ? String(row[mapping.blockCol] || '').trim() : '',
        gramPanchayat: mapping.panchayatCol ? String(row[mapping.panchayatCol] || '').trim() : '',
        village: mapping.villageCol ? String(row[mapping.villageCol] || '').trim() : '',
        localBody: mapping.localBodyCol ? String(row[mapping.localBodyCol] || '').trim() : '',
        wardNumber: mapping.wardCol ? String(row[mapping.wardCol] || '').trim() : '',
        assemblyConstituency: mapping.constituencyCol ? String(row[mapping.constituencyCol] || '').trim() : '',
        address: mapping.addressCol ? String(row[mapping.addressCol] || '').trim() : '',
        voterId: mapping.voterIdCol ? String(row[mapping.voterIdCol] || '').trim().toUpperCase() : '',
        isValid,
        isDuplicateInFile,
        duplicateOfRow,
        isExistingInDb,
        existingRecord,
        errors: rowErrors
      };

      if (!isValid || isExistingInDb) {
        errorList.push({
          rowNumber: rowNum,
          name: rawName,
          mobile: cleanMobile || String(rawPhone || '').trim(),
          reason: isExistingInDb
            ? `डेटाबेस में पहले से पंजीकृत (${existingRecord?.fullName} - ${existingRecord?.role})`
            : rowErrors.join(', ')
        });
      }

      validatedRows.push(parsedRow);
    });

    const validRowsCount = validatedRows.filter(r => r.isValid && !r.isExistingInDb).length;
    const duplicateInFileCount = validatedRows.filter(r => r.isDuplicateInFile).length;
    const existingInDbCount = validatedRows.filter(r => r.isExistingInDb && !r.isDuplicateInFile).length;
    const invalidCount = validatedRows.filter(r => !r.isValid && !r.isDuplicateInFile).length;

    return successResponse(res, {
      headers,
      detectedMapping: {
        nameColumn: mapping.nameCol || headers[0] || 'Name',
        phoneColumn: mapping.phoneCol || headers[1] || 'Phone Number',
        ...mapping
      },
      totalRows: rawRows.length,
      validRows: validRowsCount,
      duplicateInFileRows: duplicateInFileCount,
      existingInDbRows: existingInDbCount,
      invalidRows: invalidCount,
      preview: validatedRows.slice(0, 30),
      rows: validatedRows,
      errors: errorList
    }, 'एक्सेल आयात पूर्वावलोकन सफलतापूर्वक तैयार हुआ।');
  } catch (error) {
    return errorResponse(res, `एक्सेल फ़ाइल पार्स करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/users/import/confirm
 * Safely batch import valid members from Excel with 4 distinct modes:
 * - CREATE_NEW: Create novel records, skip existing.
 * - UPDATE_EXISTING: Update existing records by mobile, do not create novel.
 * - CREATE_OR_UPDATE: Update existing records and create novel ones.
 * - SKIP_MATCHED: Strict skip on match.
 */
async function confirmImport(req, res) {
  try {
    const {
      rows,
      importMode = 'CREATE_NEW' // 'CREATE_NEW' | 'UPDATE_EXISTING' | 'CREATE_OR_UPDATE' | 'SKIP_MATCHED'
    } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse(res, 'आयात करने के लिए कोई पंक्ति प्राप्त नहीं हुई।', 400);
    }

    if (rows.length > 5000) {
      return errorResponse(res, 'अधिकतम 5000 पंक्तियों का बैच समर्थित है।', 400);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'केवल सुपर एडमिन को एक्सेल आयात करने की अनुमति है।', 403);
    }

    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('Citizen@2026#', salt);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failureList = [];

    // Filter to rows with valid phone and name and no in-file duplicate
    const validRows = rows.filter(r => r.isValid && !r.isDuplicateInFile);

    const mobilesToCheck = validRows.map(r => r.mobileNumber).filter(Boolean);
    const existingUsers = await User.find({ mobileNumber: { $in: mobilesToCheck } });
    const existingMobileMap = new Map();
    existingUsers.forEach(u => existingMobileMap.set(u.mobileNumber, u));

    const CHUNK_SIZE = 100;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const toInsert = [];

      for (const r of chunk) {
        const cleanMobile = r.mobileNumber;
        const existsInDb = existingMobileMap.has(cleanMobile);

        if (existsInDb) {
          if (importMode === 'SKIP_MATCHED' || importMode === 'CREATE_NEW') {
            skippedCount++;
            failureList.push({
              rowNumber: r.rowNumber,
              name: r.fullName,
              mobile: cleanMobile,
              reason: 'डेटाबेस में पहले से पंजीकृत सदस्य (स्किप किया गया)'
            });
            continue;
          } else if (importMode === 'UPDATE_EXISTING' || importMode === 'CREATE_OR_UPDATE') {
            try {
              const userToUpdate = existingMobileMap.get(cleanMobile);
              if (r.fullName) userToUpdate.fullName = r.fullName.trim();
              if (r.designation) userToUpdate.designation = r.designation.trim();
              if (r.designationCategory) userToUpdate.designationCategory = r.designationCategory;
              if (r.department) userToUpdate.department = r.department.trim();
              if (r.district) userToUpdate.district = r.district.trim();
              if (r.areaType) userToUpdate.areaType = r.areaType;
              if (r.tehsil) userToUpdate.tehsil = r.tehsil.trim();
              if (r.developmentBlock) userToUpdate.developmentBlock = r.developmentBlock.trim();
              if (r.gramPanchayat) userToUpdate.gramPanchayat = r.gramPanchayat.trim();
              if (r.village) userToUpdate.village = r.village.trim();
              if (r.localBody) userToUpdate.localBody = r.localBody.trim();
              if (r.wardNumber) userToUpdate.wardNumber = r.wardNumber.trim();
              if (r.assemblyConstituency) userToUpdate.assemblyConstituency = r.assemblyConstituency.trim();
              if (r.address) userToUpdate.address = r.address.trim();
              if (r.voterId) userToUpdate.voterId = r.voterId.trim();

              await userToUpdate.save();
              updatedCount++;
            } catch (uErr) {
              failedCount++;
              failureList.push({
                rowNumber: r.rowNumber,
                name: r.fullName,
                mobile: cleanMobile,
                reason: `अपडेट विफल: ${uErr.message}`
              });
            }
            continue;
          }
        }

        // Handle novel records
        if (!existsInDb) {
          if (importMode === 'UPDATE_EXISTING') {
            skippedCount++;
            failureList.push({
              rowNumber: r.rowNumber,
              name: r.fullName,
              mobile: cleanMobile,
              reason: 'केवल मौजूदा सदस्यों को अपडेट करने का मोड चयनित है (नया सदस्य नहीं बनाया गया)'
            });
            continue;
          }

          toInsert.push({
            fullName: r.fullName ? String(r.fullName).trim() : 'नागरिक',
            mobileNumber: cleanMobile,
            passwordHash: defaultPasswordHash,
            role: ['SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'].includes(r.role) ? r.role : 'CITIZEN',
            accountStatus: 'ACTIVE',
            designation: r.designation ? r.designation.trim() : '',
            designationCategory: r.designationCategory || 'POLITICAL',
            department: r.department ? r.department.trim() : '',
            state: 'Madhya Pradesh',
            district: r.district ? r.district.trim() : '',
            areaType: r.areaType || 'RURAL',
            tehsil: r.tehsil ? r.tehsil.trim() : '',
            developmentBlock: r.developmentBlock ? r.developmentBlock.trim() : '',
            gramPanchayat: r.gramPanchayat ? r.gramPanchayat.trim() : '',
            village: r.village ? r.village.trim() : '',
            localBody: r.localBody ? r.localBody.trim() : '',
            wardNumber: r.wardNumber ? r.wardNumber.trim() : '',
            assemblyConstituency: r.assemblyConstituency ? r.assemblyConstituency.trim() : '',
            address: r.address ? r.address.trim() : '',
            voterId: r.voterId ? r.voterId.trim() : '',
            sourceOfInformation: 'EXCEL_IMPORT',
            createdBy: req.user._id
          });
        }
      }

      if (toInsert.length > 0) {
        try {
          const insertRes = await User.insertMany(toInsert, { ordered: false });
          createdCount += insertRes.length;
        } catch (err) {
          if (err.writeErrors) {
            createdCount += (toInsert.length - err.writeErrors.length);
            err.writeErrors.forEach(we => {
              failedCount++;
              failureList.push({
                rowNumber: 0,
                mobile: we.errmsg,
                reason: 'डुप्लीकेट मोबाइल नंबर (E11000)'
              });
            });
          } else {
            failedCount += toInsert.length;
            failureList.push({
              rowNumber: 0,
              reason: err.message
            });
          }
        }
      }
    }

    await logAudit({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'ADMIN_IMPORT_CONFIRM',
      resourceType: 'User',
      resourceId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { importMode, created: createdCount, updated: updatedCount, skipped: skippedCount, failed: failedCount }
    });

    return successResponse(res, {
      totalProcessed: validRows.length,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      failures: failureList
    }, `एक्सेल आयात संपन्न: ${createdCount} नए सदस्य पंजीकृत, ${updatedCount} अपडेट, ${skippedCount} छोड़े गए।`);
  } catch (error) {
    return errorResponse(res, `आयात प्रक्रिया में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/users/import/error-report
 * Download an Excel file of skipped / failed rows
 */
async function exportImportErrorReport(req, res) {
  try {
    const { errors = [] } = req.body;
    if (!Array.isArray(errors) || errors.length === 0) {
      return errorResponse(res, 'डाउनलोड हेतु कोई त्रुटि रिकॉर्ड नहीं मिला।', 400);
    }

    const data = errors.map(e => ({
      'पंक्ति क्रमांक (Row)': e.rowNumber || '—',
      'नाम (Name)': sanitizeCell(e.name || ''),
      'मोबाइल नंबर (Mobile)': `'${e.mobile || ''}`,
      'अस्वीकृति / स्किप का कारण (Reason)': sanitizeCell(e.reason || e.error || '')
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Errors');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="jan-connect-import-errors-${Date.now()}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return errorResponse(res, `त्रुटि रिपोर्ट जनरेट करने में विफलता: ${error.message}`, 500);
  }
}

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  verifyUser,
  updateAccountStatus,
  deleteUser,
  restoreUser,
  exportUsers,
  getImportTemplate,
  previewImport,
  confirmImport,
  exportImportErrorReport
};
