const mongoose = require("mongoose");

const schemeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "योजना का नाम आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "योजना विवरण आवश्यक है"],
      trim: true,
      maxlength: 3000,
    },
    category: {
      type: String,
      required: [true, "योजना श्रेणी आवश्यक है"],
      trim: true,
      index: true,
    },
    eligibility: {
      type: String,
      required: [true, "पात्रता विवरण आवश्यक है"],
      trim: true,
    },
    requiredDocuments: [
      {
        type: String,
        trim: true,
      },
    ],
    applicationInstructions: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    officialUrl: {
      type: String,
      trim: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "PUBLISHED",
      index: true,
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Scheme", schemeSchema);
