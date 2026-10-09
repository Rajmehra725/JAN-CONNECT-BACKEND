const { verifyCaptcha } = require('../services/captcha.service');
const { errorResponse } = require('../utils/response');

/**
 * Middleware to enforce CAPTCHA verification on sensitive public actions:
 * registration, login, contact form, public complaint tracking.
 */
function requireCaptcha(req, res, next) {
  // Support either body or headers (for flexible frontends)
  const challengeId = req.body.captchaId || req.headers['x-captcha-id'];
  const answer = req.body.captchaAnswer !== undefined ? req.body.captchaAnswer : req.headers['x-captcha-answer'];

  if (!challengeId || answer === undefined || answer === null || String(answer).trim() === '') {
    return errorResponse(res, 'CAPTCHA satyapan anivarya hai. Kripya ganitiye sawal ka uttar pradan karein.', 400);
  }

  const result = verifyCaptcha(challengeId, answer);
  if (!result.valid) {
    return errorResponse(res, result.reason || 'CAPTCHA satyapan vifal raha. Kripya naya CAPTCHA prayas karein.', 400);
  }

  next();
}

module.exports = {
  requireCaptcha
};
