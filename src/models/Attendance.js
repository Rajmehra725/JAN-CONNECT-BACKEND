const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    attendanceDate: {
      type: String, // Stored as YYYY-MM-DD for deterministic single-day uniqueness
      required: true,
      index: true,
    },
    checkInTime: {
      type: Date,
      required: true,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"],
      default: "PRESENT",
      index: true,
    },
    fieldActivity: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    location: {
      type: String,
      trim: true,
    },
    photoEvidenceUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate attendance for the same worker and date
attendanceSchema.index({ workerId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
