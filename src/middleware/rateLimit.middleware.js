const rateLimit = require('express-rate-limit');
const { errorResponse } = require('../utils/response');

/**
 * Standard rate limiter for public and general endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(res, 'Bahut saare requests prapt hue. Kripya thodi der baad punah prayas karein.', 429);
  }
});

/**
 * Strict rate limiter for Authentication (login, register)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(res, 'Bahut saare login/registration prayas hue. Suraksha hetu 15 minute baad koshish karein.', 429);
  }
});

/**
 * Limiter for free CAPTCHA challenge creation
 */
const captchaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(res, 'CAPTCHA request limit exceed ho gayi hai. Kripya thoda intezar karein.', 429);
  }
});

/**
 * Limiter for Public Contact messages
 */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(res, 'Contact sandesh ki seema samapt hui. 15 minute baad prayas karein.', 429);
  }
});

/**
 * Limiter for File Uploads
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return errorResponse(res, 'Upload request seema samapt hui. Kripya thodi der baad upload karein.', 429);
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  captchaLimiter,
  contactLimiter,
  uploadLimiter
};
