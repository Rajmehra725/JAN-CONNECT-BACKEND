const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaint.controller');
const { authenticate, optionalAuthenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public or optionally authenticated tracking endpoint
router.get('/track/:trackingId', optionalAuthenticate, complaintController.trackComplaint);

// Authenticated endpoints
router.post('/', authenticate, complaintController.createComplaint);
router.get('/', authenticate, complaintController.getComplaints);
router.get('/:id', authenticate, complaintController.getComplaintById);
router.post('/:id/updates', authenticate, complaintController.addComplaintUpdate);

// Staff assignment endpoint
router.patch(
  '/:id/assign',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  complaintController.assignComplaint
);

module.exports = router;
