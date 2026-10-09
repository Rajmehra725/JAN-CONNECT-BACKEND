const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

async function getMyNotifications(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipientId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Notification.countDocuments({ recipientId: req.user._id }),
      Notification.countDocuments({ recipientId: req.user._id, read: false })
    ]);

    return successResponse(res, {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'अधिसूचनाएं प्राप्त हुईं।');
  } catch (error) {
    return errorResponse(res, 'अधिसूचनाएं लोड करने में त्रुटि।', 500);
  }
}

async function markAsRead(req, res) {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { $set: { read: true } },
      { new: true }
    );

    if (!notif) {
      return errorResponse(res, 'अधिसूचना नहीं मिली।', 404);
    }

    return successResponse(res, notif, 'अधिसूचना पढ़ी गई चिह्नित की गई।');
  } catch (error) {
    return errorResponse(res, 'अपडेट में त्रुटि।', 500);
  }
}

async function markAllAsRead(req, res) {
  try {
    await Notification.updateMany(
      { recipientId: req.user._id, read: false },
      { $set: { read: true } }
    );

    return successResponse(res, null, 'सभी अधिसूचनाएं पढ़ी गई चिह्नित की गईं।');
  } catch (error) {
    return errorResponse(res, 'अपडेट में त्रुटि।', 500);
  }
}

module.exports = {
  getMyNotifications,
  markAsRead,
  markAllAsRead
};
