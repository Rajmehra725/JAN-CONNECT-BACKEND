const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/notice.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public endpoints
router.get('/', noticeController.getNotices);
router.get('/:id', noticeController.getNoticeById);

// Administrative endpoints
router.post(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  noticeController.createNotice
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  noticeController.updateNotice
);

router.delete(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  noticeController.deleteNotice
);

module.exports = router;
