const express = require("express");
const router = express.Router();
const controller = require("../controllers/directory.controller");

// Public endpoints
router.get("/", controller.getPublicDirectory);
router.get("/:id", controller.getPublicDirectoryMember);

module.exports = router;
