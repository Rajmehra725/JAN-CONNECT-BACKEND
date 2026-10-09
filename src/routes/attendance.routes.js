const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

router.post(
  '/check-in',
  authenticate,
  requireRoles('BOOTH_WORKER', 'PA_STAFF'),
  attendanceController.checkIn
);

router.post(
  '/check-out',
  authenticate,
  requireRoles('BOOTH_WORKER', 'PA_STAFF'),
  attendanceController.checkOut
);

router.get(
  '/my',
  authenticate,
  requireRoles('BOOTH_WORKER', 'PA_STAFF'),
  attendanceController.getMyAttendance
);

router.get(
  '/all',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  attendanceController.getAllAttendance
);

module.exports = router;
