const express = require('express');
const router = express.Router();
const schemeController = require('../controllers/scheme.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public endpoints
router.get('/', schemeController.getSchemes);
router.get('/:id', schemeController.getSchemeById);

// Administrative endpoints
router.post(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  schemeController.createScheme
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  schemeController.updateScheme
);

router.delete(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  schemeController.deleteScheme
);

module.exports = router;
