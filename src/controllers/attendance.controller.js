const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');

function getTodayString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

async function checkIn(req, res) {
  try {
    const todayStr = getTodayString();
    const { location, fieldActivity, photoEvidenceUrl } = req.body;

    // Check if record exists for today
    const existing = await Attendance.findOne({
      workerId: req.user._id,
      attendanceDate: todayStr
    });

    if (existing) {
      return errorResponse(res, 'आज की उपस्थिति (Check-in) पहले ही दर्ज की जा चुकी है।', 409);
    }

    const record = new Attendance({
      workerId: req.user._id,
      attendanceDate: todayStr,
      checkInTime: new Date(),
      status: 'PRESENT',
      location: location ? location.trim() : undefined,
      fieldActivity: fieldActivity ? fieldActivity.trim() : undefined,
      photoEvidenceUrl: photoEvidenceUrl || null
    });

    await record.save();
    return successResponse(res, record, 'उपस्थिति (Check-in) सफलतापूर्वक दर्ज की गई।', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'आज की उपस्थिति पहले ही दर्ज है।', 409);
    }
    return errorResponse(res, `चेक-इन विफल: ${error.message}`, 500);
  }
}

async function checkOut(req, res) {
  try {
    const todayStr = getTodayString();
    const { fieldActivity } = req.body;

    const record = await Attendance.findOne({
      workerId: req.user._id,
      attendanceDate: todayStr
    });

    if (!record) {
      return errorResponse(res, 'आज का चेक-इन रिकॉर्ड नहीं मिला। पहले चेक-इन करें।', 404);
    }

    record.checkOutTime = new Date();
    if (fieldActivity) {
      record.fieldActivity = (record.fieldActivity ? record.fieldActivity + ' | ' : '') + fieldActivity.trim();
    }

    await record.save();
    return successResponse(res, record, 'चेक-आउट (Check-out) सफलतापूर्वक संपन्न हुआ।');
  } catch (error) {
    return errorResponse(res, `चेक-आउट विफल: ${error.message}`, 500);
  }
}

async function getMyAttendance(req, res) {
  try {
    const { month, year } = req.query;
    const filter = { workerId: req.user._id };

    if (month && year) {
      const padMonth = String(month).padStart(2, '0');
      const regex = new RegExp(`^${year}-${padMonth}`);
      filter.attendanceDate = regex;
    }

    const records = await Attendance.find(filter).sort({ attendanceDate: -1 });
    return successResponse(res, records, 'उपस्थिति इतिहास।');
  } catch (error) {
    return errorResponse(res, 'उपस्थिति रिकॉर्ड लोड करने में त्रुटि।', 500);
  }
}

async function getAllAttendance(req, res) {
  try {
    const { date, workerId } = req.query;
    const filter = {};

    if (date) {
      filter.attendanceDate = date;
    }
    if (workerId) {
      filter.workerId = workerId;
    }

    // Role scope
    if (req.user.role !== 'SUPER_ADMIN') {
      const allowedWorkers = await User.find({
        role: { $in: ['BOOTH_WORKER', 'PA_STAFF'] },
        constituencyId: req.user.constituencyId
      }).select('_id');
      filter.workerId = { $in: allowedWorkers.map(w => w._id) };
    }

    const records = await Attendance.find(filter)
      .populate('workerId', 'fullName mobileNumber role')
      .sort({ attendanceDate: -1 });

    return successResponse(res, records, 'कार्यकर्ता उपस्थिति सूची।');
  } catch (error) {
    return errorResponse(res, 'रिकॉर्ड लोड करने में त्रुटि।', 500);
  }
}

module.exports = {
  checkIn,
  checkOut,
  getMyAttendance,
  getAllAttendance
};
