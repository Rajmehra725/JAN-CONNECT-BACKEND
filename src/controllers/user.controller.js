const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');
const { buildScopeFilter } = require('../middleware/scope.middleware');
const { normalizePhoneNumber } = require('../utils/phone');

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
 * Scoped user list with pagination and rich filters
 */
async function getUsers(req, res) {
  try {
    const {
      role,
      status,
      search,
      constituencyId,
      wardId,
      boothId,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build base query enforcing role scope for User directory
    let filter = buildScopeFilter(req.user, { isUserQuery: true });

    if (role && role !== 'ALL') {
      filter.role = role;
    }
    if (status && status !== 'ALL') {
      filter.accountStatus = status;
    }
    if (constituencyId) {
      filter.constituencyId = constituencyId;
    }
    if (wardId) {
      filter.wardId = wardId;
    }
    if (boothId) {
      filter.boothId = boothId;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: regex },
        { mobileNumber: regex },
        { email: regex },
        { voterId: regex },
        { familyId: regex },
        { designation: regex }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .populate('constituencyId', 'name code district')
        .populate('wardId', 'name wardNumber')
        .populate('boothId', 'name boothNumber')
        .populate('officeId', 'name address')
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
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .populate('officeId', 'name address')
      .populate('createdBy', 'fullName role');

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
      designation,
      voterId,
      dateOfBirth,
      preferredLanguage,
      address,
      villageMohalla,
      district,
      pincode,
      gpsLocation,
      familyId,
      emergencyContact,
      profilePhoto,
      wardNumber,
      boothNumber,
      assemblyConstituency,
      // Privileged administrative fields
      wardId,
      boothId,
      officeId,
      constituencyId,
      role,
      accountStatus
    } = req.body;

    if (fullName) user.fullName = fullName.trim();
    if (email !== undefined) user.email = email ? email.trim().toLowerCase() : undefined;
    if (alternateMobile !== undefined) user.alternateMobile = alternateMobile ? String(alternateMobile).trim() : undefined;
    if (gender) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation ? occupation.trim() : '';
    if (designation !== undefined) user.designation = designation ? designation.trim() : '';
    if (voterId !== undefined) user.voterId = voterId ? voterId.trim().toUpperCase() : '';
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (address !== undefined) user.address = address ? address.trim() : '';
    if (villageMohalla !== undefined) user.villageMohalla = villageMohalla ? villageMohalla.trim() : '';
    if (district !== undefined) user.district = district ? district.trim() : '';
    if (pincode !== undefined) user.pincode = pincode ? pincode.trim() : '';
    if (gpsLocation !== undefined) user.gpsLocation = gpsLocation ? gpsLocation.trim() : '';
    if (familyId !== undefined) user.familyId = familyId ? familyId.trim() : '';
    if (emergencyContact !== undefined) user.emergencyContact = emergencyContact ? emergencyContact.trim() : '';
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto || null;
    if (wardNumber !== undefined) user.wardNumber = wardNumber ? wardNumber.trim() : '';
    if (boothNumber !== undefined) user.boothNumber = boothNumber ? boothNumber.trim() : '';
    if (assemblyConstituency !== undefined) user.assemblyConstituency = assemblyConstituency ? assemblyConstituency.trim() : '';

    // Only Admin can update organizational assignments or status
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
 * GET /api/v1/users/export
 * Export filtered users to Excel (.xlsx) or CSV
 */
async function exportUsers(req, res) {
  try {
    const {
      role,
      status,
      constituencyId,
      wardId,
      boothId,
      search,
      startDate,
      endDate,
      format = 'xlsx'
    } = req.query;

    let filter = buildScopeFilter(req.user, { isUserQuery: true });
    if (role && role !== 'ALL') filter.role = role;
    if (status && status !== 'ALL') filter.accountStatus = status;
    if (constituencyId) filter.constituencyId = constituencyId;
    if (wardId) filter.wardId = wardId;
    if (boothId) filter.boothId = boothId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: regex },
        { mobileNumber: regex },
        { email: regex },
        { voterId: regex },
        { designation: regex }
      ];
    }

    const users = await User.find(filter)
      .populate('constituencyId', 'name')
      .populate('wardId', 'name wardNumber')
      .populate('boothId', 'name boothNumber')
      .sort({ createdAt: -1 })
      .limit(5000);

    const data = users.map(u => ({
      'पूरा नाम (Full Name)': sanitizeCell(u.fullName),
      'मोबाइल नंबर (Mobile)': sanitizeCell(u.mobileNumber),
      'भूमिका (Role)': sanitizeCell(u.role),
      'स्थिति (Status)': sanitizeCell(u.accountStatus),
      'पदनाम (Designation)': sanitizeCell(u.designation || ''),
      'मतदाता पहचान पत्र (Voter ID)': sanitizeCell(u.voterId || ''),
      'लिंग (Gender)': sanitizeCell(u.gender || ''),
      'ईमेल (Email)': sanitizeCell(u.email || ''),
      'विधानसभा (Constituency)': sanitizeCell(u.constituencyId?.name || u.assemblyConstituency || ''),
      'वार्ड नंबर (Ward)': sanitizeCell(u.wardId?.wardNumber || u.wardNumber || ''),
      'बूथ नंबर (Booth)': sanitizeCell(u.boothId?.boothNumber || u.boothNumber || ''),
      'जिला (District)': sanitizeCell(u.district || ''),
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
      details: { format, count: users.length }
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
        fullName: 'रमेश कुमार शर्मा',
        mobileNumber: '9876543210',
        role: 'CITIZEN',
        designation: 'सक्रिय नागरिक',
        voterId: 'ABC1234567',
        gender: 'MALE',
        email: 'ramesh@example.com',
        district: 'ग्वालियर',
        assemblyConstituency: 'ग्वालियर पूर्व',
        wardNumber: '12',
        boothNumber: '104',
        address: 'मकान नं 45, गांधी नगर',
        pincode: '474001'
      },
      {
        fullName: 'सुनीता देवी',
        mobileNumber: '9876543211',
        role: 'BOOTH_WORKER',
        designation: 'बूथ प्रभारी',
        voterId: 'XYZ9876543',
        gender: 'FEMALE',
        email: 'sunita@example.com',
        district: 'ग्वालियर',
        assemblyConstituency: 'ग्वालियर पूर्व',
        wardNumber: '12',
        boothNumber: '104',
        address: 'वार्ड 12, मुख्य बाजार',
        pincode: '474001'
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
 * Helper to detect Name and Phone columns in arbitrary Excel sheet
 */
function detectNameAndPhoneColumns(headers, customNameCol, customPhoneCol) {
  let nameCol = customNameCol && headers.includes(customNameCol) ? customNameCol : null;
  let phoneCol = customPhoneCol && headers.includes(customPhoneCol) ? customPhoneCol : null;

  const nameCandidates = [
    'name', 'fullname', 'full name', 'नाम', 'पूरा नाम', 'सदस्य नाम', 'सदस्य का नाम',
    'member name', 'candidate name', 'व्यक्ति', 'citizen name', 'name of person', 'first name'
  ];

  const phoneCandidates = [
    'phone', 'phonenumber', 'phone number', 'mobile', 'mobilenumber', 'mobile number',
    'contact', 'contact number', 'मोबाइल', 'फ़ोन', 'फोन', 'मोबाइल नंबर', 'सम्पर्क',
    'संपर्क', 'mobile no', 'phone no', 'contact no', 'cell', 'cell number', 'phone_number', 'mobile_number'
  ];

  if (!nameCol) {
    nameCol = headers.find(h => {
      const clean = String(h).trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
      return nameCandidates.some(c => clean === c.replace(/[^a-z0-9\u0900-\u097F]/g, ''));
    }) || null;
  }

  if (!phoneCol) {
    phoneCol = headers.find(h => {
      const clean = String(h).trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
      return phoneCandidates.some(c => clean === c.replace(/[^a-z0-9\u0900-\u097F]/g, ''));
    }) || null;
  }

  // Fallback: If only 2 columns exist and not matched yet
  if (headers.length === 2) {
    if (!nameCol && !phoneCol) {
      nameCol = headers[0];
      phoneCol = headers[1];
    } else if (!nameCol) {
      nameCol = headers.find(h => h !== phoneCol) || headers[0];
    } else if (!phoneCol) {
      phoneCol = headers.find(h => h !== nameCol) || headers[1];
    }
  }

  return { nameCol, phoneCol };
}

/**
 * POST /api/v1/users/import/preview
 * Validate and preview uploaded Excel / CSV rows with auto header detection,
 * manual column mapping, strict in-file and database duplicate protection.
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
    // Use raw: false so phone numbers are preserved as strings without floating point conversion
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return errorResponse(res, 'शीट में कोई डेटा पंक्ति (data row) नहीं मिली।', 400);
    }

    if (rawRows.length > 2500) {
      return errorResponse(res, 'एक समय में अधिकतम 2500 पंक्तियों का आयात किया जा सकता है।', 400);
    }

    const headers = Object.keys(rawRows[0] || {});
    const { nameColumn: customName, phoneColumn: customPhone } = req.body;
    const { nameCol, phoneCol } = detectNameAndPhoneColumns(headers, customName, customPhone);

    // Extract all candidate phone numbers for batch database lookup
    const rawPhoneValues = rawRows.map(r => r[phoneCol || 'mobileNumber'] || r[headers[1]] || '');
    const candidateMobiles = [];
    rawPhoneValues.forEach(val => {
      const { isValid, normalized } = normalizePhoneNumber(val);
      if (isValid && !candidateMobiles.includes(normalized)) {
        candidateMobiles.push(normalized);
      }
    });

    const existingUsers = await User.find({ mobileNumber: { $in: candidateMobiles } })
      .select('mobileNumber fullName role accountStatus');
    const existingMobileMap = new Map();
    existingUsers.forEach(u => {
      existingMobileMap.set(u.mobileNumber, {
        fullName: u.fullName,
        role: u.role,
        accountStatus: u.accountStatus
      });
    });

    const seenInFile = new Map(); // mobileNumber -> firstRowNumber
    const validatedRows = [];
    const errorList = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Row number in sheet (1-based + 1 header)

      // Extract Name (Hindi and English)
      const rawName = nameCol ? String(row[nameCol] || '').trim() : String(row.fullName || row.Name || row['नाम'] || Object.values(row)[0] || '').trim();

      // Extract Phone Number
      const rawPhone = phoneCol ? row[phoneCol] : (row.mobileNumber || row.Phone || row['मोबाइल'] || Object.values(row)[1] || '');

      const { isValid: isPhoneValid, normalized: cleanMobile, error: phoneErr } = normalizePhoneNumber(rawPhone);

      const rowErrors = [];

      // 1. Validate Name
      if (!rawName || rawName.length < 2) {
        rowErrors.push('नाम अनिवार्य है (कम से कम 2 अक्षर)');
      }

      // 2. Validate Phone
      if (!isPhoneValid) {
        rowErrors.push(phoneErr || '10 अंकों का वैध भारतीय मोबाइल नंबर अनिवार्य है');
      }

      // 3. Strict In-File Duplicate Checking
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

      // 4. Strict Database Duplicate Checking
      let isExistingInDb = false;
      let existingRecord = null;
      if (isPhoneValid && cleanMobile && existingMobileMap.has(cleanMobile)) {
        isExistingInDb = true;
        existingRecord = existingMobileMap.get(cleanMobile);
      }

      const isValid = rowErrors.length === 0;

      const parsedRow = {
        rowNumber: rowNum,
        fullName: rawName,
        mobileNumber: cleanMobile || String(rawPhone || '').trim(),
        rawMobile: String(rawPhone || ''),
        role: 'CITIZEN', // STRICT: Default role is always CITIZEN
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
        nameColumn: nameCol || headers[0] || 'Name',
        phoneColumn: phoneCol || headers[1] || 'Phone Number'
      },
      totalRows: rawRows.length,
      validRows: validRowsCount,
      duplicateInFileRows: duplicateInFileCount,
      existingInDbRows: existingInDbCount,
      invalidRows: invalidCount,
      preview: validatedRows.slice(0, 25),
      rows: validatedRows,
      errors: errorList
    }, 'एक्सेल आयात पूर्वावलोकन सफलतापूर्वक तैयार हुआ।');
  } catch (error) {
    return errorResponse(res, `एक्सेल फ़ाइल पार्स करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/users/import/confirm
 * Safely batch import valid members from Excel with strict CITIZEN default role
 * and zero-overwriting of existing database records.
 */
async function confirmImport(req, res) {
  try {
    const { rows, skipExisting = true } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse(res, 'आयात करने के लिए कोई पंक्ति प्राप्त नहीं हुई।', 400);
    }

    if (rows.length > 2500) {
      return errorResponse(res, 'अधिकतम 2500 पंक्तियों का बैच समर्थित है।', 400);
    }

    // Role check: Only SUPER_ADMIN (or permitted staff) can perform import
    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, 'केवल सुपर एडमिन को एक्सेल आयात करने की अनुमति है।', 403);
    }

    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('Citizen@2026#', salt);

    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failureList = [];

    // Filter to rows that have valid phone and name
    const validRows = rows.filter(r => r.isValid && !r.isDuplicateInFile);

    // Collect all candidate clean mobiles
    const mobilesToCheck = validRows.map(r => r.mobileNumber).filter(Boolean);
    const existingUsers = await User.find({ mobileNumber: { $in: mobilesToCheck } }).select('mobileNumber fullName role');
    const existingMobileSet = new Set(existingUsers.map(u => u.mobileNumber));

    // Batch insert new records in chunks of 100
    const CHUNK_SIZE = 100;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const toInsert = [];

      for (const r of chunk) {
        const cleanMobile = r.mobileNumber;

        // Strict duplicate check against database: skip by default
        if (existingMobileSet.has(cleanMobile)) {
          skippedCount++;
          failureList.push({
            rowNumber: r.rowNumber,
            name: r.fullName,
            mobile: cleanMobile,
            reason: 'डेटाबेस में पहले से पंजीकृत सदस्य (स्किप किया गया)'
          });
          continue;
        }

        toInsert.push({
          fullName: r.fullName ? String(r.fullName).trim() : 'नागरिक',
          mobileNumber: cleanMobile,
          passwordHash: defaultPasswordHash,
          role: 'CITIZEN', // STRICT: Always CITIZEN for imported spreadsheets
          accountStatus: 'ACTIVE',
          createdBy: req.user._id
        });
      }

      if (toInsert.length > 0) {
        try {
          const insertRes = await User.insertMany(toInsert, { ordered: false });
          createdCount += insertRes.length;
        } catch (err) {
          // Handle E11000 duplicate key error in chunk gracefully
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
      details: { created: createdCount, skipped: skippedCount, failed: failedCount }
    });

    return successResponse(res, {
      totalProcessed: validRows.length,
      createdCount,
      skippedCount,
      failedCount,
      failures: failureList
    }, `एक्सेल आयात संपन्न: ${createdCount} नए नागरिक सफलतापूर्वक पंजीकृत हुए, ${skippedCount} डुप्लीकेट छोड़े गए।`);
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
      'मोबाइल नंबर (Mobile)': sanitizeCell(e.mobile || ''),
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
  updateAccountStatus,
  deleteUser,
  exportUsers,
  getImportTemplate,
  previewImport,
  confirmImport,
  exportImportErrorReport
};
