const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const userController = require('../controllers/user.controller');
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
router.patch('/profile', authenticate, (req, res) => {
  req.params.id = req.user._id.toString();
  return userController.updateUser(req, res);
});
router.post('/change-password', authenticate, authController.changePassword);

module.exports = router;
