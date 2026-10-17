const mongoose = require("mongoose");

const COMPLAINT_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_INFORMATION",
  "RESOLVED",
  "REJECTED",
  "REOPENED",
];

const COMPLAINT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const complaintSchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
    },
    citizenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "नागरिक पहचान आवश्यक है"],
      index: true,
    },
    category: {
      type: String,
      required: [true, "शिकायत श्रेणी आवश्यक है"],
      trim: true,
      index: true,
    },
    subject: {
      type: String,
      required: [true, "शिकायत का विषय आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "शिकायत का विस्तृत विवरण आवश्यक है"],
      trim: true,
      maxlength: 3000,
    },
    priority: {
      type: String,
      enum: COMPLAINT_PRIORITIES,
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: COMPLAINT_STATUSES,
      default: "SUBMITTED",
      index: true,
    },
    // Scope references
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      index: true,
    },
    wardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ward",
      index: true,
    },
    boothId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booth",
      index: true,
    },
    assignedOfficeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      index: true,
      default: null,
    },
    assignedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    location: {
      type: String,
      trim: true,
    },
    mediaAttachments: [
      {
        assetId: String,
        url: String,
        resourceType: String,
        format: String,
      },
    ],
    resolutionDetails: {
      type: String,
      trim: true,
    },
    resolutionDate: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Indexes for fast searching and role-scoped queries
complaintSchema.index({ constituencyId: 1, status: 1 });
complaintSchema.index({ citizenId: 1, createdAt: -1 });

module.exports = mongoose.model("Complaint", complaintSchema);
module.exports.COMPLAINT_STATUSES = COMPLAINT_STATUSES;
module.exports.COMPLAINT_PRIORITIES = COMPLAINT_PRIORITIES;
