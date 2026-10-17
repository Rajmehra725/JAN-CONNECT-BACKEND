const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Member Export & Import (Super Admin & Privileged)
router.get(
  '/export',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.exportUsers
);

router.get(
  '/import/template',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.getImportTemplate
);

router.post(
  '/import/preview',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  upload.single('file'),
  userController.previewImport
);

router.post(
  '/import/confirm',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.confirmImport
);

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

router.delete(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  userController.deleteUser
);

module.exports = router;
