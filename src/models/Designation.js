const mongoose = require("mongoose");

const DESIGNATION_CATEGORIES = [
  "ELECTED_REPRESENTATIVE",
  "ADMINISTRATIVE_OFFICIAL",
  "DEPARTMENTAL_OFFICIAL",
  "OTHER"
];

const ADMIN_LEVELS = [
  "STATE",
  "DIVISION",
  "DISTRICT",
  "CONSTITUENCY",
  "BLOCK_TEHSIL",
  "LOCAL_BODY",
  "PANCHAYAT_WARD"
];

const AREA_TYPES = ["ALL", "RURAL", "URBAN"];

const designationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "पद का नाम (Title) अनिवार्य है"],
      trim: true,
      index: true
    },
    titleHi: {
      type: String,
      trim: true,
      default: ""
    },
    category: {
      type: String,
      enum: DESIGNATION_CATEGORIES,
      default: "OTHER",
      index: true
    },
    level: {
      type: String,
      enum: ADMIN_LEVELS,
      default: "DISTRICT",
      index: true
    },
    applicableAreaType: {
      type: String,
      enum: AREA_TYPES,
      default: "ALL"
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true
    },
    departmentName: {
      type: String,
      trim: true,
      default: ""
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

designationSchema.index({ title: 1, category: 1 });

module.exports = mongoose.model("Designation", designationSchema);
