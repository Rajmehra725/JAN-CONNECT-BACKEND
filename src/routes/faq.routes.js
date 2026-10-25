const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faq.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public FAQ endpoints
router.get('/public', faqController.getPublicFaqs);

// Super Admin FAQ Management endpoints
router.get('/', authenticate, requireRoles('SUPER_ADMIN'), faqController.getAdminFaqs);
router.post('/', authenticate, requireRoles('SUPER_ADMIN'), faqController.createFaq);
router.post('/test', authenticate, requireRoles('SUPER_ADMIN'), faqController.testFaqMatcher);
router.get('/unanswered', authenticate, requireRoles('SUPER_ADMIN'), faqController.getUnansweredQueries);
router.get('/analytics', authenticate, requireRoles('SUPER_ADMIN'), faqController.getBotAnalytics);
router.put('/:id', authenticate, requireRoles('SUPER_ADMIN'), faqController.updateFaq);
router.delete('/:id', authenticate, requireRoles('SUPER_ADMIN'), faqController.deleteFaq);

module.exports = router;
