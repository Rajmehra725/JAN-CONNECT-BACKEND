const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "सूचना शीर्षक आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, "सूचना सामग्री आवश्यक है"],
      trim: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      default: "सामान्य सूचना",
      trim: true,
      index: true,
    },
    noticeType: {
      type: String,
      default: "सार्वजनिक",
      trim: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isImportant: {
      type: Boolean,
      default: false,
      index: true,
    },
    attachmentUrl: {
      type: String,
      default: null,
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

module.exports = mongoose.model("Notice", noticeSchema);
