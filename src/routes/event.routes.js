const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public read
router.get('/', eventController.getEvents);
router.get('/:id', eventController.getEventById);

// Staff/Admin management
router.post(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  eventController.createEvent
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  eventController.updateEvent
);

module.exports = router;
