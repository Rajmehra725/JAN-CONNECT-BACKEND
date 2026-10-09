const Notice = require('../models/Notice');
const { successResponse, errorResponse } = require('../utils/response');

async function getNotices(req, res) {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'PUBLISHED' };
    if (category) filter.category = category;
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ title: regex }, { content: regex }];
    }

    const [notices, total] = await Promise.all([
      Notice.find(filter)
        .sort({ isImportant: -1, publishedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notice.countDocuments(filter)
    ]);

    return successResponse(res, {
      notices,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'सूचनाएं प्राप्त हुईं।');
  } catch (error) {
    return errorResponse(res, 'सूचनाएं लोड करने में त्रुटि।', 500);
  }
}

async function getNoticeById(req, res) {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return errorResponse(res, 'सूचना नहीं मिली।', 404);
    }
    return successResponse(res, notice, 'सूचना विवरण।');
  } catch (error) {
    return errorResponse(res, 'सूचना प्राप्त करने में त्रुटि।', 500);
  }
}

async function createNotice(req, res) {
  try {
    const { title, content, category, noticeType, isImportant, attachmentUrl, expiresAt } = req.body;
    if (!title || !content) {
      return errorResponse(res, 'सूचना शीर्षक और सामग्री अनिवार्य हैं।', 400);
    }

    const notice = new Notice({
      title: title.trim(),
      content: content.trim(),
      category: category || 'सामान्य सूचना',
      noticeType: noticeType || 'सार्वजनिक',
      isImportant: Boolean(isImportant),
      attachmentUrl: attachmentUrl || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'PUBLISHED',
      createdById: req.user._id
    });

    await notice.save();
    return successResponse(res, notice, 'सूचना सफलतापूर्वक प्रकाशित की गई।', 201);
  } catch (error) {
    return errorResponse(res, `सूचना बनाने में त्रुटि: ${error.message}`, 500);
  }
}

async function updateNotice(req, res) {
  try {
    const notice = await Notice.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!notice) {
      return errorResponse(res, 'सूचना नहीं मिली।', 404);
    }
    return successResponse(res, notice, 'सूचना सफलतापूर्वक संशोधित की गई।');
  } catch (error) {
    return errorResponse(res, 'सूचना अपडेट में त्रुटि।', 500);
  }
}

async function deleteNotice(req, res) {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return errorResponse(res, 'सूचना नहीं मिली।', 404);
    }
    return successResponse(res, null, 'सूचना हटा दी गई है।');
  } catch (error) {
    return errorResponse(res, 'सूचना हटाने में त्रुटि।', 500);
  }
}

module.exports = {
  getNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice
};
