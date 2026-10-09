const Scheme = require('../models/Scheme');
const { successResponse, errorResponse } = require('../utils/response');

async function getSchemes(req, res) {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'PUBLISHED' };
    if (category && category !== 'सभी') filter.category = category;
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { title: regex },
        { description: regex },
        { department: regex }
      ];
    }

    const [schemes, total] = await Promise.all([
      Scheme.find(filter)
        .sort({ verified: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Scheme.countDocuments(filter)
    ]);

    return successResponse(res, {
      schemes,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'योजनाएं प्राप्त हुईं।');
  } catch (error) {
    return errorResponse(res, 'योजनाएं लोड करने में त्रुटि।', 500);
  }
}

async function getSchemeById(req, res) {
  try {
    const scheme = await Scheme.findById(req.params.id);
    if (!scheme) {
      return errorResponse(res, 'योजना नहीं मिली।', 404);
    }
    return successResponse(res, scheme, 'योजना विवरण।');
  } catch (error) {
    return errorResponse(res, 'योजना प्राप्त करने में त्रुटि।', 500);
  }
}

async function createScheme(req, res) {
  try {
    const {
      title,
      description,
      category,
      eligibility,
      requiredDocuments,
      applicationInstructions,
      department,
      officialUrl,
      verified
    } = req.body;

    if (!title || !description || !category || !eligibility) {
      return errorResponse(res, 'योजना का नाम, विवरण, श्रेणी और पात्रता विवरण अनिवार्य हैं।', 400);
    }

    const scheme = new Scheme({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      eligibility: eligibility.trim(),
      requiredDocuments: Array.isArray(requiredDocuments) ? requiredDocuments : [],
      applicationInstructions: applicationInstructions ? applicationInstructions.trim() : undefined,
      department: department ? department.trim() : undefined,
      officialUrl: officialUrl ? officialUrl.trim() : undefined,
      verified: Boolean(verified),
      status: 'PUBLISHED',
      createdById: req.user._id
    });

    await scheme.save();
    return successResponse(res, scheme, 'योजना सफलतापूर्वक जोड़ी गई।', 201);
  } catch (error) {
    return errorResponse(res, `योजना जोड़ने में त्रुटि: ${error.message}`, 500);
  }
}

async function updateScheme(req, res) {
  try {
    const scheme = await Scheme.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!scheme) {
      return errorResponse(res, 'योजना नहीं मिली।', 404);
    }
    return successResponse(res, scheme, 'योजना सफलतापूर्वक अपडेट हुई।');
  } catch (error) {
    return errorResponse(res, 'योजना अपडेट में त्रुटि।', 500);
  }
}

async function deleteScheme(req, res) {
  try {
    const scheme = await Scheme.findByIdAndDelete(req.params.id);
    if (!scheme) {
      return errorResponse(res, 'योजना नहीं मिली।', 404);
    }
    return successResponse(res, null, 'योजना हटा दी गई है।');
  } catch (error) {
    return errorResponse(res, 'योजना हटाने में त्रुटि।', 500);
  }
}

module.exports = {
  getSchemes,
  getSchemeById,
  createScheme,
  updateScheme,
  deleteScheme
};
