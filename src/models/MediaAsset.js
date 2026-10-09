const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
  {
    cloudinaryAssetId: {
      type: String,
      required: true,
      index: true,
    },
    publicId: {
      type: String,
      required: true,
      index: true,
    },
    secureUrl: {
      type: String,
      required: true,
    },
    resourceType: {
      type: String,
      enum: ["image", "video", "raw"],
      default: "image",
    },
    format: {
      type: String,
    },
    fileSize: {
      type: Number, // in bytes
    },
    uploadedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    relatedRecordType: {
      type: String,
      enum: ["PROFILE", "COMPLAINT", "TASK", "EVENT", "NOTICE", "ATTENDANCE", "GENERAL"],
      default: "GENERAL",
      index: true,
    },
    relatedRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    purpose: {
      type: String,
      trim: true,
    },
    accessClassification: {
      type: String,
      enum: ["PUBLIC", "RESTRICTED", "PRIVATE"],
      default: "RESTRICTED",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
