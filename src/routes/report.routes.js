const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

router.get(
  '/summary',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'),
  reportController.getDashboardSummary
);

router.get(
  '/export/complaints',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  reportController.exportComplaintsCsv
);

module.exports = router;
