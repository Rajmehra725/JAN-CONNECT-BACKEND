const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');
const { requireCaptcha } = require('../middleware/captcha.middleware');
const { contactLimiter } = require('../middleware/rateLimit.middleware');

// Public contact submission with CAPTCHA and rate limit
router.post('/', contactLimiter, requireCaptcha, contactController.submitContactMessage);

// Administrative management
router.get(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  contactController.getContactMessages
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  contactController.updateContactMessage
);

module.exports = router;
