const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

router.get(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN'),
  auditController.getAuditLogs
);

module.exports = router;
