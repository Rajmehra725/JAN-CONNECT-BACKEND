const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireCaptcha } = require('../middleware/captcha.middleware');
const { authLimiter, captchaLimiter } = require('../middleware/rateLimit.middleware');

// Public endpoints
router.get('/captcha', captchaLimiter, authController.getCaptcha);
router.post('/register', authLimiter, requireCaptcha, authController.registerCitizen);
router.post('/login', authLimiter, requireCaptcha, authController.login);

// Authenticated endpoints
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;
