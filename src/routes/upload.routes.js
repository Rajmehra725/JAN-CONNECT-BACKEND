const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadLimiter } = require('../middleware/rateLimit.middleware');

router.get('/status', uploadController.getUploadStatus);

router.post(
  '/',
  authenticate,
  uploadLimiter,
  uploadController.uploadMiddleware.single('file'),
  uploadController.uploadMedia
);

module.exports = router;
