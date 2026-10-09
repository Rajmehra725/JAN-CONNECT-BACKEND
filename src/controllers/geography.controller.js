const Constituency = require('../models/Constituency');
const Ward = require('../models/Ward');
const Booth = require('../models/Booth');
const Office = require('../models/Office');
const { successResponse, errorResponse } = require('../utils/response');

// Constituencies
async function getConstituencies(req, res) {
  try {
    const list = await Constituency.find().sort({ name: 1 });
    return successResponse(res, list, 'विधानसभा क्षेत्रों की सूची।');
  } catch (error) {
    return errorResponse(res, 'विधानसभा क्षेत्र लोड करने में त्रुटि।', 500);
  }
}

async function createConstituency(req, res) {
  try {
    const { name, code, district, state, description } = req.body;
    if (!name || !district) {
      return errorResponse(res, 'विधानसभा क्षेत्र का नाम और जिला अनिवार्य हैं।', 400);
    }

    const item = new Constituency({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      district: district.trim(),
      state: state || 'Madhya Pradesh',
      description,
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, 'विधानसभा क्षेत्र सफलतापूर्वक जोड़ा गया।', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'इस कोड का विधानसभा क्षेत्र पहले से मौजूद है।', 409);
    }
    return errorResponse(res, error.message, 500);
  }
}

// Wards
async function getWards(req, res) {
  try {
    const { constituencyId } = req.query;
    const filter = {};
    if (constituencyId) filter.constituencyId = constituencyId;

    const list = await Ward.find(filter).populate('constituencyId', 'name code').sort({ wardNumber: 1 });
    return successResponse(res, list, 'वार्ड सूची।');
  } catch (error) {
    return errorResponse(res, 'वार्ड सूची लोड करने में त्रुटि।', 500);
  }
}

async function createWard(req, res) {
  try {
    const { wardNumber, name, constituencyId } = req.body;
    if (!wardNumber || !constituencyId) {
      return errorResponse(res, 'वार्ड क्रमांक और विधानसभा आईडी अनिवार्य हैं।', 400);
    }

    const item = new Ward({
      wardNumber: String(wardNumber).trim(),
      name: name ? name.trim() : undefined,
      constituencyId,
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, 'वार्ड सफलतापूर्वक जोड़ा गया।', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'इस विधानसभा में यह वार्ड क्रमांक पहले से मौजूद है।', 409);
    }
    return errorResponse(res, error.message, 500);
  }
}

// Booths
async function getBooths(req, res) {
  try {
    const { constituencyId, wardId } = req.query;
    const filter = {};
    if (constituencyId) filter.constituencyId = constituencyId;
    if (wardId) filter.wardId = wardId;

    const list = await Booth.find(filter)
      .populate('constituencyId', 'name')
      .populate('wardId', 'wardNumber name')
      .populate('assignedWorkerId', 'fullName mobileNumber')
      .sort({ boothNumber: 1 });

    return successResponse(res, list, 'बूथ सूची।');
  } catch (error) {
    return errorResponse(res, 'बूथ सूची लोड करने में त्रुटि।', 500);
  }
}

async function createBooth(req, res) {
  try {
    const { boothNumber, name, constituencyId, wardId, location, assignedWorkerId } = req.body;
    if (!boothNumber || !constituencyId) {
      return errorResponse(res, 'बूथ क्रमांक और विधानसभा आईडी अनिवार्य हैं।', 400);
    }

    const item = new Booth({
      boothNumber: String(boothNumber).trim(),
      name: name ? name.trim() : undefined,
      constituencyId,
      wardId: wardId || null,
      location: location ? location.trim() : undefined,
      assignedWorkerId: assignedWorkerId || null,
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, 'बूथ सफलतापूर्वक जोड़ा गया।', 201);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(res, 'इस विधानसभा में यह बूथ क्रमांक पहले से मौजूद है।', 409);
    }
    return errorResponse(res, error.message, 500);
  }
}

// Offices
async function getOffices(req, res) {
  try {
    const { constituencyId } = req.query;
    const filter = {};
    if (constituencyId) filter.constituencyId = constituencyId;

    const list = await Office.find(filter)
      .populate('politicianId', 'fullName mobileNumber')
      .populate('staffIds', 'fullName mobileNumber role')
      .sort({ name: 1 });

    return successResponse(res, list, 'कार्यालय सूची।');
  } catch (error) {
    return errorResponse(res, 'कार्यालय सूची लोड करने में त्रुटि।', 500);
  }
}

async function createOffice(req, res) {
  try {
    const { name, constituencyId, address, phone, email, politicianId, staffIds } = req.body;
    if (!name) {
      return errorResponse(res, 'कार्यालय का नाम अनिवार्य है।', 400);
    }

    const item = new Office({
      name: name.trim(),
      constituencyId: constituencyId || null,
      address,
      phone,
      email,
      politicianId: politicianId || req.user._id,
      staffIds: staffIds || [],
      createdBy: req.user._id
    });

    await item.save();
    return successResponse(res, item, 'कार्यालय सफलतापूर्वक जोड़ा गया।', 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

module.exports = {
  getConstituencies,
  createConstituency,
  getWards,
  createWard,
  getBooths,
  createBooth,
  getOffices,
  createOffice
};
