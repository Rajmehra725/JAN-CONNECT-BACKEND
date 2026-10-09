const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "कार्यक्रम शीर्षक आवश्यक है"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "कार्यक्रम विवरण आवश्यक है"],
      trim: true,
      maxlength: 3000,
    },
    eventDate: {
      type: Date,
      required: [true, "कार्यक्रम तिथि आवश्यक है"],
      index: true,
    },
    venue: {
      type: String,
      required: [true, "कार्यक्रम स्थान आवश्यक है"],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    coverPhotoUrl: {
      type: String,
      default: null,
    },
    constituencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
