const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const geographyRoutes = require('./geography.routes');
const complaintRoutes = require('./complaint.routes');
const taskRoutes = require('./task.routes');
const attendanceRoutes = require('./attendance.routes');
const eventRoutes = require('./event.routes');
const noticeRoutes = require('./notice.routes');
const schemeRoutes = require('./scheme.routes');
const contactRoutes = require('./contact.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const reportRoutes = require('./report.routes');
const auditRoutes = require('./audit.routes');
const designationRoutes = require('./designation.routes');
const directoryRoutes = require('./directory.routes');

const mongoose = require('mongoose');

// Health Check with non-official disclaimer
router.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  return res.status(200).json({
    status: 'UP',
    database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
    service: 'JAN CONNECT REST API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    disclaimer: 'जन कनेक्ट एक स्वतंत्र नागरिक सेवा और जनसंपर्क प्रबंधन प्रणाली है, यह किसी सरकारी उपक्रम से संबद्ध नहीं है।'
  });
});

// Mount modular sub-routers
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/geography', geographyRoutes);
router.use('/designations', designationRoutes);
router.use('/directory', directoryRoutes);
router.use('/complaints', complaintRoutes);
router.use('/tasks', taskRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/events', eventRoutes);
router.use('/notices', noticeRoutes);
router.use('/schemes', schemeRoutes);
router.use('/contact', contactRoutes);
router.use('/notifications', notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/reports', reportRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
