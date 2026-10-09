const Notification = require("../models/Notification");

/**
 * Creates in-app notifications stored in MongoDB
 */
async function sendNotification({
  recipientId,
  type = "SYSTEM",
  title,
  message,
  relatedResource = null,
}) {
  try {
    if (!recipientId || !title || !message) {
      return null;
    }

    const notif = await Notification.create({
      recipientId,
      type,
      title,
      message,
      relatedResource,
      read: false,
    });

    return notif;
  } catch (err) {
    console.error("[Notification Service] Failed to create notification:", err.message);
    return null;
  }
}

module.exports = {
  sendNotification,
};
