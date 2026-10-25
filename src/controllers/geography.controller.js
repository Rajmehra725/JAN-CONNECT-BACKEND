const Constituency = require('../models/Constituency');
const Ward = require('../models/Ward');
const Booth = require('../models/Booth');
const Office = require('../models/Office');
const LocationMaster = require('../models/LocationMaster');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /api/v1/geography/hierarchy
 * Real cascading master data endpoint for administrative and civic filtering
 */
async function getHierarchy(req, res) {
  try {
    const {
      state = "Madhya Pradesh",
      district,
      areaType,
      developmentBlock,
      gramPanchayat,
      localBody
    } = req.query;

    const baseFilter = { state };
    if (district && district !== "ALL") {
      baseFilter.district = district;
    }

    // Always fetch available States, Divisions, and Districts for high-level selection
    const [states, divisions, districts] = await Promise.all([
      LocationMaster.distinct("state"),
      LocationMaster.distinct("division", { state }),
      LocationMaster.distinct("district", { state })
    ]);

    const responseData = {
      states: states.filter(Boolean),
      divisions: divisions.filter(Boolean),
      districts: districts.filter(Boolean).sort(),
      assemblyConstituencies: [],
      parliamentaryConstituencies: [],
      areaTypes: ["RURAL", "URBAN"],
      rural: {
        tehsils: [],
        developmentBlocks: [],
        gramPanchayats: [],
        villages: []
      },
      urban: {
        localBodyTypes: [],
        localBodies: [],
        wards: []
      }
    };

    if (district && district !== "ALL") {
      const [acList, pcList] = await Promise.all([
        LocationMaster.distinct("assemblyConstituency", baseFilter),
        LocationMaster.distinct("parliamentaryConstituency", baseFilter)
      ]);
      responseData.assemblyConstituencies = acList.filter(Boolean).sort();
      responseData.parliamentaryConstituencies = pcList.filter(Boolean).sort();

      // If areaType is RURAL or ALL, load rural cascading units
      if (!areaType || areaType === "ALL" || areaType === "RURAL") {
        const ruralFilter = { ...baseFilter, areaType: "RURAL" };
        const [tehsils, blocks] = await Promise.all([
          LocationMaster.distinct("tehsil", ruralFilter),
          LocationMaster.distinct("developmentBlock", ruralFilter)
        ]);
        responseData.rural.tehsils = tehsils.filter(Boolean).sort();
        responseData.rural.developmentBlocks = blocks.filter(Boolean).sort();

        if (developmentBlock && developmentBlock !== "ALL") {
          const gpFilter = { ...ruralFilter, developmentBlock };
          const gps = await LocationMaster.distinct("gramPanchayat", gpFilter);
          responseData.rural.gramPanchayats = gps.filter(Boolean).sort();

          if (gramPanchayat && gramPanchayat !== "ALL") {
            const vFilter = { ...gpFilter, gramPanchayat };
            const villages = await LocationMaster.distinct("village", vFilter);
            responseData.rural.villages = villages.filter(Boolean).sort();
          }
        }
      }

      // If areaType is URBAN or ALL, load urban cascading units
      if (!areaType || areaType === "ALL" || areaType === "URBAN") {
        const urbanFilter = { ...baseFilter, areaType: "URBAN" };
        const [lbTypes, localBodies] = await Promise.all([
          LocationMaster.distinct("localBodyType", urbanFilter),
          LocationMaster.distinct("localBody", urbanFilter)
        ]);
        responseData.urban.localBodyTypes = lbTypes.filter(Boolean).sort();
        responseData.urban.localBodies = localBodies.filter(Boolean).sort();

        if (localBody && localBody !== "ALL") {
          const wardFilter = { ...urbanFilter, localBody };
          const wardDocs = await LocationMaster.find(wardFilter)
            .select("wardNumber wardName")
            .sort({ wardNumber: 1 });

          const wardMap = new Map();
          wardDocs.forEach(w => {
            if (w.wardNumber && !wardMap.has(w.wardNumber)) {
              wardMap.set(w.wardNumber, {
                wardNumber: w.wardNumber,
                wardName: w.wardName || `वार्ड ${w.wardNumber}`
              });
            }
          });
          responseData.urban.wards = Array.from(wardMap.values()).sort(
            (a, b) => parseInt(a.wardNumber, 10) - parseInt(b.wardNumber, 10)
          );
        }
      }
    }

    return successResponse(res, responseData, "भौगोलिक पदानुक्रम डेटा प्राप्त हुआ।");
  } catch (error) {
    return errorResponse(res, `भौगोलिक पदानुक्रम लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/geography/summary
 */
async function getGeographySummary(req, res) {
  try {
    const [districts, blocks, localBodies, wards, gramPanchayats, constituencies] = await Promise.all([
      LocationMaster.distinct("district"),
      LocationMaster.distinct("developmentBlock", { areaType: "RURAL" }),
      LocationMaster.distinct("localBody", { areaType: "URBAN" }),
      LocationMaster.countDocuments({ areaType: "URBAN" }),
      LocationMaster.distinct("gramPanchayat", { areaType: "RURAL" }),
      Constituency.countDocuments()
    ]);

    return successResponse(
      res,
      {
        totalDistricts: districts.filter(Boolean).length,
        totalDevelopmentBlocks: blocks.filter(Boolean).length,
        totalLocalBodies: localBodies.filter(Boolean).length,
        totalGramPanchayats: gramPanchayats.filter(Boolean).length,
        totalWards: wards,
        totalConstituencies: constituencies
      },
      "भौगोलिक सांख्यिकी।"
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

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
  getHierarchy,
  getGeographySummary,
  getConstituencies,
  createConstituency,
  getWards,
  createWard,
  getBooths,
  createBooth,
  getOffices,
  createOffice
};
