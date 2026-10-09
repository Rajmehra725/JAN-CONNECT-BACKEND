const mongoose = require("mongoose");

const complaintUpdateSchema = new mongoose.Schema(
  {
    complaintId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorRole: {
      type: String,
      required: true,
    },
    statusBefore: {
      type: String,
    },
    statusAfter: {
      type: String,
    },
    updateText: {
      type: String,
      required: [true, "प्रगति विवरण अथवा टिप्पणी आवश्यक है"],
      trim: true,
      maxlength: 2000,
    },
    // True = Private staff note. NEVER returned to citizens!
    isInternal: {
      type: Boolean,
      default: false,
      index: true,
    },
    attachments: [
      {
        assetId: String,
        url: String,
        resourceType: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ComplaintUpdate", complaintUpdateSchema);
