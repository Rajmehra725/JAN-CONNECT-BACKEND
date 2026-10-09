const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Protected user management routes
router.post(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.createUser
);

router.get(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'),
  userController.getUsers
);

router.get(
  '/:id',
  authenticate,
  userController.getUserById
);

router.patch(
  '/:id',
  authenticate,
  userController.updateUser
);

router.patch(
  '/:id/status',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.updateAccountStatus
);

module.exports = router;
