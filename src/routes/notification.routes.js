const express = require('express');
const router = express.Router();
const notifController = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, notifController.getMyNotifications);
router.patch('/:id/read', authenticate, notifController.markAsRead);
router.patch('/read-all', authenticate, notifController.markAllAsRead);

module.exports = router;
