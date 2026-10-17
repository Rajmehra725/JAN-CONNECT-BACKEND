const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
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
 * POST /api/v1/users/import/preview
 * Validate and preview uploaded Excel / CSV rows before importing
 */
async function previewImport(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return errorResponse(res, 'कृपया एक वैध Excel (.xlsx, .xls) अथवा .csv फाइल अपलोड करें।', 400);
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return errorResponse(res, 'अपलोड की गई फाइल में कोई शीट नहीं मिली।', 400);
    }

    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return errorResponse(res, 'शीट में कोई डेटा पंक्ति (data row) नहीं मिली।', 400);
    }

    if (rawRows.length > 2000) {
      return errorResponse(res, 'एक समय में अधिकतम 2000 पंक्तियों का आयात किया जा सकता है।', 400);
    }

    const incomingMobiles = rawRows
      .map(r => String(r.mobileNumber || r['मोबाइल नंबर'] || r['Mobile'] || '').trim().replace(/^(\+91|91|0)/, '').replace(/\D/g, ''))
      .filter(m => m.length === 10);

    const existingUsers = await User.find({ mobileNumber: { $in: incomingMobiles } }).select('mobileNumber fullName role');
    const existingMobileSet = new Set(existingUsers.map(u => u.mobileNumber));

    const seenInFile = new Set();
    const validatedRows = [];
    const errors = [];
    const allowedRoles = ['CITIZEN', 'BOOTH_WORKER', 'PA_STAFF', 'POLITICIAN'];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const fullName = String(row.fullName || row['पूरा नाम'] || row['Name'] || '').trim();
      const rawMobile = String(row.mobileNumber || row['मोबाइल नंबर'] || row['Mobile'] || '').trim();
      const cleanMobile = rawMobile.replace(/^(\+91|91|0)/, '').replace(/\D/g, '');
      const rawRole = String(row.role || row['भूमिका'] || row['Role'] || 'CITIZEN').trim().toUpperCase();

      const rowErrors = [];

      if (!fullName) {
        rowErrors.push('नाम अनिवार्य है');
      }
      if (!cleanMobile || cleanMobile.length !== 10) {
        rowErrors.push('10 अंकों का वैध मोबाइल नंबर अनिवार्य है');
      }
      if (rawRole === 'SUPER_ADMIN') {
        rowErrors.push('सुरक्षा कारणों से एक्सेल से सुपर एडमिन आयात की अनुमति नहीं है');
      } else if (!allowedRoles.includes(rawRole)) {
        rowErrors.push(`अमान्य भूमिका [${rawRole}]। मान्य: CITIZEN, BOOTH_WORKER, PA_STAFF, POLITICIAN`);
      }

      const isDuplicateInFile = cleanMobile && seenInFile.has(cleanMobile);
      if (isDuplicateInFile) {
        rowErrors.push('यह मोबाइल नंबर इसी फाइल में दोहराया गया है');
      } else if (cleanMobile) {
        seenInFile.add(cleanMobile);
      }

      const isExistingInDb = cleanMobile && existingMobileSet.has(cleanMobile);

      const parsedRow = {
        rowNumber: rowNum,
        fullName,
        mobileNumber: cleanMobile,
        role: rawRole || 'CITIZEN',
        designation: String(row.designation || row['पदनाम'] || '').trim(),
        voterId: String(row.voterId || row['मतदाता पहचान'] || '').trim().toUpperCase(),
        gender: ['MALE', 'FEMALE', 'OTHER'].includes(String(row.gender || row['लिंग'] || '').toUpperCase()) ? String(row.gender).toUpperCase() : undefined,
        email: String(row.email || row['ईमेल'] || '').trim().toLowerCase() || undefined,
        district: String(row.district || row['जिला'] || '').trim(),
        assemblyConstituency: String(row.assemblyConstituency || row['विधानसभा'] || '').trim(),
        wardNumber: String(row.wardNumber || row['वार्ड'] || '').trim(),
        boothNumber: String(row.boothNumber || row['बूथ'] || '').trim(),
        address: String(row.address || row['पता'] || '').trim(),
        pincode: String(row.pincode || row['पिनकोड'] || '').trim(),
        isExistingInDb,
        isValid: rowErrors.length === 0,
        errors: rowErrors
      };

      if (rowErrors.length > 0) {
        errors.push({ rowNumber: rowNum, errors: rowErrors });
      }

      validatedRows.push(parsedRow);
    });

    const validCount = validatedRows.filter(r => r.isValid && !r.isExistingInDb).length;
    const existingCount = validatedRows.filter(r => r.isValid && r.isExistingInDb).length;
    const invalidCount = validatedRows.filter(r => !r.isValid).length;

    return successResponse(res, {
      totalRows: rawRows.length,
      validRows: validCount,
      existingRows: existingCount,
      invalidRows: invalidCount,
      preview: validatedRows.slice(0, 15),
      errors: errors.slice(0, 50)
    }, 'आयात पूर्वावलोकन तैयार है।');
  } catch (error) {
    return errorResponse(res, `फ़ाइल पार्स करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/users/import/confirm
 * Execute validated bulk import with optional updateExisting flag
 */
async function confirmImport(req, res) {
  try {
    const { rows, updateExisting = false } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse(res, 'आयात करने के लिए कोई मान्य पंक्ति प्राप्त नहीं हुई।', 400);
    }

    if (rows.length > 2000) {
      return errorResponse(res, 'अधिकतम 2000 पंक्तियों का बैच समर्थित है।', 400);
    }

    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('Member@123#', salt);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const failureList = [];

    for (const r of rows) {
      const cleanMobile = String(r.mobileNumber || '').trim();
      if (!cleanMobile || cleanMobile.length !== 10) {
        skippedCount++;
        failureList.push({ rowNumber: r.rowNumber, mobile: cleanMobile, reason: 'अमान्य मोबाइल नंबर' });
        continue;
      }

      const existing = await User.findOne({ mobileNumber: cleanMobile });

      if (existing) {
        if (updateExisting) {
          if (r.fullName) existing.fullName = r.fullName.trim();
          if (r.designation !== undefined) existing.designation = r.designation.trim();
          if (r.voterId !== undefined) existing.voterId = r.voterId.trim();
          if (r.gender) existing.gender = r.gender;
          if (r.email) existing.email = r.email.trim().toLowerCase();
          if (r.district) existing.district = r.district.trim();
          if (r.assemblyConstituency) existing.assemblyConstituency = r.assemblyConstituency.trim();
          if (r.wardNumber) existing.wardNumber = r.wardNumber.trim();
          if (r.boothNumber) existing.boothNumber = r.boothNumber.trim();
          if (r.address) existing.address = r.address.trim();
          if (r.pincode) existing.pincode = r.pincode.trim();
          await existing.save();
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const newUser = new User({
          fullName: r.fullName ? r.fullName.trim() : 'सदस्य',
          mobileNumber: cleanMobile,
          passwordHash: defaultPasswordHash,
          role: ['CITIZEN', 'BOOTH_WORKER', 'PA_STAFF', 'POLITICIAN'].includes(r.role) ? r.role : 'CITIZEN',
          accountStatus: 'ACTIVE',
          designation: r.designation ? r.designation.trim() : '',
          voterId: r.voterId ? r.voterId.trim() : '',
          gender: r.gender,
          email: r.email,
          district: r.district,
          assemblyConstituency: r.assemblyConstituency,
          wardNumber: r.wardNumber,
          boothNumber: r.boothNumber,
          address: r.address,
          pincode: r.pincode,
          createdBy: req.user._id
        });
        await newUser.save();
        createdCount++;
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
      details: { created: createdCount, updated: updatedCount, skipped: skippedCount }
    });

    return successResponse(res, {
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failures: failureList
    }, `एक्सेल आयात संपन्न: ${createdCount} नए सदस्य निर्मित, ${updatedCount} अद्यतन, ${skippedCount} छोड़े गए।`);
  } catch (error) {
    return errorResponse(res, `आयात प्रक्रिया में त्रुटि: ${error.message}`, 500);
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
  confirmImport
};
