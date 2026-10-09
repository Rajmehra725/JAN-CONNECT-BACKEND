const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const { errorResponse } = require("../utils/response");

/**
 * Authentication Middleware
 * Validates HttpOnly session cookie or Authorization Bearer token.
 * Attaches authenticated user to req.user.
 */
async function authenticate(req, res, next) {
  try {
    let token = null;

    // Check HttpOnly session cookie first
    if (req.cookies && req.cookies.jc_session) {
      token = req.cookies.jc_session;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return errorResponse(res, "अनधिकृत अभिगम। कृपया लॉगिन करें। (Unauthorized: No session token)", "AUTH_REQUIRED", 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return errorResponse(res, "सत्र की समय सीमा समाप्त हो गई है। कृपया पुनः लॉगिन करें।", "SESSION_EXPIRED", 401);
      }
      return errorResponse(res, "अमान्य सत्र टोकन।", "INVALID_TOKEN", 401);
    }

    if (!decoded || !decoded.userId) {
      return errorResponse(res, "अमान्य टोकन पेलोड।", "INVALID_PAYLOAD", 401);
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return errorResponse(res, "उपयोगकर्ता खाता नहीं मिला।", "USER_NOT_FOUND", 401);
    }

    if (user.accountStatus === "SUSPENDED") {
      return errorResponse(res, "आपका खाता निलंबित कर दिया गया है। कृपया प्रशासन से संपर्क करें।", "ACCOUNT_SUSPENDED", 403);
    }

    if (user.accountStatus === "DEACTIVATED") {
      return errorResponse(res, "यह खाता निष्क्रिय कर दिया गया है।", "ACCOUNT_DEACTIVATED", 403);
    }

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, "प्रमाणीकरण त्रुटि।", "AUTH_ERROR", 500);
  }
}

/**
 * Optional Authentication Middleware
 * Attaches user if valid session exists, otherwise proceeds anonymously.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    let token = null;
    if (req.cookies && req.cookies.jc_session) {
      token = req.cookies.jc_session;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (decoded && decoded.userId) {
          const user = await User.findById(decoded.userId);
          if (user && user.accountStatus === "ACTIVE") {
            req.user = user;
          }
        }
      } catch {
        // Ignore token decode failure in optional auth
      }
    }
    next();
  } catch {
    next();
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate,
};
