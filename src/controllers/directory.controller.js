const User = require("../models/User");
const { successResponse, errorResponse } = require("../utils/response");

/**
 * GET /api/v1/directory
 * Public Civic Engagement & Public Directory Endpoint
 * Returns verified and active public officials, elected representatives, and civic leaders.
 * Completely protects private security credentials, password hashes, and internal notes.
 */
async function getPublicDirectory(req, res) {
  try {
    const {
      state = "Madhya Pradesh",
      district,
      areaType,
      developmentBlock,
      gramPanchayat,
      village,
      localBodyType,
      localBody,
      wardNumber,
      assemblyConstituency,
      parliamentaryConstituency,
      designationCategory,
      designation,
      department,
      verificationStatus,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      accountStatus: "ACTIVE",
      isPublicDirectoryVisible: true
    };

    if (state && state !== "ALL") filter.state = state;
    if (district && district !== "ALL") filter.district = district;
    if (areaType && areaType !== "ALL") filter.areaType = areaType;
    if (developmentBlock && developmentBlock !== "ALL") filter.developmentBlock = developmentBlock;
    if (gramPanchayat && gramPanchayat !== "ALL") filter.gramPanchayat = gramPanchayat;
    if (village && village !== "ALL") filter.village = village;
    if (localBodyType && localBodyType !== "ALL") filter.localBodyType = localBodyType;
    if (localBody && localBody !== "ALL") filter.localBody = localBody;
    if (wardNumber && wardNumber !== "ALL") filter.wardNumber = String(wardNumber);
    if (assemblyConstituency && assemblyConstituency !== "ALL") filter.assemblyConstituency = assemblyConstituency;
    if (parliamentaryConstituency && parliamentaryConstituency !== "ALL") filter.parliamentaryConstituency = parliamentaryConstituency;
    if (designationCategory && designationCategory !== "ALL") filter.designationCategory = designationCategory;
    if (designation && designation !== "ALL") filter.designation = designation;
    if (department && department !== "ALL") filter.department = department;

    // Optional verification status filter (default: verified or all directory records)
    if (verificationStatus && verificationStatus !== "ALL") {
      filter.verificationStatus = verificationStatus;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { fullName: regex },
        { designation: regex },
        { department: regex },
        { district: regex },
        { developmentBlock: regex },
        { gramPanchayat: regex },
        { localBody: regex },
        { wardName: regex },
        { assemblyConstituency: regex },
        { officeAddress: regex }
      ];
    }

    // Strict projection: never expose passwordHash, auth tokens, or private notes
    const projection = {
      _id: 1,
      fullName: 1,
      designation: 1,
      designationCategory: 1,
      department: 1,
      state: 1,
      division: 1,
      district: 1,
      areaType: 1,
      tehsil: 1,
      developmentBlock: 1,
      gramPanchayat: 1,
      village: 1,
      localBodyType: 1,
      localBody: 1,
      wardNumber: 1,
      wardName: 1,
      assemblyConstituency: 1,
      parliamentaryConstituency: 1,
      officeAddress: 1,
      officialEmail: 1,
      officeContact: 1,
      termStartDate: 1,
      termEndDate: 1,
      verificationStatus: 1,
      profilePhoto: 1,
      role: 1
    };

    const [records, total] = await Promise.all([
      User.find(filter, projection)
        .sort({ designationCategory: 1, fullName: 1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(filter)
    ]);

    return successResponse(
      res,
      {
        records,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      },
      "सार्वजनिक नागरिक निर्देशिका सूची प्राप्त हुई।"
    );
  } catch (error) {
    return errorResponse(res, `सार्वजनिक निर्देशिका लोड करने में त्रुटि: ${error.message}`, 500);
  }
}

/**
 * GET /api/v1/directory/:id
 */
async function getPublicDirectoryMember(req, res) {
  try {
    const member = await User.findOne(
      { _id: req.params.id, accountStatus: "ACTIVE", isPublicDirectoryVisible: true },
      {
        _id: 1,
        fullName: 1,
        designation: 1,
        designationCategory: 1,
        department: 1,
        state: 1,
        district: 1,
        areaType: 1,
        developmentBlock: 1,
        gramPanchayat: 1,
        village: 1,
        localBody: 1,
        wardNumber: 1,
        wardName: 1,
        assemblyConstituency: 1,
        parliamentaryConstituency: 1,
        officeAddress: 1,
        officialEmail: 1,
        officeContact: 1,
        termStartDate: 1,
        termEndDate: 1,
        verificationStatus: 1,
        profilePhoto: 1
      }
    );

    if (!member) {
      return errorResponse(res, "निर्देशिका प्रविष्टि नहीं मिली।", 404);
    }

    return successResponse(res, member, "निर्देशिका प्रविष्टि विवरण प्राप्त हुआ।");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

module.exports = {
  getPublicDirectory,
  getPublicDirectoryMember
};
