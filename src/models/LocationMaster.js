const mongoose = require("mongoose");

const locationMasterSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: [true, "राज्य (State) अनिवार्य है"],
      default: "Madhya Pradesh",
      trim: true,
      index: true
    },
    division: {
      type: String,
      trim: true,
      index: true
    },
    district: {
      type: String,
      required: [true, "जिला (District) अनिवार्य है"],
      trim: true,
      index: true
    },
    areaType: {
      type: String,
      enum: ["RURAL", "URBAN"],
      required: true,
      index: true
    },
    // Rural administrative hierarchy
    tehsil: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    developmentBlock: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    gramPanchayat: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    village: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    // Urban administrative hierarchy
    localBodyType: {
      type: String,
      enum: ["MUNICIPAL_CORPORATION", "MUNICIPAL_COUNCIL", "NAGAR_PARISHAD", ""],
      default: "",
      index: true
    },
    localBody: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    wardNumber: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    wardName: {
      type: String,
      trim: true,
      default: ""
    },
    // Constituency references
    assemblyConstituency: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    parliamentaryConstituency: {
      type: String,
      trim: true,
      index: true,
      default: ""
    },
    pincode: {
      type: String,
      trim: true,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

// Compound indexes for high-speed cascading queries
locationMasterSchema.index({ state: 1, district: 1, areaType: 1 });
locationMasterSchema.index({ district: 1, developmentBlock: 1, gramPanchayat: 1 });
locationMasterSchema.index({ district: 1, localBody: 1, wardNumber: 1 });
locationMasterSchema.index({ district: 1, assemblyConstituency: 1 });

module.exports = mongoose.model("LocationMaster", locationMasterSchema);
