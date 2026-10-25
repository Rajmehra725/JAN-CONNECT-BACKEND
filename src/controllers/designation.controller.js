const Designation = require("../models/Designation");
const Department = require("../models/Department");
const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/response");

/**
 * GET /api/v1/designations
 * Supports filtering by category, level, applicableAreaType, departmentId, and search query.
 */
async function getDesignations(req, res) {
  try {
    const { category, level, areaType, departmentId, search, activeOnly } = req.query;
    const filter = {};

    if (activeOnly === "true" || activeOnly === true || !req.user || req.user.role === "CITIZEN") {
      filter.isActive = true;
    }
    if (category && category !== "ALL") {
      filter.category = category;
    }
    if (level && level !== "ALL") {
      filter.level = level;
    }
    if (areaType && areaType !== "ALL") {
      filter.$or = [{ applicableAreaType: areaType }, { applicableAreaType: "ALL" }];
    }
    if (departmentId && departmentId !== "ALL") {
      filter.departmentId = departmentId;
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ title: regex }, { titleHi: regex }, { departmentName: regex }];
    }

    const list = await Designation.find(filter)
      .populate("departmentId", "name nameHi code")
      .sort({ sortOrder: 1, title: 1 });

    // Optional usage counts for administrative console
    let listWithCounts = list;
    if (req.user && ["SUPER_ADMIN", "POLITICIAN", "PA_STAFF"].includes(req.user.role)) {
      const titles = list.map(d => d.title);
      const usageCounts = await User.aggregate([
        { $match: { designation: { $in: titles } } },
        { $group: { _id: "$designation", count: { $sum: 1 } } }
      ]);
      const countMap = new Map(usageCounts.map(u => [u._id, u.count]));

      listWithCounts = list.map(d => {
        const doc = d.toObject();
        doc.usageCount = countMap.get(d.title) || 0;
        return doc;
      });
    }

    return successResponse(res, listWithCounts, "पदनाम सूची सफलतापूर्वक प्राप्त हुई।");
  } catch (error) {
    return errorResponse(res, `पदनाम सूची लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/designations/:id
 */
async function getDesignationById(req, res) {
  try {
    const item = await Designation.findById(req.params.id).populate("departmentId", "name nameHi code");
    if (!item) {
      return errorResponse(res, "पदनाम नहीं मिला।", 404);
    }
    return successResponse(res, item, "पदनाम विवरण प्राप्त हुआ।");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

/**
 * POST /api/v1/designations (Admin only)
 */
async function createDesignation(req, res) {
  try {
    const { title, titleHi, category, level, applicableAreaType, departmentId, description, sortOrder, isActive } = req.body;

    if (!title || !title.trim()) {
      return errorResponse(res, "पद का नाम (Title) अनिवार्य है।", 400);
    }

    let deptName = "";
    if (departmentId) {
      const dept = await Department.findById(departmentId);
      if (dept) deptName = dept.name;
    }

    const item = new Designation({
      title: title.trim(),
      titleHi: titleHi ? titleHi.trim() : "",
      category: category || "OTHER",
      level: level || "DISTRICT",
      applicableAreaType: applicableAreaType || "ALL",
      departmentId: departmentId || null,
      departmentName: deptName,
      description: description ? description.trim() : "",
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, "नया पदनाम सफलतापूर्वक निर्मित किया गया।", 201);
  } catch (error) {
    return errorResponse(res, `पदनाम निर्माण में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * PATCH /api/v1/designations/:id (Admin only)
 */
async function updateDesignation(req, res) {
  try {
    const item = await Designation.findById(req.params.id);
    if (!item) {
      return errorResponse(res, "पदनाम नहीं मिला।", 404);
    }

    const { title, titleHi, category, level, applicableAreaType, departmentId, description, sortOrder, isActive } = req.body;

    if (title !== undefined) item.title = title.trim();
    if (titleHi !== undefined) item.titleHi = titleHi.trim();
    if (category !== undefined) item.category = category;
    if (level !== undefined) item.level = level;
    if (applicableAreaType !== undefined) item.applicableAreaType = applicableAreaType;
    if (departmentId !== undefined) {
      item.departmentId = departmentId || null;
      if (departmentId) {
        const dept = await Department.findById(departmentId);
        item.departmentName = dept ? dept.name : "";
      } else {
        item.departmentName = "";
      }
    }
    if (description !== undefined) item.description = description.trim();
    if (sortOrder !== undefined) item.sortOrder = sortOrder;
    if (isActive !== undefined) item.isActive = isActive;

    await item.save();
    return successResponse(res, item, "पदनाम सफलतापूर्वक अद्यतित किया गया।");
  } catch (error) {
    return errorResponse(res, `पदनाम अद्यतन में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * DELETE /api/v1/designations/:id (Admin only)
 */
async function deleteDesignation(req, res) {
  try {
    const item = await Designation.findById(req.params.id);
    if (!item) {
      return errorResponse(res, "पदनाम नहीं मिला।", 404);
    }

    // Check if any user is currently using this designation
    const count = await User.countDocuments({
      $or: [{ designationId: item._id }, { designation: item.title }]
    });

    if (count > 0) {
      // Deactivate rather than hard delete to preserve referential integrity
      item.isActive = false;
      await item.save();
      return successResponse(
        res,
        { item, softDeactivated: true, usageCount: count },
        `यह पदनाम ${count} सदस्यों द्वारा उपयोग किया जा रहा है, अतः इसे निष्क्रिय कर दिया गया है।`
      );
    }

    await Designation.findByIdAndDelete(req.params.id);
    return successResponse(res, { id: req.params.id }, "पदनाम सफलतापूर्वक हटाया गया।");
  } catch (error) {
    return errorResponse(res, `पदनाम हटाने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/departments
 */
async function getDepartments(req, res) {
  try {
    const list = await Department.find({ isActive: true }).sort({ name: 1 });
    return successResponse(res, list, "विभाग सूची।");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

/**
 * POST /api/v1/departments (Admin only)
 */
async function createDepartment(req, res) {
  try {
    const { name, nameHi, code, description } = req.body;
    if (!name || !name.trim()) {
      return errorResponse(res, "विभाग का नाम अनिवार्य है।", 400);
    }

    const item = new Department({
      name: name.trim(),
      nameHi: nameHi ? nameHi.trim() : "",
      code: code ? code.trim().toUpperCase() : undefined,
      description: description ? description.trim() : "",
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, "विभाग सफलतापूर्वक जोड़ा गया।", 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, "यह विभाग पहले से मौजूद है।", 409);
    }
    return errorResponse(res, error.message, 500);
  }
}

module.exports = {
  getDesignations,
  getDesignationById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  getDepartments,
  createDepartment
};
