const ContactMessage = require('../models/ContactMessage');
const { successResponse, errorResponse } = require('../utils/response');
const { logAudit } = require('../services/audit.service');

async function submitContactMessage(req, res) {
  try {
    const { name, mobile, email, subject, message } = req.body;
    if (!name || !subject || !message) {
      return errorResponse(res, 'नाम, विषय और संदेश अनिवार्य हैं।', 400);
    }

    const item = new ContactMessage({
      name: name.trim(),
      mobile: mobile ? String(mobile).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      subject: subject.trim(),
      message: message.trim(),
      ipAddress: req.ip,
      status: 'NEW'
    });

    await item.save();

    return successResponse(res, { id: item._id }, 'आपका संदेश सफलतापूर्वक प्राप्त हो गया है। हमारी टीम जल्द आपसे संपर्क करेगी।', 201);
  } catch (error) {
    return errorResponse(res, `संदेश भेजने में त्रुटि: ${error.message}`, 500);
  }
}

async function getContactMessages(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status) filter.status = status;

    const [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .populate('assignedTo', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      ContactMessage.countDocuments(filter)
    ]);

    return successResponse(res, {
      messages,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'संदेश सूची।');
  } catch (error) {
    return errorResponse(res, 'संदेश लोड करने में त्रुटि।', 500);
  }
}

async function updateContactMessage(req, res) {
  try {
    const { status, internalNotes, assignedTo } = req.body;
    const msg = await ContactMessage.findById(req.params.id);
    if (!msg) {
      return errorResponse(res, 'संदेश नहीं मिला।', 404);
    }

    if (status) msg.status = status;
    if (internalNotes !== undefined) msg.internalNotes = internalNotes;
    if (assignedTo !== undefined) msg.assignedTo = assignedTo || null;

    await msg.save();
    return successResponse(res, msg, 'संदेश स्थिति अपडेट हुई।');
  } catch (error) {
    return errorResponse(res, 'अपडेट में त्रुटि।', 500);
  }
}

module.exports = {
  submitContactMessage,
  getContactMessages,
  updateContactMessage
};
