const express = require("express");
const router = express.Router();
const controller = require("../controllers/designation.controller");
const { authenticate, optionalAuthenticate } = require("../middleware/auth.middleware");
const { requireRoles } = require("../middleware/rbac.middleware");

// Public/authenticated readable lists
router.get("/", optionalAuthenticate, controller.getDesignations);
router.get("/departments", optionalAuthenticate, controller.getDepartments);
router.get("/:id", optionalAuthenticate, controller.getDesignationById);

// Administrative operations (Super Admin, Politician, PA Staff)
router.post(
  "/",
  authenticate,
  requireRoles("SUPER_ADMIN", "POLITICIAN", "PA_STAFF"),
  controller.createDesignation
);

router.patch(
  "/:id",
  authenticate,
  requireRoles("SUPER_ADMIN", "POLITICIAN", "PA_STAFF"),
  controller.updateDesignation
);

router.delete(
  "/:id",
  authenticate,
  requireRoles("SUPER_ADMIN"),
  controller.deleteDesignation
);

router.post(
  "/departments",
  authenticate,
  requireRoles("SUPER_ADMIN", "POLITICIAN", "PA_STAFF"),
  controller.createDepartment
);

module.exports = router;
