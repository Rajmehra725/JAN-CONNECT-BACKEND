const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const { successResponse, errorResponse } = require('../utils/response');
const { generateCaptcha } = require('../services/captcha.service');
const { logAudit } = require('../services/audit.service');

const COOKIE_NAME = 'jc_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  };
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * GET /api/v1/auth/captcha
 * Generates a free mathematical CAPTCHA challenge
 */
async function getCaptcha(req, res) {
  try {
    const challenge = generateCaptcha();
    return successResponse(res, challenge, 'गणितीय CAPTCHA चुनौती सफलतापूर्वक जनरेट की गई।');
  } catch (error) {
    return errorResponse(res, 'CAPTCHA जनरेट करने में त्रुटि।', 500);
  }
}

/**
 * POST /api/v1/auth/register
 * Public Citizen self-registration. Role is strictly locked to CITIZEN.
 */
async function registerCitizen(req, res) {
  try {
    const {
      fullName,
      mobileNumber,
      password,
      confirmPassword,
      alternateMobile,
      gender,
      dateOfBirth,
      occupation,
      preferredLanguage,
      address,
      villageMohalla,
      wardNumber,
      boothNumber,
      district,
      assemblyConstituency,
      pincode,
      gpsLocation,
      familyId,
      emergencyContact,
      email
    } = req.body;

    if (!fullName || !fullName.trim()) {
      return errorResponse(res, 'पूरा नाम (Full Name) अनिवार्य है।', 400);
    }

    let cleanMobile = String(mobileNumber || '').trim().replace(/^(\+91|91|0)/, '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(cleanMobile)) {
      return errorResponse(res, 'कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें।', 400);
    }

    if (!password || password.length < 6) {
      return errorResponse(res, 'पासवर्ड न्यूनतम 6 अक्षरों का होना चाहिए।', 400);
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return errorResponse(res, 'पासवर्ड और पासवर्ड पुष्टि (Confirm Password) मेल नहीं खाते।', 400);
    }

    // Check if mobile already exists
    const existing = await User.findOne({ mobileNumber: cleanMobile });
    if (existing) {
      return errorResponse(res, 'यह मोबाइल नंबर पहले से पंजीकृत है। कृपया लॉगिन करें।', 409);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user strictly as CITIZEN
    const newUser = new User({
      fullName: fullName.trim(),
      mobileNumber: cleanMobile,
      passwordHash,
      role: 'CITIZEN',
      accountStatus: 'ACTIVE',
      alternateMobile: alternateMobile ? String(alternateMobile).trim() : undefined,
      gender: ['MALE', 'FEMALE', 'OTHER'].includes(gender) ? gender : undefined,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      occupation: occupation ? String(occupation).trim() : undefined,
      preferredLanguage: preferredLanguage || 'HINDI',
      address: address ? String(address).trim() : undefined,
      villageMohalla: villageMohalla ? String(villageMohalla).trim() : undefined,
      wardNumber: wardNumber ? String(wardNumber).trim() : undefined,
      boothNumber: boothNumber ? String(boothNumber).trim() : undefined,
      district: district ? String(district).trim() : undefined,
      assemblyConstituency: assemblyConstituency ? String(assemblyConstituency).trim() : undefined,
      pincode: pincode ? String(pincode).trim() : undefined,
      gpsLocation: gpsLocation ? String(gpsLocation).trim() : undefined,
      familyId: familyId ? String(familyId).trim() : undefined,
      emergencyContact: emergencyContact ? String(emergencyContact).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      lastLoginAt: null
    });

    await newUser.save();

    // Audit log
    await logAudit({
      userId: newUser._id,
      userRole: newUser.role,
      action: 'USER_REGISTER',
      resourceType: 'User',
      resourceId: newUser._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { mobileNumber: cleanMobile, role: 'CITIZEN' }
    });

    // Do NOT automatically log in the citizen after registration (no cookie set)
    return successResponse(res, {
      user: newUser.toJSON()
    }, 'नागरिक पंजीकरण सफलतापूर्वक संपन्न हुआ। कृपया लॉगिन करें।', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'यह मोबाइल नंबर पहले से पंजीकृत है। कृपया लॉगिन करें।', 409);
    }
    return errorResponse(res, `पंजीकरण विफल: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/auth/login
 * Login for all 5 roles: checks credentials, checks status, verifies role scope if provided
 */
async function login(req, res) {
  try {
    const { mobileNumber, password, expectedRole } = req.body;

    const cleanMobile = String(mobileNumber || '').trim().replace(/^(\+91|91|0)/, '').replace(/\D/g, '');
    if (!cleanMobile || !password) {
      return errorResponse(res, 'मोबाइल नंबर और पासवर्ड अनिवार्य हैं।', 400);
    }

    if (!/^\d{10}$/.test(cleanMobile)) {
      return errorResponse(res, 'कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें।', 400);
    }

    // Find user with passwordHash
    const user = await User.findOne({ mobileNumber: cleanMobile }).select('+passwordHash');
    if (!user) {
      return errorResponse(res, 'अमान्य मोबाइल नंबर अथवा पासवर्ड।', 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse(res, 'अमान्य मोबाइल नंबर अथवा पासवर्ड।', 401);
    }

    // Check account status
    if (user.accountStatus === 'SUSPENDED') {
      return errorResponse(res, 'आपका खाता निलंबित (Suspended) है। कृपया अपने कार्यालय से संपर्क करें।', 403);
    }
    if (user.accountStatus === 'DEACTIVATED') {
      return errorResponse(res, 'यह खाता निष्क्रिय (Deactivated) कर दिया गया है।', 403);
    }

    // Check expected role boundary if specified
    if (expectedRole && expectedRole !== user.role) {
      // SUPER_ADMIN can login from any portal
      if (user.role !== 'SUPER_ADMIN') {
        return errorResponse(res, `इस पोर्टल पर ${user.role} भूमिका के साथ प्रवेश की अनुमति नहीं है। कृपया सही पोर्टल चुनें।`, 403);
      }
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    // Log audit
    await logAudit({
      userId: user._id,
      userRole: user.role,
      action: 'USER_LOGIN',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: { role: user.role, portal: expectedRole || 'SHARED_LOGIN' }
    });

    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return successResponse(res, {
      user: user.toJSON(),
      token
    }, 'सफलतापूर्वक लॉगिन हुआ।');
  } catch (error) {
    return errorResponse(res, `लॉगिन में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * POST /api/v1/auth/logout
 * Clears session cookie
 */
async function logout(req, res) {
  try {
    if (req.user) {
      await logAudit({
        userId: req.user._id,
        userRole: req.user.role,
        action: 'USER_LOGOUT',
        resourceType: 'User',
        resourceId: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });

    return successResponse(res, null, 'सफलतापूर्वक लॉगआउट किया गया।');
  } catch (error) {
    return errorResponse(res, 'लॉगआउट विफल।', 500);
  }
}

/**
 * GET /api/v1/auth/me
 * Returns authenticated user details with populated hierarchy
 */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .populate('constituencyId', 'name code district state')
      .populate('wardId', 'name number wardType')
      .populate('boothId', 'name number locationDescription')
      .populate('officeId', 'name address contactPhone');

    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    return successResponse(res, { user: user.toJSON() }, 'उपयोगकर्ता प्रोफाइल प्राप्त हुई।');
  } catch (error) {
    return errorResponse(res, 'प्रोफाइल प्राप्त करने में त्रुटि।', 500);
  }
}

/**
 * POST /api/v1/auth/change-password
 * Change current user's password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'वर्तमान पासवर्ड और नया पासवर्ड अनिवार्य हैं।', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'नया पासवर्ड न्यूनतम 6 अक्षरों का होना चाहिए।', 400);
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) {
      return errorResponse(res, 'उपयोगकर्ता नहीं मिला।', 404);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return errorResponse(res, 'वर्तमान पासवर्ड गलत है।', 400);
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    await logAudit({
      userId: user._id,
      userRole: user.role,
      action: 'PASSWORD_CHANGE',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return successResponse(res, null, 'पासवर्ड सफलतापूर्वक बदल दिया गया है।');
  } catch (error) {
    return errorResponse(res, 'पासवर्ड बदलने में त्रुटि।', 500);
  }
}

module.exports = {
  getCaptcha,
  registerCitizen,
  login,
  logout,
  getMe,
  changePassword
};
