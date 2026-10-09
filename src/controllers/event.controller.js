const Event = require('../models/Event');
const { successResponse, errorResponse } = require('../utils/response');

async function getEvents(req, res) {
  try {
    const { constituencyId, status = 'PUBLISHED' } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (constituencyId) filter.constituencyId = constituencyId;

    const events = await Event.find(filter)
      .populate('constituencyId', 'name')
      .sort({ eventDate: 1 });

    return successResponse(res, events, 'कार्यक्रम सूची।');
  } catch (error) {
    return errorResponse(res, 'कार्यक्रम लोड करने में त्रुटि।', 500);
  }
}

async function getEventById(req, res) {
  try {
    const event = await Event.findById(req.params.id)
      .populate('constituencyId', 'name district')
      .populate('createdById', 'fullName role');

    if (!event) {
      return errorResponse(res, 'कार्यक्रम नहीं मिला।', 404);
    }
    return successResponse(res, event, 'कार्यक्रम विवरण।');
  } catch (error) {
    return errorResponse(res, 'कार्यक्रम लोड करने में त्रुटि।', 500);
  }
}

async function createEvent(req, res) {
  try {
    const { title, description, eventDate, venue, location, coverPhotoUrl, constituencyId, status } = req.body;
    if (!title || !description || !eventDate || !venue) {
      return errorResponse(res, 'कार्यक्रम शीर्षक, विवरण, तिथि और स्थान अनिवार्य हैं।', 400);
    }

    const event = new Event({
      title: title.trim(),
      description: description.trim(),
      eventDate: new Date(eventDate),
      venue: venue.trim(),
      location: location ? location.trim() : undefined,
      coverPhotoUrl: coverPhotoUrl || null,
      constituencyId: constituencyId || req.user.constituencyId || null,
      status: status || 'PUBLISHED',
      createdById: req.user._id
    });

    await event.save();
    return successResponse(res, event, 'कार्यक्रम सफलतापूर्वक बनाया गया।', 201);
  } catch (error) {
    return errorResponse(res, `कार्यक्रम बनाने में त्रुटि: ${error.message}`, 500);
  }
}

async function updateEvent(req, res) {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!event) {
      return errorResponse(res, 'कार्यक्रम नहीं मिला।', 404);
    }
    return successResponse(res, event, 'कार्यक्रम सफलतापूर्वक अपडेट हुआ।');
  } catch (error) {
    return errorResponse(res, 'कार्यक्रम अपडेट में त्रुटि।', 500);
  }
}

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent
};
