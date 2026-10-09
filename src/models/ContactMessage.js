const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "नाम आवश्यक है"],
      trim: true,
      maxlength: 120,
    },
    mobile: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      required: [true, "विषय आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, "संदेश आवश्यक है"],
      trim: true,
      maxlength: 4000,
    },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "RESPONDED", "CLOSED"],
      default: "NEW",
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    internalNotes: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
