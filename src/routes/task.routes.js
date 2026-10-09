const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

router.post(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  taskController.createTask
);

router.get(
  '/',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'),
  taskController.getTasks
);

router.get(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'),
  taskController.getTaskById
);

router.patch(
  '/:id',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF', 'BOOTH_WORKER'),
  taskController.updateTask
);

module.exports = router;
