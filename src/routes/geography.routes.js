const express = require('express');
const router = express.Router();
const geoController = require('../controllers/geography.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRoles } = require('../middleware/rbac.middleware');

// Public read endpoints
router.get('/hierarchy', geoController.getHierarchy);
router.get('/summary', geoController.getGeographySummary);
router.get('/constituencies', geoController.getConstituencies);
router.get('/wards', geoController.getWards);
router.get('/booths', geoController.getBooths);
router.get('/offices', geoController.getOffices);

// Administrative write endpoints
router.post(
  '/constituencies',
  authenticate,
  requireRoles('SUPER_ADMIN'),
  geoController.createConstituency
);

router.post(
  '/wards',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  geoController.createWard
);

router.post(
  '/booths',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN', 'PA_STAFF'),
  geoController.createBooth
);

router.post(
  '/offices',
  authenticate,
  requireRoles('SUPER_ADMIN', 'POLITICIAN'),
  geoController.createOffice
);

module.exports = router;
